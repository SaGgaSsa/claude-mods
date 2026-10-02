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

const QUADRANTS: Record<number, string> = {
  1: '▘',
  2: '▝',
  3: '▀',
  4: '▖',
  5: '▌',
  6: '▞',
  7: '▛',
  8: '▗',
  9: '▚',
  10: '▐',
  11: '▜',
  12: '▄',
  13: '▙',
  14: '▟',
}

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
    const isCursor = index === props.cursor
    if (isCursor) return clashes.has(index) ? CLASH_BACKGROUND : CURSOR
    return digit !== '0' && digit === selectedDigit ? MATCH : PAPER
  }

  const put = (x: number, y: number, pixel: Pixel) => {
    if (x >= 0 && y >= 0 && x < geometry.innerWidth && y < geometry.innerHeight) {
      pixels[y]![x] = pixel
    }
  }

  const linePixel = (character: string, color: string, backgroundColor = PAPER): Pixel => ({
    character,
    color,
    backgroundColor,
    bold: false,
  })

  const verticalPixel = (left: string, right: string): Pixel => {
    if (left === right) {
      return linePixel(left === PAPER ? '│' : ' ', left === PAPER ? FINE_LINE : left)
    }
    return left === PAPER
      ? linePixel('▐', right, left)
      : linePixel('▌', left, right)
  }

  const horizontalPixel = (
    above: string,
    below: string,
    character: string,
    color: string,
  ): Pixel => {
    if (above === below) {
      return linePixel(above === PAPER ? character : ' ', above === PAPER ? color : above)
    }
    return linePixel('▀', above, below)
  }

  const blockHorizontalPixel = (above: string, below: string): Pixel => {
    if (above === below) return linePixel('━', WOOD, above)
    if (above !== PAPER) return linePixel('▀', above, WOOD)
    return linePixel('▄', below, WOOD)
  }

  const crossingPixel = (
    corners: [string, string, string, string],
    baseColor: string,
    standard: string,
  ): Pixel => {
    const colored = corners.filter(color => color !== PAPER)
    if (colored.length === 0) return linePixel(standard, baseColor)

    const accent = colored.sort((a, b) =>
      corners.filter(color => color === b).length - corners.filter(color => color === a).length,
    )[0]!
    const mask = corners.reduce((value, color, index) =>
      color === accent ? value | (1 << index) : value,
    0)
    if (mask === 15) return linePixel(' ', accent, accent)
    return linePixel(QUADRANTS[mask] ?? standard, accent, baseColor)
  }

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
          put(x + dx, y + dy, linePixel(' ', FINE_LINE, backgroundColor))
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
          put(x, y + subrow, verticalPixel(backgroundAt(row, col), backgroundAt(row, col + 1)))
        } else {
          const left = backgroundAt(row, col)
          const right = backgroundAt(row, col + 1)
          put(x, y + subrow, linePixel(' ', left, left))
          put(x + 1, y + subrow, linePixel('┃', WOOD))
          put(x + 2, y + subrow, linePixel(' ', right, right))
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
      const above = backgroundAt(row, col)
      const below = backgroundAt(row + 1, col)
      for (let dx = 0; dx < geometry.cellWidth; dx++) {
        const pixel = isBlock
          ? blockHorizontalPixel(above, below)
          : horizontalPixel(above, below, character, color)
        put(x + dx, y, pixel)
      }

      if (col === 8) continue
      const separatorX = x + geometry.cellWidth
      if (col % 3 !== 2) {
        const corners: [string, string, string, string] = [
          above,
          backgroundAt(row, col + 1),
          below,
          backgroundAt(row + 1, col + 1),
        ]
        put(
          separatorX,
          y,
          crossingPixel(corners, color, isBlock ? '┿' : '┼'),
        )
      } else {
        const rightAbove = backgroundAt(row, col + 1)
        const rightBelow = backgroundAt(row + 1, col + 1)
        const leftGap = isBlock
          ? blockHorizontalPixel(above, below)
          : horizontalPixel(above, below, character, color)
        const rightGap = isBlock
          ? blockHorizontalPixel(rightAbove, rightBelow)
          : horizontalPixel(rightAbove, rightBelow, character, color)
        put(separatorX, y, leftGap)
        put(
          separatorX + 1,
          y,
          crossingPixel([above, rightAbove, below, rightBelow], WOOD, isBlock ? '╋' : '╂'),
        )
        put(separatorX + 2, y, rightGap)
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
      <Box key={`line:${y}`} flexDirection="row" backgroundColor={PAPER}>
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

  return (
    <Box
      flexDirection="column"
      width={geometry.width}
      height={geometry.height}
      borderStyle="bold"
      borderColor={WOOD}
      backgroundColor={PAPER}
    >
      {rows}
    </Box>
  )
}

export default Board
