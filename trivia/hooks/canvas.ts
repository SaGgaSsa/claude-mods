import type { ClientElements, RenderElement } from 'claude-code'

export type CanvasStyle = {
  color?: string
  backgroundColor?: string
  bold?: boolean
}

export type CanvasCell = CanvasStyle & {
  character: string
}

export type Canvas = {
  columns: number
  rows: number
  cells: CanvasCell[][]
}

export const createCanvas = (columns: number, rows: number): Canvas => ({
  columns,
  rows,
  cells: Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ character: ' ' })),
  ),
})

export const setCell = (canvas: Canvas, x: number, y: number, cell: CanvasCell) => {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return
  if (x < 0 || y < 0 || x >= canvas.columns || y >= canvas.rows) return
  const row = canvas.cells[y]
  if (row) row[x] = cell
}

export const fillRect = (
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  style: CanvasStyle = {},
  character = ' ',
) => {
  for (let row = Math.max(0, y); row < Math.min(canvas.rows, y + height); row++) {
    for (let column = Math.max(0, x); column < Math.min(canvas.columns, x + width); column++) {
      setCell(canvas, column, row, { character, ...style })
    }
  }
}

export const writeText = (
  canvas: Canvas,
  value: string,
  x: number,
  y: number,
  style: CanvasStyle = {},
) => {
  Array.from(value).forEach((character, index) => {
    setCell(canvas, x + index, y, { character, ...style })
  })
}

export const writeCentered = (
  canvas: Canvas,
  value: string,
  x: number,
  y: number,
  width: number,
  style: CanvasStyle = {},
) => {
  const valueWidth = Array.from(value).length
  const left = x + Math.floor((width - valueWidth) / 2)
  writeText(canvas, value, left, y, style)
}

type TextRun = {
  text: string
  color?: string
  backgroundColor?: string
  bold?: boolean
}

const runsForRow = (row: CanvasCell[]): TextRun[] => {
  const runs: TextRun[] = []
  for (const cell of row) {
    const previous = runs[runs.length - 1]
    if (
      previous &&
      previous.color === cell.color &&
      previous.backgroundColor === cell.backgroundColor &&
      previous.bold === cell.bold
    ) {
      previous.text += cell.character
    } else {
      runs.push({
        text: cell.character,
        color: cell.color,
        backgroundColor: cell.backgroundColor,
        bold: cell.bold,
      })
    }
  }
  return runs
}

export const toElement = (elements: ClientElements, canvas: Canvas): RenderElement => {
  const rows = canvas.cells.map(cells => {
    const spans = runsForRow(cells).map(run => elements.Text({
      ...(run.color ? { color: run.color } : {}),
      ...(run.backgroundColor ? { backgroundColor: run.backgroundColor } : {}),
      ...(run.bold ? { bold: true } : {}),
      children: run.text,
    }))

    return elements.Text({ wrap: 'truncate', children: spans })
  })

  return elements.Box({
    width: canvas.columns,
    height: canvas.rows,
    flexDirection: 'column',
    flexGrow: 0,
    flexShrink: 0,
    children: rows,
  })
}
