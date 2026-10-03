import type { ClientModule } from 'claude-code'

import type { BoardAction, BoardMessage, BoardProps } from '../types'
import { desktopCellAt } from './desktop-shared'
import { CLASH, CLASH_BACKGROUND, CURSOR, GIVEN, MATCH, PAPER, PAPER_ALT, PLAYER, WOOD } from './palette'

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

const Board: ClientModule<BoardProps> = (props, surface) => {
  const { Box, Text } = surface.elements
  const send = (action: BoardAction) =>
    surface.post({ ...action, geometry: props.geometry } satisfies BoardMessage)

  surface.onKey(event => {
    const move = MOVES[event.key]
    if (move) return send({ type: 'move', rows: move[0], cols: move[1] })
    if (/^[1-9]$/.test(event.key)) return send({ type: 'digit', digit: Number(event.key) })
    if (CLEAR_KEYS.has(event.key)) return send({ type: 'digit', digit: 0 })
    if (event.key === 'n') return send({ type: 'new' })
    send({ type: 'input' })
  })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const index = desktopCellAt(props.geometry, event.x, event.y)
    send(index === null ? { type: 'input' } : { type: 'select', index })
  })

  const clashes = new Set(props.clashes)
  const selectedDigit = props.board[props.cursor] ?? '0'

  return (
    <Box flexDirection="column" padding={1} backgroundColor={WOOD}>
      {Array.from({ length: 9 }, (_, row) => (
        <Box key={`row:${row}`} flexDirection="row" alignItems="stretch">
          {Array.from({ length: 9 }, (_, col) => {
            const index = row * 9 + col
            const digit = props.board[index] ?? '0'
            const isGiven = props.puzzle[index] !== '0'
            const isClash = clashes.has(index)
            const blockBackground = (Math.floor(row / 3) + Math.floor(col / 3)) % 2 === 0
              ? PAPER
              : PAPER_ALT
            const backgroundColor = index === props.cursor
              ? isClash ? CLASH_BACKGROUND : CURSOR
              : digit !== '0' && digit === selectedDigit ? MATCH : blockBackground
            const color = isClash ? CLASH : isGiven ? GIVEN : PLAYER
            const marginRight = col === 2 || col === 5 ? 2 : col === 8 ? 0 : 1
            const marginBottom = row === 2 || row === 5 ? 2 : row === 8 ? 0 : 1

            return (
              <Box
                key={`cell:${index}`}
                width={props.geometry.cellWidth}
                height={props.geometry.cellHeight}
                flexShrink={0}
                marginRight={marginRight}
                marginBottom={marginBottom}
                alignItems="center"
                justifyContent="center"
                backgroundColor={backgroundColor}
              >
                <Text color={color} bold={isGiven || index === props.cursor}>
                  {digit === '0' ? ' ' : digit}
                </Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

export default Board
