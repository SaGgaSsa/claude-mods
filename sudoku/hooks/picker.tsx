import type { ClientModule } from 'claude-code'

import type { Difficulty, PickerMessage, PickerProps } from '../types'
import { geometryAtScale, pickerHeight } from './geometry'
import { createCanvas, drawFrame, fillRect, horizontalLine, toElement, writeCentered } from './canvas'
import { CURSOR, FINE_LINE, GIVEN, PAPER, WOOD } from './palette'

const DIFFICULTIES: { difficulty: Difficulty; key: string; label: string; givens: number }[] = [
  { difficulty: 'easy', key: 'e', label: 'Easy', givens: 40 },
  { difficulty: 'medium', key: 'm', label: 'Medium', givens: 32 },
  { difficulty: 'hard', key: 'h', label: 'Hard', givens: 26 },
]

type PickerState = { selected: number }

const Picker: ClientModule<PickerProps, PickerState> = (props, surface) => {
  const geometry = geometryAtScale(props.geometry.scale)
  const rowCount = DIFFICULTIES.length + (props.hasGame ? 1 : 0)
  const height = pickerHeight(rowCount)
  const defaultDifficulty = props.difficulty ?? 'medium'
  const defaultIndex = DIFFICULTIES.findIndex(option => option.difficulty === defaultDifficulty)
  const selected = surface.state?.selected ?? Math.max(0, defaultIndex)
  const send = (message: PickerMessage) => surface.post(message)

  const chooseRow = (index: number) => {
    const option = DIFFICULTIES[index]
    if (option) return send({ type: 'choose', difficulty: option.difficulty })
    if (props.hasGame && index === DIFFICULTIES.length) send({ type: 'cancel' })
  }

  surface.onKey(event => {
    const direct = DIFFICULTIES.find(option => option.key === event.key)
    if (direct) return chooseRow(DIFFICULTIES.indexOf(direct))
    if (event.key === 'c' && props.hasGame) return send({ type: 'cancel' })

    if (/^[1-9]$/.test(event.key)) {
      return send({ type: 'digit', digit: Number(event.key) })
    }
    if (['0', 'backspace', 'delete', ' '].includes(event.key)) {
      return send({ type: 'digit', digit: 0 })
    }

    const previous = ['up', 'w', 'left', 'a'].includes(event.key)
    const next = ['down', 's', 'right', 'd'].includes(event.key)
    if (previous || next) {
      const delta = previous ? -1 : 1
      surface.setState({ selected: (selected + delta + rowCount) % rowCount })
      return send({ type: 'input' })
    }

    if (event.key === 'return' || event.key === 'enter') chooseRow(selected)
    else send({ type: 'input' })
  })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const index = geometry.pickerRowAt(event.x, event.y, rowCount, height)
    if (index === null) send({ type: 'input' })
    else chooseRow(index)
  })

  const canvas = createCanvas(geometry.width, height, PAPER)
  drawFrame(canvas, WOOD)
  const innerWidth = geometry.width - 2
  const title = 'Choose a difficulty'
  writeCentered(canvas, title, 1, geometry.pickerTitleY, innerWidth, 1, WOOD, PAPER, true)
  horizontalLine(
    canvas,
    1,
    geometry.pickerTitleRuleY,
    innerWidth,
    '\u2500',
    FINE_LINE,
    PAPER,
  )

  for (let index = 0; index < rowCount; index++) {
    const y = geometry.pickerRowY(index)
    const option = DIFFICULTIES[index]
    const key = option?.key ?? 'c'
    const label = option
      ? `${key}  ${option.label.padEnd(8)} ${option.givens} given`
      : 'c  Cancel'
    const backgroundColor = selected === index ? CURSOR : PAPER
    const color = selected === index ? GIVEN : WOOD

    fillRect(canvas, 1, y, innerWidth, 1, color, backgroundColor, ' ', selected === index)
    writeCentered(canvas, label, 1, y, innerWidth, 1, color, backgroundColor, selected === index)
    if (index < rowCount - 1) {
      horizontalLine(canvas, 1, y + 1, innerWidth, '\u2500', FINE_LINE, PAPER)
    }
  }

  return toElement(surface.elements, canvas)
}

export default Picker
