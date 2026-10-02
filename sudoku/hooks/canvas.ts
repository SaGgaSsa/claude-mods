import type { ClientElements, RenderElement } from 'claude-code'

export type CanvasCell = {
  character: string
  color: string
  backgroundColor: string
  bold: boolean
}

export type Canvas = {
  columns: number
  rows: number
  cells: CanvasCell[][]
}

export const createCanvas = (columns: number, rows: number, backgroundColor: string): Canvas => ({
  columns,
  rows,
  cells: Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({
      character: ' ',
      color: backgroundColor,
      backgroundColor,
      bold: false,
    })),
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
  color: string,
  backgroundColor = color,
  character = ' ',
  bold = false,
) => {
  for (let row = Math.max(0, y); row < Math.min(canvas.rows, y + height); row++) {
    for (let col = Math.max(0, x); col < Math.min(canvas.columns, x + width); col++) {
      setCell(canvas, col, row, { character, color, backgroundColor, bold })
    }
  }
}

export const writeText = (
  canvas: Canvas,
  value: string,
  x: number,
  y: number,
  color: string,
  backgroundColor: string,
  bold = false,
) => {
  for (let index = 0; index < value.length; index++) {
    setCell(canvas, x + index, y, {
      character: value[index]!,
      color,
      backgroundColor,
      bold,
    })
  }
}

export const writeCentered = (
  canvas: Canvas,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  backgroundColor: string,
  bold = false,
) => {
  const left = x + Math.floor((width - value.length) / 2)
  const top = y + Math.floor(height / 2)
  writeText(canvas, value, left, top, color, backgroundColor, bold)
}

export const horizontalLine = (
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  character: string,
  color: string,
  backgroundColor: string,
) => fillRect(canvas, x, y, width, 1, color, backgroundColor, character)

export const drawFrame = (canvas: Canvas, color: string) => {
  fillRect(canvas, 0, 0, canvas.columns, 1, color)
  fillRect(canvas, 0, canvas.rows - 1, canvas.columns, 1, color)
  fillRect(canvas, 0, 1, 1, canvas.rows - 2, color)
  fillRect(canvas, canvas.columns - 1, 1, 1, canvas.rows - 2, color)
}

type TextRun = Pick<CanvasCell, 'color' | 'backgroundColor' | 'bold'> & { text: string }

const runsForRow = (row: CanvasCell[]): TextRun[] => {
  const runs: TextRun[] = []
  for (const cell of row) {
    const previous = runs[runs.length - 1]
    if (previous && previous.color === cell.color &&
      previous.backgroundColor === cell.backgroundColor && previous.bold === cell.bold) {
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
    const runs = runsForRow(cells).map(run => elements.Text({
      color: run.color,
      backgroundColor: run.backgroundColor,
      bold: run.bold || undefined,
      children: run.text,
    }))

    return elements.Text({
      color: cells[0]!.color,
      backgroundColor: cells[0]!.backgroundColor,
      wrap: 'truncate',
      children: runs,
    })
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
