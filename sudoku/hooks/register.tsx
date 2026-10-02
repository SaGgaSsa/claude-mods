import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardMessage, BoardProps, SudokuGame } from '../types'
import { conflicts, moveCursor, newGame, setDigit } from './sudoku'

const PANE = 'sudoku'
const BOARD = 'board'
const game = atom({ plugin: 'sudoku', key: 'game' } as const, null)

// One saved game per workspace folder.
const storeKey = async ($: EngineInterface) => `game:${await $.session.cwd()}`

const save = async ($: EngineInterface, next: SudokuGame | null) => {
  await $.store.set(await storeKey($), next)
}

const change = async ($: EngineInterface, fn: (current: SudokuGame) => SudokuGame) => {
  const next = await update($, game, current => (current ? fn(current) : current))
  await save($, next)
  if (next?.isSolved) $.ui.toast('Sudoku solved!')
  return next
}

const startNewGame = async ($: EngineInterface) => {
  const fresh = newGame()
  await update($, game, () => fresh)
  await save($, fresh)
}

const openPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: 'Sudoku', focus: true, rows: 26, columns: 44 })
  // Hand the keys to the board when the surface allows it; a click does too.
  await $.ui.focus({ requestId: PANE, key: BOARD }).catch(() => undefined)
}

const boardProps = (current: SudokuGame): BoardProps => ({
  puzzle: current.puzzle,
  board: current.board,
  cursor: current.cursor,
  clashes: [...conflicts(current.board)],
})

const applyMessage = (current: SudokuGame, message: BoardMessage): SudokuGame => {
  switch (message.type) {
    case 'select':
      return { ...current, cursor: message.index }
    case 'move':
      return moveCursor(current, message.rows, message.cols)
    case 'digit':
      return setDigit(current, message.digit)
  }
}

const MOVES = [
  { hotkey: 'w', label: '↑', rows: -1, cols: 0 },
  { hotkey: 'a', label: '←', rows: 0, cols: -1 },
  { hotkey: 's', label: '↓', rows: 1, cols: 0 },
  { hotkey: 'd', label: '→', rows: 0, cols: 1 },
]

// Laid out like a numeric keypad.
const KEYPAD = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sudoku',
      description: 'Play the sudoku saved for this folder in a pane',
    })

    const saved = (await $.store.get(`game:${e.cwd}`)) as SudokuGame | undefined
    await update($, game, () => saved ?? null)

    return next(e)
  })

  on('command.run', { command: 'sudoku' }, async $ => {
    if (!(await read($, game))) await startNewGame($)
    await openPane($)

    return { text: 'Sudoku pane opened.' }
  })

  // Keys and clicks on the board arrive here; they never reach the prompt.
  on('ui.message', { requestId: PANE, element: BOARD }, async ($, e) => {
    const next = await change($, current => applyMessage(current, e.data as BoardMessage))

    return next ? { props: boardProps(next) } : {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const current = await read($, game)

    if (!current) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No sudoku in this folder yet.</Text>
          <Button key="new" hotkey="n" plain label="New game" onPress={() => startNewGame($)} />
        </Box>
      )
    }

    const props = boardProps(current)
    const filled = [...current.board].filter(digit => digit !== '0').length
    const enter = (digit: number) => () => change($, g => setDigit(g, digit))
    const move = (rows: number, cols: number) => () => change($, g => moveCursor(g, rows, cols))

    const status = current.isSolved ? (
      <Text bold color="green">Solved! Press n for a new game.</Text>
    ) : (
      <Text>
        <Text dimColor>{filled}/81 filled</Text>
        {props.clashes.length > 0 && <Text color="red">{` · ${props.clashes.length} in conflict`}</Text>}
      </Text>
    )

    const moveButton = (index: number) => {
      const one = MOVES[index]!
      return (
        <Button key={`move:${one.hotkey}`} plain hotkey={one.hotkey} label={one.label} onPress={move(one.rows, one.cols)} />
      )
    }

    // Only the terminal draws a Client; elsewhere the keypad still plays.
    const Client = 'Client' in elements ? elements.Client : undefined
    const board = Client ? (
      <Client key={BOARD} module="./board.tsx" props={props} width={39} height={17} />
    ) : (
      <Text dimColor>The board needs the terminal.</Text>
    )

    return (
      <Box flexDirection="column">
        {board}
        <Text> </Text>
        {status}
        <Text dimColor>Click the board for the keyboard: arrows, 1-9, 0/⌫ · Esc releases it</Text>
        <Text> </Text>
        <Box flexDirection="row" columnGap={4}>
          <Box flexDirection="column">
            {KEYPAD.map(line => (
              <Box key={`keys:${line[0]}`} flexDirection="row" columnGap={1}>
                {line.map(digit => (
                  <Button key={`digit:${digit}`} hotkey={String(digit)} label={String(digit)} onPress={enter(digit)} />
                ))}
              </Box>
            ))}
            <Button key="clear" hotkey="0" label="0  Clear" onPress={enter(0)} />
          </Box>
          <Box flexDirection="column">
            <Box flexDirection="row" paddingLeft={4}>{moveButton(0)}</Box>
            <Box flexDirection="row" columnGap={3}>{moveButton(1)}{moveButton(3)}</Box>
            <Box flexDirection="row" paddingLeft={4}>{moveButton(2)}</Box>
            <Text> </Text>
            <Button key="new" plain hotkey="n" label="New game" onPress={() => startNewGame($)} />
          </Box>
        </Box>
      </Box>
    )
  })
}
