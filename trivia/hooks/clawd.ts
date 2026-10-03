import type { Canvas, CanvasCell } from './canvas'
import { setCell } from './canvas'
import type { TriviaRect } from '../types'

const BODY_COLOR = '#d97757'
const EYE_COLOR = '#2a1610'
const SPRITE = [
  '..BBBBBBBBBB..',
  '..BBBBBBBBBB..',
  '.BBBEBBBBBEBB.',
  '.BBBEBBBBBEBB.',
  '.BBBBBBBBBBBB.',
  '..BBBBBBBBBB..',
]

export type ClawdArms = 'up' | 'out' | 'down'
export type ClawdEyes = 'open' | 'closed' | 'looking'

export type ClawdLook = {
  arms: ClawdArms
  eyes: ClawdEyes
  jump: boolean
  offset: number
  step: boolean
}

type Pixel = string | null

const setPixel = (pixels: Pixel[][], x: number, y: number, color: string) => {
  if (y < 0 || y >= pixels.length) return
  const row = pixels[y]
  if (row && x >= 0 && x < row.length) row[x] = color
}

const setArm = (pixels: Pixel[][], x: number, y: number, color: string) => {
  setPixel(pixels, x + 1, y, color)
  setPixel(pixels, 14 - x, y, color)
}

const makePixels = (look: ClawdLook): Pixel[][] => {
  const pixels = Array.from({ length: 8 }, () => Array<Pixel>(16).fill(null))
  const verticalOffset = look.jump ? -1 : 0

  SPRITE.forEach((row, y) => {
    Array.from(row).forEach((cell, x) => {
      const color = cell === 'B' ? BODY_COLOR : null
      if (color) setPixel(pixels, x + 1, y + verticalOffset, color)
    })
  })

  const eyeCenters = [4, 10]
  if (look.eyes === 'closed') {
    eyeCenters.forEach(center => {
      setPixel(pixels, center, 3 + verticalOffset, EYE_COLOR)
      setPixel(pixels, center + 1, 3 + verticalOffset, EYE_COLOR)
    })
  } else {
    eyeCenters.forEach(center => {
      const shift = look.eyes === 'looking' ? 1 : 0
      setPixel(pixels, center + 1 + shift, 2 + shift + verticalOffset, EYE_COLOR)
      setPixel(pixels, center + 1 + shift, 3 + shift + verticalOffset, EYE_COLOR)
    })
  }

  const armRows: Record<ClawdArms, [number, number]> = {
    up: [1, 2],
    out: [2, 2],
    down: [3, 4],
  }
  const [firstArmRow, lastArmRow] = armRows[look.arms]
  if (look.arms === 'out') {
    setArm(pixels, -1, firstArmRow + verticalOffset, BODY_COLOR)
    setArm(pixels, 0, firstArmRow + verticalOffset, BODY_COLOR)
  } else {
    for (let y = firstArmRow; y <= lastArmRow; y++) {
      setArm(pixels, 0, y + verticalOffset, BODY_COLOR)
    }
  }

  const shortLeftLegs = look.step
  ;[3, 5, 8, 10].forEach(x => {
    setPixel(pixels, x + 1, 6 + verticalOffset, BODY_COLOR)
    const shortened = shortLeftLegs ? x === 3 || x === 5 : x === 8 || x === 10
    if (!shortened) setPixel(pixels, x + 1, 7 + verticalOffset, BODY_COLOR)
  })

  if (look.offset !== 0) {
    for (let y = 0; y < pixels.length; y++) {
      const row = pixels[y]
      if (row) {
        const shifted = Array<Pixel>(row.length).fill(null)
        for (let x = 0; x < row.length; x++) {
          const color = row[x]
          const targetX = x + look.offset
          if (color && targetX >= 0 && targetX < shifted.length) {
            shifted[targetX] = color
          }
        }
        pixels[y] = shifted
      }
    }
  }

  return pixels
}

const combinePixels = (top: Pixel, bottom: Pixel): CanvasCell | null => {
  if (top && bottom) {
    if (top === bottom) return { character: '█', color: top }
    return { character: '▀', color: top, backgroundColor: bottom }
  }
  if (top) return { character: '▀', color: top }
  if (bottom) return { character: '▄', color: bottom }
  return null
}

export const drawClawd = (canvas: Canvas, area: TriviaRect, look: ClawdLook) => {
  const pixels = makePixels(look)
  for (let y = 0; y < area.height * 2; y++) {
    const topRow = pixels[y]
    const bottomRow = pixels[y + 1]
    if (!topRow || !bottomRow) continue
    for (let x = 0; x < area.width; x++) {
      const cell = combinePixels(topRow[x] ?? null, bottomRow[x] ?? null)
      if (cell) setCell(canvas, area.x + x, area.y + Math.floor(y / 2), cell)
    }
    y++
  }
}
