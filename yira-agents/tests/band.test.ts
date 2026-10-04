import { expect, mock, test } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
}) as const

const childrenOf = (node: RenderNode): RenderNode[] => {
  if (typeof node === 'string' || !('children' in node)) return []
  return node.children ?? []
}

const textOf = (node: RenderNode): string =>
  typeof node === 'string' ? node : childrenOf(node).map(textOf).join('')

const treeText = (tree: RenderElement): string => textOf(tree)

const expectBodyDirection = (tree: RenderElement, direction: 'row' | 'column') => {
  const body = childrenOf(tree)[1]
  if (!body || typeof body === 'string' || !('props' in body)) {
    throw new Error('Expected the band body container')
  }
  const props: Record<string, unknown> = body.props ?? {}
  expect(props.flexDirection).toBe(direction)
}

test('renders and tracks Claude and Codex agents, including narrow layout and clear', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('classic.SubagentStop', () => ({}))
  on('tool.call', { tool: 'Bash' }, () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' },
  }))
  on('tool.call', { tool: 'TaskStop' }, () => ({
    result: { message: 'Stopped', task_id: 'bg1', task_type: 'shell' },
  }))
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: { oldTodos: [] } }))

  const mount = (bodyColumns: number) => $.ui.mount({
    plugin: 'yira-agents',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: bandProps(bodyColumns),
  })

  const wide = await mount(100)
  expect(treeText(await wide.drawn())).toContain('Engine output')
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{
      content: 'Inspect hooks',
      status: 'in_progress',
      activeForm: 'Inspecting hooks',
    }],
  })

  await $.agent.spawn({
    tool_use_id: 'toolu_spawn',
    prompt: 'Review the hooks',
    description: 'Review hooks',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    model: 'sonnet',
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await clock.advance(65_000)
  await $.classic.SubagentStop({
    agent_id: 'a1',
    agent_transcript_path: '',
    agent_type: 'general-purpose',
    stop_hook_active: false,
  })

  let wideText = treeText(await wide.drawn())
  expectBodyDirection(await wide.drawn(), 'row')
  expect(wideText).toContain('SUBTAREAS 0/1')
  expect(wideText).toContain('Inspecting hooks')
  expect(wideText).toContain('SONNET 5.5')
  expect(wideText).toContain('01:05')
  expect(wideText).toContain('SUBTAREAS')
  expect(wideText).toContain('SUBAGENTES')

  await $.tool.call({
    tool: 'Bash',
    command: 'codex exec -m gpt-6-luna -c model_reasoning_effort=max -c service_tier=fast --json',
    description: 'Run Codex review',
    run_in_background: true,
  })
  await clock.advance(40_000)
  wideText = treeText(await wide.drawn())
  expect(wideText).toContain('GPT-6-LUNA · MAX · FAST')
  expect(wideText).toContain('00:40')
  expect(wideText).toContain('SUBAGENTES 1 ACTIVO')

  await $.tool.call({ tool: 'TaskStop', task_id: 'bg1' })
  await clock.advance(61_000)
  wideText = treeText(await wide.drawn())
  expect(wideText).toContain('00:40')
  expect(wideText).toContain('SUBAGENTES SIN ACTIVOS')
  expect(wideText).toContain('✕')

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [{ content: 'Inspect hooks', status: 'completed', activeForm: 'Inspected hooks' }],
  })

  const narrow = await mount(60)
  const narrowTree = await narrow.drawn()
  const narrowText = treeText(narrowTree)
  expectBodyDirection(narrowTree, 'column')
  expect(narrowText).toContain('SUBTAREAS')
  expect(narrowText).toContain('SUBAGENTES')

  await narrow.press({ key: 'clear' })
  expect(treeText(await narrow.drawn())).toContain('Engine output')
  await narrow.unmount()
  await wide.unmount()
})
