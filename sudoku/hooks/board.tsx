import type { ClientModule } from 'claude-code'

import type { BoardAction, BoardProps } from '../types'
import { geometryAtScale } from './geometry'
import {
  createCanvas,
  drawFrame,
  fillRect,
  toElement,
  writeCentered,
} from './canvas'
import {
  CLASH,
  CLASH_BACKGROUND,
  CURSOR,
  GIVEN,
  MATCH,
  PAPER,
  PAPER_ALT,
  PLAYER,
  WOOD,
} from './palette'

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
  const geometry = geometryAtScale(props.geometry.scale)
  const send = (action: BoardAction) => surface.post({ ...action, geometry: props.geometry })

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
    const index = geometry.cellAt(event.x, event.y)
    send(index === null ? { type: 'input' } : { type: 'select', index })
  })

  const canvas = createCanvas(geometry.width, geometry.height, PAPER)
  drawFrame(canvas, WOOD)
  const clashes = new Set(props.clashes)
  const selectedDigit = props.board[props.cursor] ?? '0'

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const index = row * 9 + col
      const digit = props.board[index] ?? '0'
      const isGiven = props.puzzle[index] !== '0'
      const isClash = clashes.has(index)
      const position = geometry.cellPosition(row, col)
      const blockRow = Math.floor(row / 3)
      const blockCol = Math.floor(col / 3)
      const blockBackground = (blockRow + blockCol) % 2 === 0 ? PAPER : PAPER_ALT
      const backgroundColor = index === props.cursor
        ? isClash ? CLASH_BACKGROUND : CURSOR
        : digit !== '0' && digit === selectedDigit ? MATCH : blockBackground
      const color = isClash ? CLASH : isGiven ? GIVEN : PLAYER
      const bold = isGiven || index === props.cursor

      fillRect(
        canvas,
        position.x,
        position.y,
        geometry.cellWidth,
        geometry.cellHeight,
        color,
        backgroundColor,
        ' ',
        bold,
      )

      if (digit !== '0') {
        writeCentered(
          canvas,
          digit,
          position.x,
          position.y,
          geometry.cellWidth,
          geometry.cellHeight,
          color,
          backgroundColor,
          bold,
        )
      }
    }
  }

  return toElement(surface.elements, canvas)
}

export default Board
