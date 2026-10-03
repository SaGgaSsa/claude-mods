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

type ControlsState = { selected: 'new' | null }
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
      return send({ type: 'digit', digit: Number(event.key), geometry: props.geometry })
    }
    if (['0', 'backspace', 'delete', ' '].includes(event.key)) {
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
    send({ type: 'new', geometry: props.geometry })
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

  const newBackground = selected === 'new' ? CURSOR : PAPER_ALT
  const newColor = selected === 'new' ? GIVEN : PLAYER
  fillRect(canvas, 1, layout.newY, innerWidth, layout.buttonHeight, newColor, newBackground, ' ', true)
  writeCentered(
    canvas,
    'New game',
    1,
    layout.newY,
    innerWidth,
    layout.buttonHeight,
    newColor,
    newBackground,
    true,
  )

  return toElement(surface.elements, canvas)
}

export default Controls
