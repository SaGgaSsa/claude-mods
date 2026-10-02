import type { ClientModule } from 'claude-code'

import type { BoardMessage, BoardProps } from '../types'

// Colors: theme-independent ANSI names.
const LINE = 'gray'
const GIVEN = 'cyan'
const CURSOR = 'yellow'
const CLASH = 'red'

// The board is 39 columns by 17 rows, so it reads about square in a terminal:
// cells are 3 wide with a 1-column gap, boxes 11 wide joined by ' │ '.
const BOX_WIDTH = 11
const BOX_STRIDE = BOX_WIDTH + 3
const SPACER = [0, 1, 2].map(() => ' '.repeat(BOX_WIDTH)).join(' │ ')
const SEPARATOR = [0, 1, 2].map(() => '─'.repeat(BOX_WIDTH)).join('─┼─')

const MOVES: Record<string, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
  w: [-1, 0],
  s: [1, 0],
  a: [0, -1],
  d: [0, 1],
}

const CLEAR_KEYS = new Set(['0', 'backspace', 'delete', ' '])

// Board row on screen y, or -1 for a box separator: rows sit on even lines,
// each box takes 6 lines (3 rows, 2 spacers, 1 separator).
const rowAt = (y: number): number => {
  const line = y % 6
  if (y < 0 || y > 16 || line === 5) return -1
  return Math.floor(y / 6) * 3 + Math.min(2, Math.round(line / 2))
}

const colAt = (x: number): number => {
  const box = Math.floor(x / BOX_STRIDE)
  const within = x - box * BOX_STRIDE
  if (box < 0 || box > 2 || within >= BOX_WIDTH) return -1
  return box * 3 + Math.floor(within / 4)
}

const Board: ClientModule<BoardProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  const send = (message: BoardMessage) => surface.post(message)

  surface.onKey(event => {
    const move = MOVES[event.key]
    if (move) return send({ type: 'move', rows: move[0], cols: move[1] })
    if (/^[1-9]$/.test(event.key)) return send({ type: 'digit', digit: Number(event.key) })
    if (CLEAR_KEYS.has(event.key)) return send({ type: 'digit', digit: 0 })
  })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const row = rowAt(event.y)
    const col = colAt(event.x)
    if (row >= 0 && col >= 0) send({ type: 'select', index: row * 9 + col })
  })

  const clashes = new Set(props.clashes)

  const cell = (index: number) => {
    const digit = props.board[index] ?? '0'
    const shown = ` ${digit === '0' ? '·' : digit} `
    const isClash = clashes.has(index)

    if (index === props.cursor) {
      return (
        <Text bold color="black" backgroundColor={isClash ? CLASH : CURSOR}>
          {shown}
        </Text>
      )
    }
    if (props.puzzle[index] !== '0') {
      return <Text bold color={isClash ? CLASH : GIVEN}>{shown}</Text>
    }
    if (digit === '0') return <Text dimColor>{shown}</Text>
    return <Text color={isClash ? CLASH : undefined}>{shown}</Text>
  }

  const row = (r: number) => (
    <Box flexDirection="row">
      {[0, 1, 2].map(b => (
        <Box flexDirection="row">
          {b > 0 && <Text color={LINE}> │ </Text>}
          <Box flexDirection="row" columnGap={1}>
            {[0, 1, 2].map(c => cell(r * 9 + b * 3 + c))}
          </Box>
        </Box>
      ))}
    </Box>
  )

  const spacer = () => <Text color={LINE}>{SPACER}</Text>
  const separator = () => <Text color={LINE}>{SEPARATOR}</Text>

  return (
    <Box flexDirection="column">
      {row(0)}{spacer()}{row(1)}{spacer()}{row(2)}
      {separator()}
      {row(3)}{spacer()}{row(4)}{spacer()}{row(5)}
      {separator()}
      {row(6)}{spacer()}{row(7)}{spacer()}{row(8)}
    </Box>
  )
}

export default Board
