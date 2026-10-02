import type { GeometryProps } from '../types'

export type BoardGeometry = GeometryProps & {
  innerWidth: number
  innerHeight: number
  cellPosition: (row: number, col: number) => { x: number; y: number }
  cellAt: (x: number, y: number) => number | null
  pickerRowAt: (x: number, y: number, rowCount: number, height: number) => number | null
}

const FRAME = 1
const FOOTER_HEIGHT = 8

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

export const geometryForPanel = (bodyColumns: number, bodyRows?: number): GeometryProps => {
  const widthScale = Math.floor((bodyColumns - 23) / 18)
  const heightScale = typeof bodyRows === 'number'
    ? Math.floor((bodyRows - FOOTER_HEIGHT - 10) / 9)
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
  geometry.height + FOOTER_HEIGHT

export const pickerHeight = (rowCount: number): number => rowCount * 2 + 3
