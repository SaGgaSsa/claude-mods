import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { TrackedAgent } from '../types'
import { buildBand } from './band'
import {
  clearCompletedSubtasks,
  completeAgentFromNotification,
  createSubtask,
  finishAgent,
  parseCodexCommand,
  parseTaskNotifications,
  pruneAgents,
  replaceAgent,
  replaceTodos,
  restartAgent,
  updateSubtask,
  upsertAgent,
} from './tracker'

const subtasksAtom = atom({ plugin: 'yira-agents', key: 'subtasks' } as const, [])
const agentsAtom = atom({ plugin: 'yira-agents', key: 'agents' } as const, [])
const nowAtom = atom({ plugin: 'yira-agents', key: 'now' } as const, 0)

let clockTimer: Timer | null = null
const agentByToolUseId = new Map<string, string>()

const syncClock = async ($: EngineInterface): Promise<void> => {
  const agents = await read($, agentsAtom)
  const hasRunningAgent = agents.some(agent => agent.status === 'running')

  if (hasRunningAgent && !clockTimer) {
    clockTimer = $.clock.every(1000, async () => {
      const now = await $.clock.now()
      await update($, nowAtom, () => now)
    })
  } else if (!hasRunningAgent && clockTimer) {
    clockTimer.cancel()
    clockTimer = null
  }
}

const notificationText = (content: unknown): string => {
  if (!Array.isArray(content)) return ''
  const blocks: readonly unknown[] = content
  return blocks.flatMap(block => {
    if (typeof block !== 'object' || block === null || !('type' in block)) return []
    if (block.type !== 'text' || !('text' in block) || typeof block.text !== 'string') return []
    return [block.text]
  }).join('\n')
}

const originKind = (origin: unknown): string | undefined => {
  if (typeof origin !== 'object' || origin === null || !('kind' in origin)) return undefined
  return typeof origin.kind === 'string' ? origin.kind : undefined
}

const hasNonzeroExitCode = (output: string): boolean => {
  const codes = output.matchAll(/(?:exit(?:ed)?(?:\s+with)?\s+code|exit code)\s*[:=]?\s*(-?\d+)/gi)
  for (const match of codes) {
    if (Number(match[1]) !== 0) return true
  }
  return false
}

const agentFromCodex = (
  id: string,
  label: string,
  command: NonNullable<ReturnType<typeof parseCodexCommand>>,
  startedAt: number,
): TrackedAgent => ({
  id,
  kind: 'codex',
  label,
  model: command.model,
  ...(command.effort ? { effort: command.effort } : {}),
  ...(command.fast ? { fast: true } : {}),
  ...(command.resumed ? { resumed: true } : {}),
  status: 'running',
  startedAt,
})

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, agentsAtom, agents => pruneAgents(agents, now))
    await update($, nowAtom, () => now)
    await syncClock($)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const result = await next(e)
    if (result.agentId) {
      const agent: TrackedAgent = {
        id: result.agentId,
        kind: 'claude',
        label: e.description,
        model: result.model,
        status: 'running',
        startedAt,
        ...(e.parentAgentId ? { parentId: e.parentAgentId } : {}),
      }
      agentByToolUseId.set(e.tool_use_id, result.agentId)
      await update($, agentsAtom, agents => upsertAgent(agents, agent, startedAt))
      await update($, nowAtom, () => startedAt)
      await syncClock($)
    }
    return result
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    const endedAt = await $.clock.now()
    await update($, agentsAtom, agents => finishAgent(agents, e.agent_id, 'completed', endedAt))
    await update($, nowAtom, () => endedAt)
    await syncClock($)
    return result
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const result = await next(e)
    const startedAt = await $.clock.now()
    await update($, agentsAtom, agents => restartAgent(agents, e.agent_id, startedAt))
    await update($, nowAtom, () => startedAt)
    await syncClock($)
    return result
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const codexCommand = parseCodexCommand(e.command)
    if (!codexCommand) return next(e)

    const startedAt = await $.clock.now()
    const label = e.description || 'Codex exec'
    const runningAgent = agentFromCodex(e.tool_use_id, label, codexCommand, startedAt)
    await update($, agentsAtom, agents => upsertAgent(agents, runningAgent, startedAt))
    await update($, nowAtom, () => startedAt)
    await syncClock($)

    try {
      const result = await next(e)
      const toolOutput = !result.isError && 'result' in result ? result.result : undefined
      const backgroundTaskId = toolOutput?.backgroundTaskId

      if (backgroundTaskId) {
        const backgroundAt = await $.clock.now()
        const backgroundAgent = agentFromCodex(
          backgroundTaskId,
          label,
          codexCommand,
          startedAt,
        )
        await update($, agentsAtom, agents =>
          replaceAgent(agents, e.tool_use_id, backgroundAgent, backgroundAt),
        )
        await update($, nowAtom, () => backgroundAt)
        await syncClock($)
        return result
      }

      const output = `${result.text ?? ''}\n${toolOutput?.stdout ?? ''}\n${toolOutput?.stderr ?? ''}`
      const denied = 'deny' in result && typeof result.deny === 'string'
      const failed = result.isError === true || denied || toolOutput?.interrupted === true ||
        hasNonzeroExitCode(output)
      const endedAt = await $.clock.now()
      await update($, agentsAtom, agents => finishAgent(
        agents,
        e.tool_use_id,
        failed ? 'failed' : 'completed',
        endedAt,
      ))
      await update($, nowAtom, () => endedAt)
      await syncClock($)
      return result
    } catch (error) {
      const endedAt = await $.clock.now()
      await update($, agentsAtom, agents => finishAgent(agents, e.tool_use_id, 'failed', endedAt))
      await update($, nowAtom, () => endedAt)
      await syncClock($)
      throw error
    }
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const result = await next(e)
    if (!result.isError && 'result' in result && result.result) {
      const task = result.result.task
      await update($, subtasksAtom, subtasks => createSubtask(subtasks, {
        id: task.id,
        subject: task.subject,
        ...(e.activeForm ? { activeForm: e.activeForm } : {}),
      }))
    }
    return result
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const result = await next(e)
    if (!result.isError && 'result' in result && result.result?.success) {
      await update($, subtasksAtom, subtasks => updateSubtask(subtasks, {
        taskId: e.taskId,
        ...(e.subject === undefined ? {} : { subject: e.subject }),
        ...(e.activeForm === undefined ? {} : { activeForm: e.activeForm }),
        ...(e.status === undefined ? {} : { status: e.status }),
      }))
    }
    return result
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const result = await next(e)
    if (!result.isError && 'result' in result && result.result) {
      await update($, subtasksAtom, () => replaceTodos(e.todos))
    }
    return result
  })

  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const result = await next(e)
    const id = e.task_id ?? e.shell_id
    if (id && !result.isError) {
      const endedAt = await $.clock.now()
      await update($, agentsAtom, agents => finishAgent(agents, id, 'killed', endedAt))
      await update($, nowAtom, () => endedAt)
      await syncClock($)
    }
    return result
  })

  on('session.append', async ($, e, next) => {
    const result = await next(e)
    const isNotification = originKind(e.origin) === 'task-notification'
    if (!isNotification || e.message.type !== 'attachment' || e.message.name !== 'queued_command') {
      return result
    }

    const notifications = parseTaskNotifications(notificationText(e.message.content))
    const now = await $.clock.now()

    for (const notification of notifications) {
      const mappedId = notification.toolUseId
        ? agentByToolUseId.get(notification.toolUseId)
        : undefined
      const trackedId = mappedId ?? notification.taskId
      const current = (await read($, agentsAtom)).find(agent => agent.id === trackedId)
      if (!current || current.status !== 'running') continue

      let outputMtime: number | undefined
      if (current.kind === 'codex' && notification.outputFile) {
        const stat = await $.fs.stat(notification.outputFile).catch(() => undefined)
        outputMtime = stat?.mtimeMs
      }

      await update($, agentsAtom, agents => completeAgentFromNotification(
        agents,
        trackedId,
        notification,
        now,
        outputMtime,
      ))
      await update($, nowAtom, () => now)
    }

    await syncClock($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const [subtasks, agents, now] = await Promise.all([
      read($, subtasksAtom),
      read($, agentsAtom),
      read($, nowAtom),
    ])
    if (subtasks.length === 0 && agents.length === 0) return next(e)

    await syncClock($)
    const { Box, Text, Button } = $.ui.resolve(e)
    const clear = async () => {
      await update($, agentsAtom, current => current.filter(agent => agent.status === 'running'))
      await update($, subtasksAtom, clearCompletedSubtasks)
      await syncClock($)
    }

    return buildBand({ Box, Text, Button }, {
      subtasks,
      agents,
      now,
      bodyColumns: e.props.bodyColumns,
      maxRows: e.props.maxRows,
      onClear: () => { void clear() },
    })
  })
}
