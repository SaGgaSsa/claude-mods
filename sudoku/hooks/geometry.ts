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
  statusBandY: number
  keypadX: number
  keypadWidth: number
  keypadY: number
  clearY: number
  newY: number
  tilePosition: (row: number, col: number) => { x: number; y: number }
  actionAt: (x: number, y: number) => ControlsAction | null
}

const FRAME = 1
const FOOTER_GAP = 1

export const geometryAtScale = (requestedScale: number): BoardGeometry => {
  const roundedScale = Math.max(1, Math.floor(requestedScale))
  const scale = roundedScale % 2 === 0 ? roundedScale - 1 : roundedScale
  const cellHeight = scale
  const cellWidth = 2 * cellHeight + 1
  const innerWidth = 9 * cellWidth
  const innerHeight = 9 * cellHeight
  const width = innerWidth + FRAME * 2
  const height = innerHeight + FRAME * 2

  const cellPosition = (row: number, col: number) => ({
    x: FRAME + col * cellWidth,
    y: FRAME + row * cellHeight,
  })

  const cellAt = (x: number, y: number): number | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    const col = Math.max(0, Math.min(8, Math.floor((x - FRAME) / cellWidth)))
    const row = Math.max(0, Math.min(8, Math.floor((y - FRAME) / cellHeight)))
    return row * 9 + col
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
  const keypadWidth = tileWidth * 3
  const statusY = FRAME
  const hintY = FRAME + 1
  const statusBandY = FRAME + 2
  const keypadX = FRAME + Math.floor((innerWidth - keypadWidth) / 2)
  const keypadY = statusBandY + 1
  const tilePosition = (row: number, col: number) => ({
    x: keypadX + col * tileWidth,
    y: keypadY + row * tileHeight,
  })
  const clearY = tilePosition(3, 0).y
  const newY = keypadY + tileHeight * 4

  const actionAt = (x: number, y: number): ControlsAction | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    if (y >= newY && y < newY + tileHeight && x >= FRAME && x < width - FRAME) {
      return { type: 'new', key: 'new' }
    }

    const keypadEndY = clearY + tileHeight
    if (y < keypadY || y >= keypadEndY || x < keypadX || x >= keypadX + keypadWidth) {
      return null
    }

    const row = Math.floor((y - keypadY) / tileHeight)
    if (row === 3) return { type: 'digit', digit: 0, key: 'digit:0' }

    const col = Math.floor((x - keypadX) / tileWidth)
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
    statusBandY,
    keypadX,
    keypadWidth,
    keypadY,
    clearY,
    newY,
    tilePosition,
    actionAt,
  }
}

export const controlsHeight = (scale: number): number => 5 * Math.max(1, Math.floor(scale)) + 5

export const geometryForPanel = (bodyColumns: number, bodyRows?: number): GeometryProps => {
  let chosen = geometryAtScale(1)

  for (let scale = 3; ; scale += 2) {
    const candidate = geometryAtScale(scale)
    if (candidate.width > bodyColumns) break
    if (typeof bodyRows === 'number' && boardContentHeight(candidate) > bodyRows) break
    chosen = candidate
  }

  return {
    scale: chosen.scale,
    cellWidth: chosen.cellWidth,
    cellHeight: chosen.cellHeight,
    width: chosen.width,
    height: chosen.height,
  }
}

export const boardContentHeight = (geometry: GeometryProps): number =>
  geometry.height + FOOTER_GAP + controlsHeight(geometry.scale)

export const pickerHeight = (rowCount: number): number => rowCount * 2 + 3
