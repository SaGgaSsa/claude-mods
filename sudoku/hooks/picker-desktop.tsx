import type { ClientModule } from 'claude-code'

import type { Difficulty, PickerMessage, PickerProps } from '../types'
import { CURSOR, GIVEN, PAPER, PLAYER, WOOD } from './palette'

const DIFFICULTIES: { difficulty: Difficulty; hotkey: string; label: string; givens: number }[] = [
  { difficulty: 'easy', hotkey: 'e', label: 'Easy', givens: 40 },
  { difficulty: 'medium', hotkey: 'm', label: 'Medium', givens: 32 },
  { difficulty: 'hard', hotkey: 'h', label: 'Hard', givens: 26 },
]

type PickerState = { selected: number }

const Picker: ClientModule<PickerProps, PickerState> = (props, surface) => {
  const { Box, Text, Button } = surface.elements
  const rowCount = DIFFICULTIES.length + (props.hasGame ? 1 : 0)
  const defaultIndex = DIFFICULTIES.findIndex(option => option.difficulty === props.difficulty)
  const selected = surface.state?.selected ?? Math.max(0, defaultIndex)
  const send = (message: PickerMessage) => surface.post(message)

  const chooseRow = (index: number) => {
    const option = DIFFICULTIES[index]
    if (option) send({ type: 'choose', difficulty: option.difficulty })
    else if (props.hasGame && index === DIFFICULTIES.length) send({ type: 'cancel' })
  }

  surface.onKey(event => {
    const direct = DIFFICULTIES.find(option => option.hotkey === event.key)
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

  return (
    <Box flexDirection="column" rowGap={1} padding={1} backgroundColor={PAPER}>
      <Text bold color={WOOD}>Choose a difficulty</Text>
      {DIFFICULTIES.map((option, index) => {
        const isSelected = selected === index
        return (
          <Button
            key={`difficulty:${option.difficulty}`}
            hotkey={option.hotkey}
            label={`${option.label} \u00b7 ${option.givens} given`}
            color={isSelected ? GIVEN : PLAYER}
            backgroundColor={isSelected ? CURSOR : PAPER}
            onPress={() => send({ type: 'choose', difficulty: option.difficulty })}
          />
        )
      })}
      {props.hasGame && (
        <Button
          key="cancel"
          hotkey="c"
          plain
          label="Cancel"
          color={PLAYER}
          onPress={() => send({ type: 'cancel' })}
        />
      )}
    </Box>
  )
}

export default Picker
