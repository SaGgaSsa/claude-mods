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

export type ControlsAction = { type: 'new'; key: 'new' }

export type ControlsGeometry = {
  width: number
  height: number
  innerWidth: number
  buttonHeight: number
  statusY: number
  hintY: number
  statusBandY: number
  newY: number
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
  const width = board.width
  const height = controlsHeight(board.scale)
  const innerWidth = width - FRAME * 2
  const buttonHeight = board.scale
  const statusY = FRAME
  const hintY = FRAME + 1
  const statusBandY = FRAME + 2
  const newY = FRAME + 3

  const actionAt = (x: number, y: number): ControlsAction | null => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null
    if (y >= newY && y < newY + buttonHeight && x >= FRAME && x < width - FRAME) {
      return { type: 'new', key: 'new' }
    }
    return null
  }

  return {
    width,
    height,
    innerWidth,
    buttonHeight,
    statusY,
    hintY,
    statusBandY,
    newY,
    actionAt,
  }
}

export const controlsHeight = (scale: number): number => Math.max(1, Math.floor(scale)) + 5

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
