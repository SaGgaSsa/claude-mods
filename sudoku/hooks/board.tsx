import type { ClientModule } from 'claude-code'

import type { BoardMessage, BoardProps } from '../types'

const PAPER = '#f7ecd0'
const FINE_LINE = '#c9b48a'
const WOOD = '#5b3a1e'
const GIVEN = '#2b1d0e'
const PLAYER = '#7a6a58'
const CURSOR = '#e2a93b'
const MATCH = '#f3d77e'
const CLASH = '#b03a2e'
const CLASH_BACKGROUND = '#edb0a8'

const FRAME = 1
const BOX_WIDTH = 11
const BOX_STRIDE = BOX_WIDTH + 3
const CELL_STRIDE = 4
const BOARD_HEIGHT = 17
const SEGMENTS = [0, 1, 2]
// Joints meet the fine '│' inside a block and the heavy '┃' between blocks.
const ROW_SEPARATOR = SEGMENTS.map(() => '───┼───┼───').join('─╂─')
const BLOCK_SEPARATOR = SEGMENTS.map(() => '━━━┿━━━┿━━━').join('━╋━')

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

// The framed board is 41 by 19; its inner grid is 39 by 17.
const rowAt = (screenY: number): number => {
  const y = screenY - FRAME
  const line = y % 6
  if (y < 0 || y >= BOARD_HEIGHT || line === 5) return -1
  return Math.floor(y / 6) * 3 + Math.min(2, Math.round(line / 2))
}

const colAt = (screenX: number): number => {
  const x = screenX - FRAME
  const box = Math.floor(x / BOX_STRIDE)
  const within = x - box * BOX_STRIDE
  if (box < 0 || box > 2 || within >= BOX_WIDTH) return -1
  return box * 3 + Math.floor(within / CELL_STRIDE)
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
  const selectedDigit = props.board[props.cursor] ?? '0'

  const cell = (index: number) => {
    const digit = props.board[index] ?? '0'
    const isGiven = props.puzzle[index] !== '0'
    const isCursor = index === props.cursor
    const isMatch = digit !== '0' && digit === selectedDigit
    const isClash = clashes.has(index)
    const backgroundColor = isCursor
      ? isClash ? CLASH_BACKGROUND : CURSOR
      : isMatch ? MATCH : PAPER
    const color = isClash ? CLASH : isGiven ? GIVEN : digit === '0' ? FINE_LINE : PLAYER

    return (
      <Text bold={isCursor || isGiven} color={color} backgroundColor={backgroundColor}>
        {` ${digit === '0' ? ' ' : digit} `}
      </Text>
    )
  }

  const row = (r: number) => (
    <Box key={`row:${r}`} flexDirection="row" backgroundColor={PAPER}>
      {SEGMENTS.map(b => (
        <Box key={`block:${r}:${b}`} flexDirection="row" backgroundColor={PAPER}>
          {b > 0 && <Text color={WOOD} backgroundColor={PAPER}> ┃ </Text>}
          <Box flexDirection="row" backgroundColor={PAPER}>
            {cell(r * 9 + b * 3)}
            <Text color={FINE_LINE} backgroundColor={PAPER}>│</Text>
            {cell(r * 9 + b * 3 + 1)}
            <Text color={FINE_LINE} backgroundColor={PAPER}>│</Text>
            {cell(r * 9 + b * 3 + 2)}
          </Box>
        </Box>
      ))}
    </Box>
  )

  const separator = (block: boolean) => (
    <Text color={block ? WOOD : FINE_LINE} backgroundColor={PAPER}>
      {block ? BLOCK_SEPARATOR : ROW_SEPARATOR}
    </Text>
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="bold"
      borderColor={WOOD}
      backgroundColor={PAPER}
    >
      {row(0)}
      {separator(false)}
      {row(1)}
      {separator(false)}
      {row(2)}
      {separator(true)}
      {row(3)}
      {separator(false)}
      {row(4)}
      {separator(false)}
      {row(5)}
      {separator(true)}
      {row(6)}
      {separator(false)}
      {row(7)}
      {separator(false)}
      {row(8)}
    </Box>
  )
}

export default Board
