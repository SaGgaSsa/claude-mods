import type { GeometryProps } from '../types'

export type BoardGeometry = GeometryProps & {
  innerWidth: number
  innerHeight: number
  pickerTitleY: number
  pickerTitleRuleY: number
  pickerRowY: (index: number) => number
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
  statusY: number
  hintY: number
  statusRuleY: number
  keypadX: number
  keypadWidth: number
  keypadY: number
  clearY: number
  newY: number
  newRuleY: number
  keypadRuleY: (row: number) => number
  tilePosition: (row: number, col: number) => { x: number; y: number }
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

  const pickerTitleY = FRAME
  const pickerTitleRuleY = FRAME + 1
  const pickerRowY = (index: number) => FRAME + 2 + index * 2

  const pickerRowAt = (x: number, y: number, rowCount: number, cardHeight: number) => {
    if (x < 0 || y < 2 || x >= width || y >= cardHeight - FRAME) return null

    let nearestRow = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let row = 0; row < rowCount; row++) {
      const distance = Math.abs(y - pickerRowY(row))
      if (distance < nearestDistance) {
        nearestRow = row
        nearestDistance = distance
      }
    }
    return nearestDistance < Number.POSITIVE_INFINITY ? nearestRow : null
  }

  return {
    scale,
    cellWidth,
    cellHeight,
    width,
    height,
    innerWidth,
    innerHeight,
    pickerTitleY,
    pickerTitleRuleY,
    pickerRowY,
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
  const statusY = FRAME
  const hintY = FRAME + 1
  const statusRuleY = FRAME + 2
  const keypadX = FRAME + Math.floor((innerWidth - keypadWidth) / 2)
  const keypadY = statusRuleY + 1
  const tilePosition = (row: number, col: number) => ({
    x: keypadX + col * (tileWidth + 1),
    y: keypadY + row * (tileHeight + 1),
  })
  const newY = keypadY + tileHeight * 4 + 4
  const newRuleY = newY - 1
  const keypadRuleY = (row: number) => tilePosition(row, 0).y + tileHeight
  const clearY = tilePosition(3, 0).y

  const actionAt = (x: number, y: number): ControlsAction | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    if (y >= newY && y < newY + tileHeight && x >= FRAME && x < width - FRAME) {
      return { type: 'new', key: 'new' }
    }

    const keypadEndY = clearY + tileHeight
    if (y < keypadY || y >= keypadEndY || x < keypadX || x >= keypadX + keypadWidth) {
      return null
    }

    let row = 0
    let rowDistance = Number.POSITIVE_INFINITY
    for (let candidate = 0; candidate < 4; candidate++) {
      const center = tilePosition(candidate, 0).y + Math.floor(tileHeight / 2)
      const distance = Math.abs(y - center)
      if (distance <= rowDistance) {
        row = candidate
        rowDistance = distance
      }
    }
    if (row === 3) return { type: 'digit', digit: 0, key: 'digit:0' }

    let col = 0
    let colDistance = Number.POSITIVE_INFINITY
    for (let candidate = 0; candidate < 3; candidate++) {
      const center = tilePosition(0, candidate).x + Math.floor(tileWidth / 2)
      const distance = Math.abs(x - center)
      if (distance <= colDistance) {
        col = candidate
        colDistance = distance
      }
    }
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
    statusY,
    hintY,
    statusRuleY,
    keypadX,
    keypadWidth,
    keypadY,
    clearY,
    newY,
    newRuleY,
    keypadRuleY,
    tilePosition,
    actionAt,
  }
}

export const controlsHeight = (scale: number): number => 5 * Math.max(1, Math.floor(scale)) + 9

export const geometryForPanel = (bodyColumns: number, bodyRows?: number): GeometryProps => {
  const widthScale = Math.floor((bodyColumns - 23) / 18)
  const heightScale = typeof bodyRows === 'number'
    ? Math.floor((bodyRows - 20) / 14)
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
