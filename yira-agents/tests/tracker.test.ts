import { expect, test } from 'claude-code/testing'

import type { Subtask, TrackedAgent } from '../types'
import {
  completeAgentFromNotification,
  createSubtask,
  formatAgentMeta,
  formatElapsed,
  formatModel,
  parseCodexCommand,
  parseTaskNotifications,
  replaceTodos,
  updateSubtask,
} from '../hooks/tracker'

test('parses Codex commands with model, effort, fast mode, and resume', () => {
  const foreground = parseCodexCommand(
    'codex exec -m gpt-6-luna -c model_reasoning_effort=max ' +
    '-c service_tier=fast -s read-only --json -C C:/repo -o C:/repo/result.md - < C:/repo/task.md',
  )
  expect(foreground).toEqual({
    model: 'gpt-6-luna',
    effort: 'max',
    fast: true,
    resumed: false,
  })

  const resumed = parseCodexCommand(
    'cd C:/repo && codex exec resume 019a123 -m gpt-6-luna ' +
    '-c model_reasoning_effort=max -c service_tier=fast --json "continue" < /dev/null',
  )
  expect(resumed).toEqual({
    model: 'gpt-6-luna',
    effort: 'max',
    fast: true,
    resumed: true,
  })
})

test('recognizes supported Codex launchers without matching incidental text', () => {
  expect(parseCodexCommand('git status')).toBeNull()
  expect(parseCodexCommand('echo codex')).toBeNull()
  expect(parseCodexCommand('npx.cmd codex exec -m gpt-6-luna')?.model).toBe('gpt-6-luna')
  expect(parseCodexCommand('codex.cmd exec -m gpt-6-luna')?.model).toBe('gpt-6-luna')
})

test('parses more than one queued background notification', () => {
  const notifications = parseTaskNotifications(`
    <task-notification>
      <task-id>agent-a</task-id>
      <tool-use-id>tool-a</tool-use-id>
      <status>completed</status>
      <summary>Agent completed</summary>
      <usage><duration_ms>3133</duration_ms></usage>
    </task-notification>
    <task-notification>
      <task-id>task-b</task-id>
      <output-file>C:\\tasks\\task-b.output</output-file>
      <status>completed</status>
      <summary>Background command finished (exit code 4)</summary>
    </task-notification>
  `)

  expect(notifications).toHaveLength(2)
  expect(notifications[0]).toEqual({
    taskId: 'agent-a',
    toolUseId: 'tool-a',
    status: 'completed',
    summary: 'Agent completed',
    durationMs: 3133,
  })
  expect(notifications[1]).toEqual({
    taskId: 'task-b',
    outputFile: 'C:\\tasks\\task-b.output',
    status: 'failed',
    summary: 'Background command finished (exit code 4)',
  })
})

test('settles background agents from notification timing and preserves earlier stops', () => {
  const codex: TrackedAgent = {
    id: 'task-codex',
    kind: 'codex',
    label: 'Run Codex',
    model: 'gpt-6-luna',
    status: 'running',
    startedAt: 1_000,
  }
  const codexNotification = parseTaskNotifications(
    '<task-notification><task-id>task-codex</task-id><status>completed</status>' +
    '</task-notification>',
  )[0]!
  const codexDone = completeAgentFromNotification(
    [codex],
    codex.id,
    codexNotification,
    8_000,
    6_500,
  )[0]!
  expect(codexDone.status).toBe('completed')
  expect(codexDone.endedAt).toBe(6_500)

  const claude: TrackedAgent = {
    id: 'agent-claude',
    kind: 'claude',
    label: 'Inspect code',
    model: 'claude-sonnet-5-5',
    status: 'running',
    startedAt: 10_000,
  }
  const claudeNotification = parseTaskNotifications(
    '<task-notification><task-id>agent-claude</task-id><status>completed</status>' +
    '<usage><duration_ms>3133</duration_ms></usage></task-notification>',
  )[0]!
  const claudeDone = completeAgentFromNotification(
    [claude],
    claude.id,
    claudeNotification,
    20_000,
  )[0]!
  expect(claudeDone.endedAt).toBe(13_133)

  const stopped: TrackedAgent = { ...claudeDone, endedAt: 12_000 }
  const unchanged = completeAgentFromNotification(
    [stopped],
    stopped.id,
    claudeNotification,
    20_000,
  )[0]!
  expect(unchanged.endedAt).toBe(12_000)
})

test('formats elapsed time and concise Claude model names', () => {
  expect(formatElapsed(0)).toBe('00:00')
  expect(formatElapsed(65_000)).toBe('01:05')
  expect(formatElapsed(3_725_000)).toBe('1:02:05')
  expect(formatModel('claude-sonnet-5-5')).toBe('SONNET 5.5')
  expect(formatModel('claude-opus-5-5')).toBe('OPUS 5.5')
  expect(formatModel('claude-haiku-4-5-20251001')).toBe('HAIKU 4.5')
  expect(formatModel('custom-model')).toBe('CUSTOM-MODEL')

  const resumed: TrackedAgent = {
    id: 'codex-resume',
    kind: 'codex',
    label: 'Continue Codex',
    model: 'gpt-6-luna',
    effort: 'max',
    fast: true,
    resumed: true,
    status: 'running',
    startedAt: 0,
  }
  expect(formatAgentMeta(resumed)).toBe('GPT-6-LUNA · MAX · FAST · RESUME')
  expect(formatAgentMeta({ ...resumed, model: null, effort: undefined, fast: false }))
    .toBe('CODEX · RESUME')
})

test('reduces TodoWrite and TaskUpdate changes, including deleted tasks', () => {
  const todos = replaceTodos([
    { content: 'Inspect hooks', status: 'in_progress', activeForm: 'Inspecting hooks' },
    { content: 'Write tests', status: 'pending', activeForm: 'Writing tests' },
  ])
  expect(todos).toEqual([
    {
      id: 'todo-0',
      subject: 'Inspect hooks',
      activeForm: 'Inspecting hooks',
      status: 'in_progress',
    },
    {
      id: 'todo-1',
      subject: 'Write tests',
      activeForm: 'Writing tests',
      status: 'pending',
    },
  ] satisfies Subtask[])

  const created = createSubtask(todos, {
    id: 'task-3',
    subject: 'Update UI',
    activeForm: 'Updating UI',
  })
  const updated = updateSubtask(created, {
    taskId: 'task-3',
    subject: 'Polish UI',
    status: 'completed',
  })
  expect(updated.find(task => task.id === 'task-3')).toEqual({
    id: 'task-3',
    subject: 'Polish UI',
    activeForm: 'Updating UI',
    status: 'completed',
  })

  expect(updateSubtask(updated, { taskId: 'todo-1', status: 'deleted' }))
    .toEqual(updated.filter(task => task.id !== 'todo-1'))
})
