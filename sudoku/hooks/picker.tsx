import type { ClientModule } from 'claude-code'

import type { Difficulty, PickerMessage, PickerProps } from '../types'
import { geometryAtScale, pickerHeight } from './geometry'
import { CURSOR, FINE_LINE, GIVEN, PAPER, WOOD } from './palette'

const DIFFICULTIES: { difficulty: Difficulty; key: string; label: string; givens: number }[] = [
  { difficulty: 'easy', key: 'e', label: 'Easy', givens: 40 },
  { difficulty: 'medium', key: 'm', label: 'Medium', givens: 32 },
  { difficulty: 'hard', key: 'h', label: 'Hard', givens: 26 },
]

type PickerState = { selected: number }

const Picker: ClientModule<PickerProps, PickerState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const geometry = geometryAtScale(props.geometry.scale)
  const cardWidth = geometry.width
  const innerWidth = geometry.innerWidth
  const cancelIndex = DIFFICULTIES.length
  const rowCount = cancelIndex + (props.hasGame ? 1 : 0)
  const cardHeight = pickerHeight(rowCount)
  const defaultDifficulty = props.difficulty ?? 'medium'
  const defaultIndex = DIFFICULTIES.findIndex(option => option.difficulty === defaultDifficulty)
  const selected = surface.state?.selected ?? Math.max(0, defaultIndex)
  const send = (message: PickerMessage) => surface.post(message)
  const choose = (difficulty: Difficulty) => send({ type: 'choose', difficulty })
  const cancel = () => send({ type: 'cancel' })

  const selectRow = (index: number) => {
    if (index < cancelIndex) choose(DIFFICULTIES[index]!.difficulty)
    else if (props.hasGame && index === cancelIndex) cancel()
  }

  surface.onKey(event => {
    const direct = DIFFICULTIES.find(option => option.key === event.key)
    if (direct) return choose(direct.difficulty)
    if (event.key === 'c' && props.hasGame) return cancel()

    const delta = event.key === 'up' || event.key === 'w'
      ? -1
      : event.key === 'down' || event.key === 's' ? 1 : 0
    if (delta !== 0) {
      surface.setState({ selected: (selected + delta + rowCount) % rowCount })
      return
    }

    if (event.key === 'return' || event.key === 'enter') selectRow(selected)
  })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const index = geometry.pickerRowAt(event.x, event.y, rowCount, cardHeight)
    if (index !== null) selectRow(index)
  })

  const centeredText = (value: string): string => {
    const left = Math.max(0, Math.floor((innerWidth - value.length) / 2))
    return `${' '.repeat(left)}${value}`.padEnd(innerWidth)
  }

  const row = (index: number, key: string, label: string, givens?: number) => {
    const isSelected = selected === index
    const text = givens === undefined
      ? `${key}  ${label}`
      : `${key}  ${label.padEnd(8)} ${givens} given`

    return (
      <Text
        key={`row:${key}`}
        bold={isSelected}
        color={isSelected ? GIVEN : WOOD}
        backgroundColor={isSelected ? CURSOR : PAPER}
      >
        {centeredText(text)}
      </Text>
    )
  }

  const separator = () => (
    <Text color={FINE_LINE} backgroundColor={PAPER}>{'─'.repeat(innerWidth)}</Text>
  )

  return (
    <Box
      flexDirection="column"
      width={cardWidth}
      height={cardHeight}
      borderStyle="bold"
      borderColor={WOOD}
      backgroundColor={PAPER}
    >
      <Text bold color={WOOD} backgroundColor={PAPER}>
        {centeredText('Choose a difficulty')}
      </Text>
      {separator()}
      {row(0, DIFFICULTIES[0]!.key, DIFFICULTIES[0]!.label, DIFFICULTIES[0]!.givens)}
      {separator()}
      {row(1, DIFFICULTIES[1]!.key, DIFFICULTIES[1]!.label, DIFFICULTIES[1]!.givens)}
      {separator()}
      {row(2, DIFFICULTIES[2]!.key, DIFFICULTIES[2]!.label, DIFFICULTIES[2]!.givens)}
      {props.hasGame && (
        <>
          {separator()}
          {row(cancelIndex, 'c', 'Cancel')}
        </>
      )}
    </Box>
  )
}

export default Picker
