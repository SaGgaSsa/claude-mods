// A step of the session's task list (TaskCreate/TaskUpdate, or TodoWrite).
export type SubtaskStatus = 'pending' | 'in_progress' | 'completed'

export type Subtask = {
  id: string
  subject: string
  // Present continuous label shown while in progress ("Running tests").
  activeForm?: string
  status: SubtaskStatus
}

// Who runs the delegated work: a Claude subagent (Agent tool) or a Codex
// process started from a Bash `codex exec` command.
export type AgentKind = 'claude' | 'codex'

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'killed'

export type TrackedAgent = {
  // Claude: the agentId. Codex: the backgroundTaskId, or the Bash
  // tool_use_id while it runs in the foreground.
  id: string
  kind: AgentKind
  // The Agent call's description, or the Bash call's description.
  label: string
  // Full model id as reported (`claude-sonnet-5-5`, `gpt-6-luna`); null when
  // the command did not name one.
  model: string | null
  // Codex only: `-c model_reasoning_effort=<level>`.
  effort?: string
  // Codex only: `-c service_tier=fast`.
  fast?: boolean
  // Codex only: the command was `codex exec resume <id>`.
  resumed?: boolean
  status: AgentRunStatus
  // Milliseconds since the epoch.
  startedAt: number
  endedAt?: number
  // The Agent loop that spawned it; absent when the main loop did.
  parentId?: string
}

declare module 'claude-code' {
  interface PluginState {
    'yira-agents': {
      subtasks: Subtask[]
      agents: TrackedAgent[]
      // Last clock tick while an agent runs; the band reads it so elapsed
      // times redraw every second.
      now: number
    }
  }
}
