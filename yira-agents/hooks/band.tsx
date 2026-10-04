import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  RenderElement,
  TextProps,
} from 'claude-code'

import type { Subtask, TrackedAgent } from '../types'
import { formatAgentMeta, formatElapsed } from './tracker'

const GRAY = '#999999'
const DIM = '#666666'
const WHITE = '#ffffff'
const RED = '#d71921'

type BandElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

type BandProps = {
  subtasks: readonly Subtask[]
  agents: readonly TrackedAgent[]
  now: number
  bodyColumns: number
  maxRows: number
  onClear: () => void
}

type VisibleRow<T> = { kind: 'item'; item: T } | { kind: 'more'; count: number } | { kind: 'empty' }

const visibleRows = <T,>(items: readonly T[], limit: number): VisibleRow<T>[] => {
  if (limit <= 0) return []
  if (items.length === 0) return [{ kind: 'empty' }]
  if (items.length <= limit) return items.map(item => ({ kind: 'item', item }))

  const visibleItems = Math.max(0, limit - 1)
  return [
    ...items.slice(0, visibleItems).map(item => ({ kind: 'item' as const, item })),
    { kind: 'more', count: items.length - visibleItems },
  ]
}

const rowText = (row: { kind: 'empty' } | { kind: 'more'; count: number }): string => {
  if (row.kind === 'empty') return '—'
  return `+${row.count} más`
}

const orderAgents = (agents: readonly TrackedAgent[]): { agent: TrackedAgent; depth: number }[] => {
  const sorted = [...agents].sort((left, right) => {
    const leftRunning = left.status === 'running'
    const rightRunning = right.status === 'running'
    if (leftRunning !== rightRunning) return leftRunning ? -1 : 1
    const leftTime = leftRunning ? left.startedAt : left.endedAt ?? left.startedAt
    const rightTime = rightRunning ? right.startedAt : right.endedAt ?? right.startedAt
    return rightTime - leftTime
  })

  const byId = new Map(sorted.map(agent => [agent.id, agent]))
  const children = new Map<string, TrackedAgent[]>()
  const roots: TrackedAgent[] = []

  for (const agent of sorted) {
    const parent = agent.parentId ? byId.get(agent.parentId) : undefined
    if (!parent || parent.id === agent.id) {
      roots.push(agent)
      continue
    }
    const siblings = children.get(parent.id) ?? []
    siblings.push(agent)
    children.set(parent.id, siblings)
  }

  const ordered: { agent: TrackedAgent; depth: number }[] = []
  const visited = new Set<string>()
  const visit = (agent: TrackedAgent, depth: number) => {
    if (visited.has(agent.id)) return
    visited.add(agent.id)
    ordered.push({ agent, depth })
    for (const child of children.get(agent.id) ?? []) visit(child, depth + 1)
  }

  for (const root of roots) visit(root, 0)
  for (const agent of sorted) visit(agent, 0)
  return ordered
}

const subtaskHeading = (subtasks: readonly Subtask[]): string => {
  const completed = subtasks.filter(task => task.status === 'completed').length
  return `SUBTAREAS ${completed}/${subtasks.length}`
}

const agentHeading = (agents: readonly TrackedAgent[]): string => {
  const active = agents.filter(agent => agent.status === 'running').length
  if (active === 0) return 'SUBAGENTES SIN ACTIVOS'
  return `SUBAGENTES ${active} ${active === 1 ? 'ACTIVO' : 'ACTIVOS'}`
}

const drawSubtask = (
  Text: BandElements['Text'],
  subtask: Subtask,
): RenderElement => {
  const marker = subtask.status === 'in_progress' ? '●' : subtask.status === 'completed' ? '✓' : '○'
  const markerColor = subtask.status === 'in_progress' ? RED : DIM
  const labelColor = subtask.status === 'in_progress'
    ? WHITE
    : subtask.status === 'completed'
      ? DIM
      : GRAY
  const label = subtask.status === 'in_progress'
    ? subtask.activeForm ?? subtask.subject
    : subtask.subject

  return (
    <Text wrap="truncate-end">
      <Text color={markerColor}>{marker} </Text>
      <Text color={labelColor}>{label}</Text>
    </Text>
  )
}

const drawAgent = (
  elements: BandElements,
  entry: { agent: TrackedAgent; depth: number },
  now: number,
  width: number,
): RenderElement => {
  const { Box, Text } = elements
  const { agent, depth } = entry
  const running = agent.status === 'running'
  const marker = running ? '●' : agent.status === 'completed' ? '✓' : '✕'
  const markerColor = running
    ? agent.kind === 'claude' ? '#d97757' : '#8ea4ff'
    : agent.status === 'completed'
      ? '#4a9e5c'
      : RED
  const labelColor = running ? WHITE : DIM
  const timeColor = running ? WHITE : DIM
  const end = running ? now : agent.endedAt ?? now
  const prefix = depth > 0 ? `${'  '.repeat(depth - 1)}  └ ` : ''

  return (
    <Box width={width} flexDirection="row">
      <Box flexShrink={0}>
        <Text color={markerColor}>{marker} </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={1} overflow="hidden">
        <Text color={labelColor} wrap="truncate-end">{prefix}{agent.label}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={GRAY}>{`  ${formatAgentMeta(agent)}`}</Text>
        <Text color={timeColor}>{`  ${formatElapsed(end - agent.startedAt)}`}</Text>
      </Box>
    </Box>
  )
}

const drawTaskRows = (
  elements: BandElements,
  rows: readonly VisibleRow<Subtask>[],
  width: number,
): RenderElement[] => rows.map(row => {
  if (row.kind === 'empty' || row.kind === 'more') {
    return <elements.Text color={DIM} wrap="truncate-end">{rowText(row)}</elements.Text>
  }
  return <elements.Box width={width}>{drawSubtask(elements.Text, row.item)}</elements.Box>
})

const drawAgentRows = (
  elements: BandElements,
  rows: readonly VisibleRow<{ agent: TrackedAgent; depth: number }>[],
  now: number,
  width: number,
): RenderElement[] => rows.map(row => {
  if (row.kind === 'empty' || row.kind === 'more') {
    return <elements.Text color={DIM} wrap="truncate-end">{rowText(row)}</elements.Text>
  }
  return drawAgent(elements, row.item, now, width)
})

// One column: subtasks on top, agents below.
const drawColumn = (
  elements: BandElements,
  props: BandProps,
  maxRows: number,
): RenderElement => {
  const { Box, Text } = elements
  if (maxRows === 2) {
    return (
      <Box width={props.bodyColumns} flexDirection="row">
        <Text color={GRAY} bold wrap="truncate-end">{subtaskHeading(props.subtasks)}</Text>
        <Text color={DIM}> │ </Text>
        <Text color={GRAY} bold wrap="truncate-end">{agentHeading(props.agents)}</Text>
      </Box>
    )
  }

  const rowsBudget = Math.max(0, maxRows - 3)
  const taskLimit = Math.min(6, Math.ceil(rowsBudget / 2))
  const agentLimit = Math.min(6, rowsBudget - taskLimit)
  const taskRows = visibleRows(props.subtasks, taskLimit)
  const agentRows = visibleRows(orderAgents(props.agents), agentLimit)

  return (
    <Box width={props.bodyColumns} flexDirection="column">
      <Text color={GRAY} bold wrap="truncate-end">{subtaskHeading(props.subtasks)}</Text>
      {drawTaskRows(elements, taskRows, props.bodyColumns)}
      <Text color={GRAY} bold wrap="truncate-end">{agentHeading(props.agents)}</Text>
      {drawAgentRows(elements, agentRows, props.now, props.bodyColumns)}
    </Box>
  )
}

export const buildBand = (elements: BandElements, props: BandProps): RenderElement => {
  const { Box, Button } = elements
  const maxRows = Math.max(0, Math.floor(props.maxRows))
  if (maxRows === 0) return <Box />

  const hasHeader = maxRows > 1

  return (
    <Box width={props.bodyColumns} flexDirection="column" flexShrink={0}>
      <Box width={props.bodyColumns} flexDirection="row" justifyContent="flex-end">
        <Button key="clear" label="LIMPIAR" plain dimColor onPress={props.onClear} />
      </Box>
      {hasHeader ? drawColumn(elements, props, maxRows) : <Box />}
    </Box>
  )
}
