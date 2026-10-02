import type { ClientModule } from 'claude-code'

import type { BoardAction, BoardProps } from '../types'
import { geometryAtScale } from './geometry'
import {
  createCanvas,
  drawFrame,
  fillRect,
  setCell,
  toElement,
  writeCentered,
} from './canvas'
import {
  CLASH,
  CLASH_BACKGROUND,
  CURSOR,
  FINE_LINE,
  GIVEN,
  MATCH,
  PAPER,
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

type LineRule = { y: number; heavy: boolean }
type ColumnRule = { x: number; heavy: boolean }

const crossCharacter = (horizontalHeavy: boolean, verticalHeavy: boolean): string => {
  if (horizontalHeavy && verticalHeavy) return '\u254b'
  if (horizontalHeavy) return '\u253f'
  if (verticalHeavy) return '\u2542'
  return '\u253c'
}

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
      const backgroundColor = index === props.cursor
        ? isClash ? CLASH_BACKGROUND : CURSOR
        : digit !== '0' && digit === selectedDigit ? MATCH : PAPER
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

  const horizontalRules: LineRule[] = []
  for (let row = 0; row < 8; row++) {
    const y = geometry.cellPosition(row, 0).y + geometry.cellHeight
    const heavy = row % 3 === 2
    horizontalRules.push({ y, heavy })
    const character = heavy ? '\u2501' : '\u2500'
    const color = heavy ? WOOD : FINE_LINE
    fillRect(canvas, 1, y, geometry.width - 2, 1, color, PAPER, character)
  }

  const verticalRules: ColumnRule[] = []
  for (let col = 0; col < 8; col++) {
    const heavy = col % 3 === 2
    const position = geometry.cellPosition(0, col)
    verticalRules.push({
      x: position.x + geometry.cellWidth + (heavy ? 1 : 0),
      heavy,
    })
  }

  const firstY = geometry.cellPosition(0, 0).y
  const lastPosition = geometry.cellPosition(8, 0)
  const lastY = lastPosition.y + geometry.cellHeight - 1
  for (const rule of verticalRules) {
    for (let y = firstY; y <= lastY; y++) {
      const horizontal = horizontalRules.find(candidate => candidate.y === y)
      const character = horizontal
        ? crossCharacter(horizontal.heavy, rule.heavy)
        : rule.heavy ? '\u2503' : '\u2502'
      const color = rule.heavy || horizontal?.heavy ? WOOD : FINE_LINE
      setCell(canvas, rule.x, y, {
        character,
        color,
        backgroundColor: PAPER,
        bold: false,
      })
    }
  }

  return toElement(surface.elements, canvas)
}

export default Board
