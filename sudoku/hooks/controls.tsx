import type { ClientModule } from 'claude-code'

import type { ControlsMessage, ControlsProps } from '../types'
import { controlsGeometry } from './geometry'
import {
  createCanvas,
  drawFrame,
  fillRect,
  setCell,
  toElement,
  writeCentered,
} from './canvas'
import { CLASH, CURSOR, GIVEN, PAPER, PAPER_ALT, PLAYER, WOOD } from './palette'

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
      ]
  const conflictSegment: StatusSegment[] = props.clashes > 0
    ? [{ text: ` \u00b7 ${props.clashes} in conflict`, color: CLASH }]
    : []
  const fullStatus = [...statusSegments, ...conflictSegment]
  const fullStatusWidth = fullStatus.reduce((width, segment) => width + segment.text.length, 0)
  const extraStatus = fullStatusWidth > innerWidth ? conflictSegment : []
  const visibleStatus = extraStatus.length > 0 ? statusSegments : fullStatus

  const writeSegments = (segments: StatusSegment[], y: number) => {
    const textWidth = segments.reduce((width, segment) => width + segment.text.length, 0)
    let x = 1 + Math.floor((innerWidth - textWidth) / 2)
    for (const segment of segments) {
      for (let index = 0; index < segment.text.length; index++) {
        setCell(canvas, x + index, y, {
          character: segment.text[index]!,
          color: segment.color,
          backgroundColor: PAPER,
          bold: segment.bold ?? false,
        })
      }
      x += segment.text.length
    }
  }

  writeSegments(visibleStatus, layout.statusY)
  const keyboardHint = 'click the board to use the keyboard'
  let hintOnThirdLine = false
  if (extraStatus.length > 0) {
    writeSegments(extraStatus, layout.hintY)
    if (!props.keyboardActive) {
      const compactHint = innerWidth >= keyboardHint.length
        ? keyboardHint
        : 'click board to use keyboard'
      writeCentered(canvas, compactHint, 1, layout.statusBandY, innerWidth, 1, WOOD, PAPER)
      hintOnThirdLine = true
    }
  } else if (!props.keyboardActive) {
    if (keyboardHint.length > innerWidth) {
      writeCentered(canvas, 'click the board', 1, layout.hintY, innerWidth, 1, WOOD, PAPER)
      writeCentered(
        canvas,
        'to use the keyboard',
        1,
        layout.statusBandY,
        innerWidth,
        1,
        WOOD,
        PAPER,
      )
      hintOnThirdLine = true
    } else {
      writeCentered(canvas, keyboardHint, 1, layout.hintY, innerWidth, 1, WOOD, PAPER)
    }
  }

  if (!hintOnThirdLine) {
    fillRect(canvas, 1, layout.statusBandY, innerWidth, 1, PLAYER, PAPER_ALT)
  }

  const paintTile = (row: number, col: number, label: string, key: string) => {
    const position = layout.tilePosition(row, col)
    const backgroundColor = selected === key
      ? CURSOR
      : (row + col) % 2 === 0 ? PAPER : PAPER_ALT
    const color = selected === key ? GIVEN : PLAYER
    fillRect(
      canvas,
      position.x,
      position.y,
      layout.tileWidth,
      layout.tileHeight,
      color,
      backgroundColor,
      ' ',
      true,
    )
    if (label) {
      writeCentered(
        canvas,
        label,
        position.x,
        position.y,
        layout.tileWidth,
        layout.tileHeight,
        color,
        backgroundColor,
        true,
      )
    }
  }

  const digits = [
    [7, 8, 9],
    [4, 5, 6],
    [1, 2, 3],
  ]

  for (let row = 0; row < digits.length; row++) {
    for (let col = 0; col < 3; col++) {
      const digit = digits[row]![col]!
      paintTile(row, col, String(digit), `digit:${digit}`)
    }
  }

  for (let col = 0; col < 3; col++) {
    paintTile(3, col, '', 'digit:0')
  }

  const clearColor = selected === 'digit:0' ? GIVEN : PLAYER
  const clearText = '0 Clear'
  const clearX = layout.keypadX + Math.floor((layout.keypadWidth - clearText.length) / 2)
  const clearTextY = layout.clearY + Math.floor(layout.tileHeight / 2)
  for (let index = 0; index < clearText.length; index++) {
    const x = clearX + index
    const cell = canvas.cells[clearTextY]![x]!
    setCell(canvas, x, clearTextY, {
      ...cell,
      character: clearText[index]!,
      color: clearColor,
      bold: true,
    })
  }

  const newBackground = selected === 'new' ? CURSOR : PAPER_ALT
  const newColor = selected === 'new' ? GIVEN : PLAYER
  fillRect(canvas, 1, layout.newY, innerWidth, layout.tileHeight, newColor, newBackground, ' ', true)
  writeCentered(
    canvas,
    'New game',
    1,
    layout.newY,
    innerWidth,
    layout.tileHeight,
    newColor,
    newBackground,
    true,
  )

  return toElement(surface.elements, canvas)
}

export default Controls
