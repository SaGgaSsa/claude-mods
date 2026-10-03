import type { ClientModule } from 'claude-code'

import type { ControlsMessage, ControlsProps } from '../types'
import { desktopBoardDimensions } from './desktop-shared'
import { CLASH, PAPER, PLAYER, WOOD } from './palette'

type ControlsState = { selected: string | null }
type ControlsAction =
  | { type: 'digit'; digit: number }
  | { type: 'move'; rows: number; cols: number }
  | { type: 'new' }
  | { type: 'input' }

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

const DIGITS = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9],
]

const titleCase = (difficulty: ControlsProps['difficulty']) =>
  `${difficulty[0]!.toUpperCase()}${difficulty.slice(1)}`

const Controls: ClientModule<ControlsProps, ControlsState> = (props, surface) => {
  const { Box, Text, Button } = surface.elements
  const selected = surface.state?.selected ?? null
  const send = (message: ControlsMessage) => surface.post(message)
  const withGeometry = (message: ControlsAction) => {
    switch (message.type) {
      case 'digit':
        return send({ ...message, geometry: props.geometry })
      case 'move':
        return send({ ...message, geometry: props.geometry })
      case 'new':
        return send({ ...message, geometry: props.geometry })
      case 'input':
        return send({ ...message, geometry: props.geometry })
    }
  }

  surface.onKey(event => {
    const move = MOVES[event.key]
    if (move) return withGeometry({ type: 'move', rows: move[0], cols: move[1] })
    if (/^[1-9]$/.test(event.key)) {
      const key = `digit:${event.key}`
      surface.setState({ selected: key })
      return withGeometry({ type: 'digit', digit: Number(event.key) })
    }
    if (['0', 'backspace', 'delete', ' '].includes(event.key)) {
      surface.setState({ selected: 'digit:0' })
      return withGeometry({ type: 'digit', digit: 0 })
    }
    if (event.key === 'n') {
      surface.setState({ selected: 'new' })
      return withGeometry({ type: 'new' })
    }
    withGeometry({ type: 'input' })
  })

  const enter = (digit: number) => {
    const key = `digit:${digit}`
    surface.setState({ selected: key })
    withGeometry({ type: 'digit', digit })
  }

  const status = props.isSolved
    ? 'Solved!'
    : `${titleCase(props.difficulty)} \u00b7 ${props.filled}/81 filled`

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      rowGap={1}
      padding={1}
      width="100%"
      backgroundColor={PAPER}
    >
      <Text bold color={props.isSolved ? '#245a2c' : WOOD}>{status}</Text>
      {props.clashes > 0 && <Text color={CLASH}>{`${props.clashes} in conflict`}</Text>}
      {!props.keyboardActive && <Text color={PLAYER}>Click the board to use the keyboard</Text>}
      <Box flexDirection="column" alignItems="center" rowGap={1}>
        {DIGITS.map((row, rowIndex) => (
          <Box key={`digits:${rowIndex}`} flexDirection="row" justifyContent="center" columnGap={1}>
            {row.map(digit => {
              const key = `digit:${digit}`
              const isSelected = selected === key
              return (
                <Button
                  key={key}
                  hotkey={String(digit)}
                  label={String(digit)}
                  variant={isSelected ? 'primary' : 'secondary'}
                  onPress={() => enter(digit)}
                />
              )
            })}
            {rowIndex === 1 && (
              <Button
                key="digit:0"
                hotkey="0"
                label="Clear"
                variant={selected === 'digit:0' ? 'primary' : 'secondary'}
                onPress={() => enter(0)}
              />
            )}
            {rowIndex === 1 && (
              <Button
                key="new"
                hotkey="n"
                label="New game"
                variant={selected === 'new' ? 'primary' : 'secondary'}
                onPress={() => {
                  surface.setState({ selected: 'new' })
                  withGeometry({ type: 'new' })
                }}
              />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default Controls
