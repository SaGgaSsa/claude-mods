import type { ClientModule } from 'claude-code'

import type { ControlsMessage, ControlsProps } from '../types'
import { controlsGeometry } from './geometry'
import {
  createCanvas,
  drawFrame,
  fillRect,
  horizontalLine,
  setCell,
  toElement,
  verticalLine,
  writeCentered,
} from './canvas'
import { CLASH, CURSOR, FINE_LINE, GIVEN, PAPER, PLAYER, WOOD } from './palette'

type ControlsState = { selected: string | null }
type StatusSegment = { text: string; color: string; bold?: boolean }

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

const Controls: ClientModule<ControlsProps, ControlsState> = (props, surface) => {
  const layout = controlsGeometry(props.geometry)
  const selected = surface.state?.selected ?? null
  const send = (message: ControlsMessage) => surface.post(message)
  const sendInput = () => send({ type: 'input', geometry: props.geometry })

  surface.onKey(event => {
    const move = MOVES[event.key]
    if (move) {
      return send({ type: 'move', rows: move[0], cols: move[1], geometry: props.geometry })
    }
    if (/^[1-9]$/.test(event.key)) {
      const key = `digit:${event.key}`
      surface.setState({ selected: key })
      return send({ type: 'digit', digit: Number(event.key), geometry: props.geometry })
    }
    if (['0', 'backspace', 'delete', ' '].includes(event.key)) {
      surface.setState({ selected: 'digit:0' })
      return send({ type: 'digit', digit: 0, geometry: props.geometry })
    }
    if (event.key === 'n') {
      surface.setState({ selected: 'new' })
      return send({ type: 'new', geometry: props.geometry })
    }
    sendInput()
  })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const action = layout.actionAt(event.x, event.y)
    if (!action) return send({ type: 'focus', geometry: props.geometry })

    surface.setState({ selected: action.key })
    const message: ControlsMessage = action.type === 'new'
      ? { type: 'new', geometry: props.geometry }
      : { type: 'digit', digit: action.digit, geometry: props.geometry }
    send(message)
  })

  const canvas = createCanvas(layout.width, layout.height, PAPER)
  drawFrame(canvas, WOOD)
  const innerWidth = layout.width - 2
  const statusSegments: StatusSegment[] = props.isSolved
    ? [{ text: 'Solved!', color: '#245a2c', bold: true }]
    : [
        { text: `${props.difficulty[0]!.toUpperCase()}${props.difficulty.slice(1)}`, color: WOOD },
        { text: ` \u00b7 ${props.filled}/81 filled`, color: PLAYER },
        ...(props.clashes > 0
          ? [{ text: ` \u00b7 ${props.clashes} in conflict`, color: CLASH }]
          : []),
      ]
  const statusWidth = statusSegments.reduce((width, segment) => width + segment.text.length, 0)
  let statusX = 1 + Math.floor((innerWidth - statusWidth) / 2)
  for (const segment of statusSegments) {
    for (let index = 0; index < segment.text.length; index++) {
      setCell(canvas, statusX + index, layout.statusY, {
        character: segment.text[index]!,
        color: segment.color,
        backgroundColor: PAPER,
        bold: segment.bold ?? false,
      })
    }
    statusX += segment.text.length
  }

  if (!props.keyboardActive) {
    writeCentered(
      canvas,
      'click the board to use the keyboard',
      1,
      layout.hintY,
      innerWidth,
      1,
      WOOD,
      PAPER,
    )
  }

  horizontalLine(canvas, 1, layout.statusRuleY, innerWidth, '\u2500', FINE_LINE, PAPER)

  const paintTile = (x: number, y: number, width: number, label: string, key: string) => {
    const backgroundColor = selected === key ? CURSOR : PAPER
    const color = selected === key ? GIVEN : PLAYER
    fillRect(canvas, x, y, width, layout.tileHeight, color, backgroundColor, ' ', true)
    writeCentered(canvas, label, x, y, width, layout.tileHeight, color, backgroundColor, true)
  }

  const digits = [
    [7, 8, 9],
    [4, 5, 6],
    [1, 2, 3],
  ]

  for (let row = 0; row < digits.length; row++) {
    for (let col = 0; col < 3; col++) {
      const digit = digits[row]![col]!
      const position = layout.tilePosition(row, col)
      paintTile(position.x, position.y, layout.tileWidth, String(digit), `digit:${digit}`)
    }
  }

  paintTile(layout.keypadX, layout.clearY, layout.keypadWidth, '0 Clear', 'digit:0')

  for (let row = 0; row < 3; row++) {
    horizontalLine(
      canvas,
      layout.keypadX,
      layout.keypadRuleY(row),
      layout.keypadWidth,
      '\u2500',
      FINE_LINE,
      PAPER,
    )
  }

  const verticalXs = [
    layout.keypadX + layout.tileWidth,
    layout.keypadX + layout.tileWidth * 2 + 1,
  ]
  const lastRuleY = layout.clearY - 1
  for (const x of verticalXs) {
    verticalLine(canvas, x, layout.keypadY, lastRuleY - layout.keypadY + 1, '\u2502', FINE_LINE, PAPER)
    for (let row = 0; row < 3; row++) {
      const y = layout.keypadRuleY(row)
      setCell(canvas, x, y, {
        character: '\u253c',
        color: FINE_LINE,
        backgroundColor: PAPER,
        bold: false,
      })
    }
  }

  horizontalLine(canvas, 1, layout.newRuleY, innerWidth, '\u2500', FINE_LINE, PAPER)
  paintTile(1, layout.newY, innerWidth, 'New game', 'new')

  return toElement(surface.elements, canvas)
}

export default Controls
