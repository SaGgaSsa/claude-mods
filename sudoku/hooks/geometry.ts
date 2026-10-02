import type { GeometryProps } from '../types'

export type BoardGeometry = GeometryProps & {
  innerWidth: number
  innerHeight: number
  cellPosition: (row: number, col: number) => { x: number; y: number }
  cellAt: (x: number, y: number) => number | null
  pickerRowAt: (x: number, y: number, rowCount: number, height: number) => number | null
}

export type ControlsAction =
  | { type: 'digit'; digit: number; key: string }
  | { type: 'new'; key: 'new' }

export type ControlsGeometry = {
  width: number
  height: number
  innerWidth: number
  innerHeight: number
  tileWidth: number
  tileHeight: number
  keypadX: number
  keypadWidth: number
  keypadY: number
  newY: number
  actionAt: (x: number, y: number) => ControlsAction | null
}

const FRAME = 1
const FOOTER_GAP = 1

export const geometryAtScale = (requestedScale: number): BoardGeometry => {
  const scale = Math.max(1, Math.floor(requestedScale))
  const cellHeight = scale
  const cellWidth = 2 * scale + 1
  const blockWidth = 3 * cellWidth + 2
  const innerWidth = 3 * blockWidth + 6
  const innerHeight = 9 * cellHeight + 8
  const width = innerWidth + FRAME * 2
  const height = innerHeight + FRAME * 2

  const cellPosition = (row: number, col: number) => ({
    x: FRAME + Math.floor(col / 3) * (blockWidth + 3) + (col % 3) * (cellWidth + 1),
    y: FRAME + row * (cellHeight + 1),
  })

  const cellAt = (x: number, y: number): number | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null

    let nearestRow = 0
    let nearestCol = 0
    let rowDistance = Number.POSITIVE_INFINITY
    let colDistance = Number.POSITIVE_INFINITY

    for (let row = 0; row < 9; row++) {
      const center = cellPosition(row, 0).y + Math.floor(cellHeight / 2)
      const distance = Math.abs(y - center)
      if (distance <= rowDistance) {
        nearestRow = row
        rowDistance = distance
      }
    }

    for (let col = 0; col < 9; col++) {
      const center = cellPosition(0, col).x + Math.floor(cellWidth / 2)
      const distance = Math.abs(x - center)
      if (distance <= colDistance) {
        nearestCol = col
        colDistance = distance
      }
    }

    return nearestRow * 9 + nearestCol
  }

  const pickerRowAt = (x: number, y: number, rowCount: number, pickerHeight: number) => {
    if (x < 0 || y < 2 || x >= width || y >= pickerHeight - FRAME) return null
    const row = Math.max(0, Math.ceil((y - 4) / 2))
    return row < rowCount ? row : null
  }

  return {
    scale,
    cellWidth,
    cellHeight,
    width,
    height,
    innerWidth,
    innerHeight,
    cellPosition,
    cellAt,
    pickerRowAt,
  }
}

export const controlsGeometry = (board: GeometryProps): ControlsGeometry => {
  const tileHeight = board.scale
  const tileWidth = board.cellWidth
  const width = board.width
  const height = controlsHeight(board.scale)
  const innerWidth = width - FRAME * 2
  const innerHeight = height - FRAME * 2
  const keypadWidth = tileWidth * 3 + 2
  const keypadX = FRAME + Math.floor((innerWidth - keypadWidth) / 2)
  const keypadY = FRAME + 2
  const newY = keypadY + tileHeight * 4 + 4
  const clearY = keypadY + 3 * (tileHeight + 1)

  const actionAt = (x: number, y: number): ControlsAction | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    if (y >= newY && y < newY + tileHeight) return { type: 'new', key: 'new' }

    const keypadEndY = clearY + tileHeight
    if (y < keypadY || y >= keypadEndY || x < keypadX || x >= keypadX + keypadWidth) {
      return null
    }

    const row = Math.min(3, Math.floor((y - keypadY + 1) / (tileHeight + 1)))
    if (row === 3) return { type: 'digit', digit: 0, key: 'digit:0' }

    const centerOffset = Math.floor(tileWidth / 2)
    const col = Math.max(0, Math.min(2, Math.round(
      (x - keypadX - centerOffset) / (tileWidth + 1),
    )))
    const digits = [
      [7, 8, 9],
      [4, 5, 6],
      [1, 2, 3],
    ]
    const digit = digits[row]![col]!
    return { type: 'digit', digit, key: `digit:${digit}` }
  }

  return {
    width,
    height,
    innerWidth,
    innerHeight,
    tileWidth,
    tileHeight,
    keypadX,
    keypadWidth,
    keypadY,
    newY,
    actionAt,
  }
}

export const controlsHeight = (scale: number): number => 5 * Math.max(1, Math.floor(scale)) + 8

export const geometryForPanel = (bodyColumns: number, bodyRows?: number): GeometryProps => {
  const widthScale = Math.floor((bodyColumns - 23) / 18)
  const heightScale = typeof bodyRows === 'number'
    ? Math.floor((bodyRows - 19) / 14)
    : Number.POSITIVE_INFINITY
  const geometry = geometryAtScale(Math.max(1, Math.min(widthScale, heightScale)))

  return {
    scale: geometry.scale,
    cellWidth: geometry.cellWidth,
    cellHeight: geometry.cellHeight,
    width: geometry.width,
    height: geometry.height,
  }
}

export const boardContentHeight = (geometry: GeometryProps): number =>
  geometry.height + FOOTER_GAP + controlsHeight(geometry.scale)

export const pickerHeight = (rowCount: number): number => rowCount * 2 + 3
