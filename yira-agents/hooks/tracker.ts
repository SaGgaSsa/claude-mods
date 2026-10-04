import type { AgentRunStatus, Subtask, SubtaskStatus, TrackedAgent } from '../types'

export type CodexCommand = {
  model: string | null
  effort?: string
  fast: boolean
  resumed: boolean
}

export type TaskNotification = {
  taskId: string
  toolUseId?: string
  outputFile?: string
  status: Exclude<AgentRunStatus, 'running'>
  summary?: string
  durationMs?: number
}

type TaskUpdate = {
  taskId: string
  subject?: string
  activeForm?: string
  status?: SubtaskStatus | 'deleted'
}

const shellSegments = (command: string): string[][] => {
  const segments: string[][] = []
  let tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  const flushToken = () => {
    if (!token) return
    tokens.push(token)
    token = ''
  }

  const flushSegment = () => {
    flushToken()
    if (tokens.length > 0) segments.push(tokens)
    tokens = []
  }

  for (let index = 0; index < command.length; index++) {
    const character = command[index]!
    const next = command[index + 1]

    if (quote === "'") {
      if (character === quote) quote = null
      else token += character
      continue
    }

    if (escaped) {
      token += character
      escaped = false
      continue
    }

    if (quote === '"') {
      if (character === '"') quote = null
      else if (character === '\\' && next && /[\\"\s]/.test(next)) escaped = true
      else token += character
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '\\' && next && /[\\"'\s;&|]/.test(next)) {
      escaped = true
    } else if (/\s/.test(character)) {
      flushToken()
    } else if (character === ';' || character === '|' || character === '&') {
      flushSegment()
      if (next === character && (character === '|' || character === '&')) index++
    } else {
      token += character
    }
  }

  flushSegment()
  return segments
}

const executableName = (value: string): string => {
  const parts = value.split(/[\\/]/)
  return (parts[parts.length - 1] ?? value).toLowerCase()
}

const assignmentCount = (tokens: readonly string[]): number => {
  let count = 0
  while (count < tokens.length && /^[A-Za-z_][A-Za-z\d_]*=/.test(tokens[count]!)) count++
  return count
}

const configValue = (value: string): string | undefined => {
  const equals = value.indexOf('=')
  return equals < 0 ? undefined : value.slice(equals + 1)
}

export const parseCodexCommand = (command: string): CodexCommand | null => {
  for (const segment of shellSegments(command)) {
    const prefix = assignmentCount(segment)
    const launcher = executableName(segment[prefix] ?? '')
    let codexIndex = -1

    if (launcher === 'codex' || launcher === 'codex.cmd' || launcher === 'codex.exe') {
      codexIndex = prefix
    } else if (launcher === 'npx' || launcher === 'npx.cmd') {
      codexIndex = segment.findIndex((token, index) =>
        index > prefix && ['codex', 'codex.cmd', 'codex.exe'].includes(executableName(token)),
      )
    }

    if (codexIndex < 0) continue
    const execIndex = segment.findIndex((token, index) => index > codexIndex && token === 'exec')
    if (execIndex < 0) continue

    let model: string | null = null
    let effort: string | undefined
    let fast = false

    for (let index = execIndex + 1; index < segment.length; index++) {
      const token = segment[index]!

      if (token === '-m' || token === '--model') {
        model = segment[index + 1] ?? null
        index++
      } else if (token.startsWith('--model=')) {
        model = token.slice('--model='.length)
      } else if (token.startsWith('-m=')) {
        model = token.slice(3)
      } else if (token === '-c' || token === '--config') {
        const value = segment[index + 1]
        if (value) {
          if (value.startsWith('model_reasoning_effort=')) {
            effort = configValue(value)
          } else if (value.startsWith('service_tier=')) {
            fast = configValue(value) === 'fast'
          }
        }
        index++
      } else if (token.startsWith('-c=')) {
        const value = token.slice(3)
        if (value.startsWith('model_reasoning_effort=')) effort = configValue(value)
        if (value.startsWith('service_tier=')) fast = configValue(value) === 'fast'
      } else if (token.startsWith('--config=')) {
        const value = token.slice('--config='.length)
        if (value.startsWith('model_reasoning_effort=')) effort = configValue(value)
        if (value.startsWith('service_tier=')) fast = configValue(value) === 'fast'
      }
    }

    return {
      model: model || null,
      ...(effort ? { effort } : {}),
      fast,
      resumed: segment[execIndex + 1] === 'resume',
    }
  }

  return null
}

const tagValue = (source: string, tag: string): string | undefined => {
  const match = source.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))
  return match?.[1]?.trim()
}

const notificationStatus = (source: string): TaskNotification['status'] | undefined => {
  const value = tagValue(source, 'status')?.toLowerCase()
  if (value !== 'completed' && value !== 'failed' && value !== 'killed') return undefined

  const summary = tagValue(source, 'summary')
  const exitCode = summary?.match(/\(exit code\s+(-?\d+)\)/i)
  return exitCode && Number(exitCode[1]) !== 0 ? 'failed' : value
}

export const parseTaskNotifications = (source: string): TaskNotification[] => {
  const notifications: TaskNotification[] = []
  const blocks = source.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/gi)

  for (const block of blocks) {
    const body = block[1] ?? ''
    const taskId = tagValue(body, 'task-id')
    const status = notificationStatus(body)
    if (!taskId || !status) continue

    const duration = tagValue(body, 'duration_ms')
    const durationMs = duration === undefined ? undefined : Number(duration)
    const summary = tagValue(body, 'summary')
    const toolUseId = tagValue(body, 'tool-use-id')
    const outputFile = tagValue(body, 'output-file')

    notifications.push({
      taskId,
      status,
      ...(toolUseId ? { toolUseId } : {}),
      ...(outputFile ? { outputFile } : {}),
      ...(summary ? { summary } : {}),
      ...(durationMs !== undefined && Number.isFinite(durationMs) ? { durationMs } : {}),
    })
  }

  return notifications
}

export const replaceTodos = (
  todos: readonly { content: string; status: SubtaskStatus; activeForm: string }[],
): Subtask[] => todos.map((todo, index) => ({
  id: `todo-${index}`,
  subject: todo.content,
  activeForm: todo.activeForm,
  status: todo.status,
}))

export const createSubtask = (
  subtasks: readonly Subtask[],
  task: { id: string; subject: string; activeForm?: string },
): Subtask[] => {
  const next: Subtask = {
    id: task.id,
    subject: task.subject,
    ...(task.activeForm ? { activeForm: task.activeForm } : {}),
    status: 'pending',
  }
  return [...subtasks.filter(subtask => subtask.id !== task.id), next]
}

export const updateSubtask = (
  subtasks: readonly Subtask[],
  change: TaskUpdate,
): Subtask[] => {
  if (change.status === 'deleted') {
    return subtasks.filter(subtask => subtask.id !== change.taskId)
  }

  const status = change.status
  return subtasks.map(subtask => subtask.id !== change.taskId ? subtask : {
    ...subtask,
    ...(change.subject === undefined ? {} : { subject: change.subject }),
    ...(change.activeForm === undefined ? {} : { activeForm: change.activeForm }),
    ...(status === undefined ? {} : { status }),
  })
}

export const clearCompletedSubtasks = (subtasks: readonly Subtask[]): Subtask[] =>
  subtasks.filter(subtask => subtask.status !== 'completed')

export const upsertAgent = (
  agents: readonly TrackedAgent[],
  agent: TrackedAgent,
  now: number,
): TrackedAgent[] => pruneAgents([...agents.filter(item => item.id !== agent.id), agent], now)

export const replaceAgent = (
  agents: readonly TrackedAgent[],
  oldId: string,
  agent: TrackedAgent,
  now: number,
): TrackedAgent[] => pruneAgents([
  ...agents.filter(item => item.id !== oldId && item.id !== agent.id),
  agent,
], now)

export const finishAgent = (
  agents: readonly TrackedAgent[],
  id: string,
  status: Exclude<AgentRunStatus, 'running'>,
  endedAt: number,
): TrackedAgent[] => agents.map(agent =>
  agent.id !== id || agent.status !== 'running'
    ? agent
    : { ...agent, status, endedAt },
)

export const completeAgentFromNotification = (
  agents: readonly TrackedAgent[],
  id: string,
  notification: TaskNotification,
  now: number,
  outputMtime?: number,
): TrackedAgent[] => {
  const agent = agents.find(item => item.id === id)
  if (!agent || agent.status !== 'running') return [...agents]

  const endedAt = agent.kind === 'claude'
    ? notification.durationMs === undefined
      ? now
      : agent.startedAt + notification.durationMs
    : outputMtime !== undefined && outputMtime >= agent.startedAt
      ? Math.min(outputMtime, now)
      : now

  return finishAgent(agents, id, notification.status, endedAt)
}

export const restartAgent = (
  agents: readonly TrackedAgent[],
  id: string,
  startedAt: number,
): TrackedAgent[] => agents.map(agent =>
  agent.id !== id || agent.status === 'running'
    ? agent
    : { ...agent, status: 'running', startedAt, endedAt: undefined },
)

export const pruneAgents = (
  agents: readonly TrackedAgent[],
  now: number,
): TrackedAgent[] => {
  const recent = agents.filter(agent =>
    agent.status === 'running' || agent.endedAt === undefined || now - agent.endedAt <= 600_000,
  )
  if (recent.length <= 20) return [...recent]

  const removable = recent
    .filter(agent => agent.status !== 'running')
    .sort((left, right) => (left.endedAt ?? left.startedAt) - (right.endedAt ?? right.startedAt))
  const removeIds = new Set(removable.slice(0, recent.length - 20).map(agent => agent.id))
  return recent.filter(agent => !removeIds.has(agent.id))
}

export const formatModel = (model: string): string => {
  const short = model.match(/^claude-(sonnet|opus|haiku)-(\d+)-(\d+)(?:-.*)?$/i)
  if (!short) return model.toUpperCase()
  return `${short[1]!.toUpperCase()} ${short[2]}.${short[3]}`
}

export const formatAgentMeta = (agent: TrackedAgent): string => {
  const parts = agent.kind === 'claude'
    ? [agent.model ? formatModel(agent.model) : 'CLAUDE']
    : [
      agent.model ? agent.model.toUpperCase() : 'CODEX',
      ...(agent.effort ? [agent.effort.toUpperCase()] : []),
      ...(agent.fast ? ['FAST'] : []),
    ]

  if (agent.resumed) parts.push('RESUME')
  return parts.join(' · ')
}

export const formatElapsed = (elapsedMs: number): string => {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const hours = Math.floor(minutes / 60)
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
