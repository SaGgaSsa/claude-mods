import type { GeometryProps } from '../types'

const FRAME = 1

const gapAfter = (index: number): number => {
  if (index === 2 || index === 5) return 2
  return index === 8 ? 0 : 1
}

const axisStart = (index: number, cellSize: number): number =>
  FRAME + index * cellSize + index + Math.floor(index / 3)

export const desktopBoardDimensions = (geometry: GeometryProps) => ({
  width: 9 * geometry.cellWidth + 10 + FRAME * 2,
  height: 9 * geometry.cellHeight + 10 + FRAME * 2,
})

export const desktopCellPosition = (geometry: GeometryProps, row: number, col: number) => ({
  x: axisStart(col, geometry.cellWidth),
  y: axisStart(row, geometry.cellHeight),
})

const axisCellAt = (coordinate: number, cellSize: number): number | null => {
  const local = coordinate - FRAME
  if (local < 0) return 0

  for (let index = 0; index < 9; index++) {
    const start = index * cellSize + index + Math.floor(index / 3)
    const end = start + cellSize
    if (local < end) return index

    const gap = gapAfter(index)
    if (local < end + gap) return Math.min(index + 1, 8)
  }

  return 8
}

export const desktopCellAt = (
  geometry: GeometryProps,
  x: number,
  y: number,
): number | null => {
  const dimensions = desktopBoardDimensions(geometry)
  if (x < 0 || y < 0 || x >= dimensions.width || y >= dimensions.height) return null

  const col = axisCellAt(x, geometry.cellWidth)
  const row = axisCellAt(y, geometry.cellHeight)
  return col === null || row === null ? null : row * 9 + col
}
