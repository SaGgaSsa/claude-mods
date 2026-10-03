import type { ClientModule } from 'claude-code'

import type { ControlsMessage, ControlsProps } from '../types'
import { CLASH_BACKGROUND, PAPER, PAPER_ALT, WOOD } from './palette'

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

const titleCase = (difficulty: ControlsProps['difficulty']) =>
  `${difficulty[0]!.toUpperCase()}${difficulty.slice(1)}`

const Controls: ClientModule<ControlsProps> = (props, surface) => {
  const { Box, Text, Button } = surface.elements
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
      return withGeometry({ type: 'digit', digit: Number(event.key) })
    }
    if (['0', 'backspace', 'delete', ' '].includes(event.key)) {
      return withGeometry({ type: 'digit', digit: 0 })
    }
    if (event.key === 'n') {
      return withGeometry({ type: 'new' })
    }
    withGeometry({ type: 'input' })
  })

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
      backgroundColor={WOOD}
    >
      <Text bold color={props.isSolved ? '#8fd18f' : PAPER}>{status}</Text>
      {props.clashes > 0 && <Text color={CLASH_BACKGROUND}>{`${props.clashes} in conflict`}</Text>}
      {!props.keyboardActive && <Text color={PAPER_ALT}>Click the board to use the keyboard</Text>}
      <Button
        key="new"
        hotkey="n"
        label="New game"
        variant="primary"
        onPress={() => withGeometry({ type: 'new' })}
      />
    </Box>
  )
}

export default Controls
