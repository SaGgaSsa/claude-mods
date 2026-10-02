import type { ClientModule } from 'claude-code'

import type { BoardAction, BoardProps } from '../types'
import { geometryAtScale } from './geometry'
import { CLASH, CLASH_BACKGROUND, CURSOR, FINE_LINE, GIVEN, MATCH, PAPER, PLAYER, WOOD } from './palette'

type Pixel = {
  character: string
  color: string
  backgroundColor: string
  bold: boolean
}

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
  const geometry = geometryAtScale(props.geometry.scale)
  const send = (message: BoardAction) => surface.post({ ...message, geometry: props.geometry })

  surface.onKey(event => {
    const move = MOVES[event.key]
    if (move) return send({ type: 'move', rows: move[0], cols: move[1] })
    if (/^[1-9]$/.test(event.key)) return send({ type: 'digit', digit: Number(event.key) })
    if (CLEAR_KEYS.has(event.key)) return send({ type: 'digit', digit: 0 })
  })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const index = geometry.cellAt(event.x, event.y)
    if (index !== null) send({ type: 'select', index })
  })

  const clashes = new Set(props.clashes)
  const selectedDigit = props.board[props.cursor] ?? '0'
  const pixels: Pixel[][] = Array.from({ length: geometry.innerHeight }, () =>
    Array.from({ length: geometry.innerWidth }, () => ({
      character: ' ',
      color: PAPER,
      backgroundColor: PAPER,
      bold: false,
    })),
  )

  const backgroundAt = (row: number, col: number): string => {
    const index = row * 9 + col
    const digit = props.board[index] ?? '0'
    if (index === props.cursor) return clashes.has(index) ? CLASH_BACKGROUND : CURSOR
    return digit !== '0' && digit === selectedDigit ? MATCH : PAPER
  }

  const put = (x: number, y: number, pixel: Pixel) => {
    if (x >= 0 && y >= 0 && x < geometry.innerWidth && y < geometry.innerHeight) {
      pixels[y]![x] = pixel
    }
  }

  const linePixel = (character: string, color: string): Pixel => ({
    character,
    color,
    backgroundColor: PAPER,
    bold: false,
  })

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const index = row * 9 + col
      const digit = props.board[index] ?? '0'
      const isGiven = props.puzzle[index] !== '0'
      const isCursor = index === props.cursor
      const isClash = clashes.has(index)
      const backgroundColor = backgroundAt(row, col)
      const color = isClash ? CLASH : isGiven ? GIVEN : digit === '0' ? FINE_LINE : PLAYER
      const position = geometry.cellPosition(row, col)
      const x = position.x - 1
      const y = position.y - 1

      for (let dy = 0; dy < geometry.cellHeight; dy++) {
        for (let dx = 0; dx < geometry.cellWidth; dx++) {
          pixels[y + dy]![x + dx]!.backgroundColor = backgroundColor
        }
      }

      const centerX = x + Math.floor(geometry.cellWidth / 2)
      const centerY = y + Math.floor(geometry.cellHeight / 2)
      put(centerX, centerY, {
        character: digit === '0' ? ' ' : digit,
        color,
        backgroundColor,
        bold: isCursor || isGiven,
      })
    }
  }

  for (let row = 0; row < 9; row++) {
    const y = geometry.cellPosition(row, 0).y - 1
    for (let subrow = 0; subrow < geometry.cellHeight; subrow++) {
      for (let col = 0; col < 8; col++) {
        const x = geometry.cellPosition(row, col).x - 1 + geometry.cellWidth
        if (col % 3 !== 2) {
          put(x, y + subrow, linePixel('│', FINE_LINE))
        } else {
          put(x, y + subrow, linePixel(' ', PAPER))
          put(x + 1, y + subrow, linePixel('┃', WOOD))
          put(x + 2, y + subrow, linePixel(' ', PAPER))
        }
      }
    }
  }

  for (let row = 0; row < 8; row++) {
    const y = geometry.cellPosition(row, 0).y - 1 + geometry.cellHeight
    const isBlock = row % 3 === 2
    const character = isBlock ? '━' : '─'
    const color = isBlock ? WOOD : FINE_LINE

    for (let col = 0; col < 9; col++) {
      const position = geometry.cellPosition(row, col)
      const x = position.x - 1
      for (let dx = 0; dx < geometry.cellWidth; dx++) {
        put(x + dx, y, linePixel(character, color))
      }

      if (col === 8) continue
      const separatorX = x + geometry.cellWidth
      if (col % 3 !== 2) {
        put(separatorX, y, linePixel(isBlock ? '┿' : '┼', color))
      } else {
        put(separatorX, y, linePixel(character, color))
        put(separatorX + 1, y, linePixel(isBlock ? '╋' : '╂', WOOD))
        put(separatorX + 2, y, linePixel(character, color))
      }
    }
  }

  const rows = pixels.map((line, y) => {
    const runs: { pixel: Pixel; text: string }[] = []
    for (const pixel of line) {
      const previous = runs[runs.length - 1]
      if (previous && previous.pixel.color === pixel.color &&
        previous.pixel.backgroundColor === pixel.backgroundColor &&
        previous.pixel.bold === pixel.bold) {
        previous.text += pixel.character
      } else {
        runs.push({ pixel, text: pixel.character })
      }
    }

    return (
      <Box key={`row:${y}`} flexDirection="row" backgroundColor={PAPER}>
        {runs.map((run, index) => (
          <Text
            key={`run:${y}:${index}`}
            color={run.pixel.color}
            backgroundColor={run.pixel.backgroundColor}
            bold={run.pixel.bold || undefined}
          >
            {run.text}
          </Text>
        ))}
      </Box>
    )
  })

  const frameRow = (key: string) => (
    <Text key={key} color={WOOD} backgroundColor={WOOD}>
      {' '.repeat(geometry.width)}
    </Text>
  )

  const framedRows = rows.map((row, y) => (
    <Box key={`framed:${y}`} flexDirection="row" backgroundColor={WOOD}>
      <Text color={WOOD} backgroundColor={WOOD}> </Text>
      {row}
      <Text color={WOOD} backgroundColor={WOOD}> </Text>
    </Box>
  ))

  return (
    <Box
      flexDirection="column"
      width={geometry.width}
      height={geometry.height}
      backgroundColor={WOOD}
    >
      {frameRow('frame:top')}
      {framedRows}
      {frameRow('frame:bottom')}
    </Box>
  )
}

export default Board
