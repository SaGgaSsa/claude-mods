import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type {
  BoardMessage,
  BoardProps,
  Difficulty,
  GeometryProps,
  PickerMessage,
  PickerProps,
  SudokuGame,
} from '../types'
import { conflicts, moveCursor, newGame, setDigit } from './sudoku'
import { boardContentHeight, geometryForPanel, pickerHeight } from './geometry'

const PANE = 'sudoku'
const BOARD = 'board'
const PICKER = 'picker'
const game = atom({ plugin: 'sudoku', key: 'game' } as const, null)
const selectingDifficulty = atom(
  { plugin: 'sudoku', key: 'selectingDifficulty' } as const,
  false,
)

const DIFFICULTIES: { difficulty: Difficulty; hotkey: string; label: string; givens: number }[] = [
  { difficulty: 'easy', hotkey: 'e', label: 'Easy', givens: 40 },
  { difficulty: 'medium', hotkey: 'm', label: 'Medium', givens: 32 },
  { difficulty: 'hard', hotkey: 'h', label: 'Hard', givens: 26 },
]

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

const showDifficultyPicker = async ($: EngineInterface) => {
  await update($, selectingDifficulty, () => true)
  await focusPicker($)
}

const chooseDifficulty = async ($: EngineInterface, difficulty: Difficulty) => {
  const fresh = newGame(difficulty)
  await update($, game, () => fresh)
  await save($, fresh)
  await update($, selectingDifficulty, () => false)
  await $.ui.focus({ requestId: PANE, key: BOARD }).catch(() => undefined)
}

const cancelDifficultyPicker = async ($: EngineInterface) => {
  await update($, selectingDifficulty, () => false)
  await $.ui.focus({ requestId: PANE, key: BOARD }).catch(() => undefined)
}

const focusPicker = async ($: EngineInterface) => {
  await $.ui.focus({ requestId: PANE, key: PICKER }).catch(() => undefined)
}

const openPane = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: 'Sudoku', focus: true, rows: 30, columns: 48 })
  const key = await read($, selectingDifficulty) ? PICKER : BOARD
  await $.ui.focus({ requestId: PANE, key }).catch(() => undefined)
}

const boardProps = (current: SudokuGame, geometry: GeometryProps): BoardProps => ({
  puzzle: current.puzzle,
  board: current.board,
  cursor: current.cursor,
  clashes: [...conflicts(current.board)],
  geometry,
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

const applyPickerMessage = async ($: EngineInterface, message: PickerMessage) => {
  if (message.type === 'choose') await chooseDifficulty($, message.difficulty)
  else await cancelDifficultyPicker($)
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

    const saved = (await $.store.get(`game:${e.cwd}`)) as
      | (Omit<SudokuGame, 'difficulty'> & { difficulty?: Difficulty })
      | undefined
    const loaded = saved ? { ...saved, difficulty: saved.difficulty ?? 'medium' } : null
    await update($, game, () => loaded)
    await update($, selectingDifficulty, () => !loaded)

    return next(e)
  })

  on('command.run', { command: 'sudoku' }, async $ => {
    if (!(await read($, game))) await showDifficultyPicker($)
    await openPane($)

    return { text: 'Sudoku pane opened.' }
  })

  // Keys and clicks on the board arrive here; they never reach the prompt.
  on('ui.message', { requestId: PANE, element: BOARD }, async ($, e) => {
    const message = e.data as BoardMessage
    const next = await change($, current => applyMessage(current, message))

    return next ? { props: boardProps(next, message.geometry) } : {}
  })

  on('ui.message', { requestId: PANE, element: PICKER }, async ($, e) => {
    await applyPickerMessage($, e.data as PickerMessage)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const current = await read($, game)
    const choosingDifficulty = await read($, selectingDifficulty)
    const bodyRows = e.props.scroll?.bodyRows
    const bodyColumns = e.props.bodyColumns
    const geometry = geometryForPanel(bodyColumns, bodyRows)

    const centerContent = (
      content: RenderElement,
      contentHeight: number,
      contentWidth: number,
    ): RenderElement => {
      const centerVertically = typeof bodyRows === 'number' && bodyRows > contentHeight
      const centerHorizontally = typeof bodyColumns === 'number' && bodyColumns > contentWidth
      if (!centerVertically && !centerHorizontally) return content

      return (
        <Box
          flexDirection="column"
          height={centerVertically ? bodyRows : undefined}
          width={centerHorizontally ? bodyColumns : undefined}
          justifyContent={centerVertically ? 'center' : undefined}
          alignItems={centerHorizontally ? 'center' : undefined}
        >
          {content}
        </Box>
      )
    }

    if (!current || choosingDifficulty) {
      const Client = 'Client' in elements ? elements.Client : undefined
      const pickerProps: PickerProps = {
        difficulty: current?.difficulty ?? null,
        hasGame: current !== null,
        geometry,
      }
      const cardHeight = pickerHeight(current ? 4 : 3)
      const picker = Client ? (
        <Client
          key={PICKER}
          module="./picker.tsx"
          props={pickerProps}
          width={geometry.width}
          height={cardHeight}
        />
      ) : (
        <Box flexDirection="column" rowGap={1}>
          <Text bold>Choose a difficulty</Text>
          {DIFFICULTIES.map(option => (
            <Box key={`difficulty:${option.difficulty}`} flexDirection="row" columnGap={2}>
              <Button
                key={option.difficulty}
                hotkey={option.hotkey}
                label={option.label}
                onPress={() => chooseDifficulty($, option.difficulty)}
              />
              <Text>{`${option.givens} given numbers`}</Text>
            </Box>
          ))}
          {current && (
            <Button
              key="cancel"
              hotkey="c"
              plain
              label="Cancel"
              onPress={() => cancelDifficultyPicker($)}
            />
          )}
        </Box>
      )
      const fallbackHeight = current ? 9 : 7
      const contentHeight = Client ? cardHeight : fallbackHeight
      return centerContent(picker, contentHeight, geometry.width)
    }

    const props = boardProps(current, geometry)
    const filled = [...current.board].filter(digit => digit !== '0').length
    const enter = (digit: number) => () => change($, g => setDigit(g, digit))
    const move = (rows: number, cols: number) => () => change($, g => moveCursor(g, rows, cols))

    const status = current.isSolved ? (
      <Text>
        <Text bold color="green">Solved! </Text>
        <Text>
          {`${current.difficulty[0]!.toUpperCase()}${current.difficulty.slice(1)} · ${filled}/81 filled`}
        </Text>
        <Text dimColor> · Press n for a new game.</Text>
      </Text>
    ) : (
      <Text>
        <Text dimColor>
          {`${current.difficulty[0]!.toUpperCase()}${current.difficulty.slice(1)} · ${filled}/81 filled`}
        </Text>
        {props.clashes.length > 0 && <Text color="red">{` · ${props.clashes.length} in conflict`}</Text>}
      </Text>
    )

    const moveButton = (index: number) => {
      const one = MOVES[index]!
      return (
        <Button
          key={`move:${one.hotkey}`}
          plain
          hotkey={one.hotkey}
          label={one.label}
          onPress={move(one.rows, one.cols)}
        />
      )
    }

    // Only the terminal draws a Client; elsewhere the keypad still plays.
    const Client = 'Client' in elements ? elements.Client : undefined
    const content = (
      <Box flexDirection="column">
        {Client ? (
          <Client
            key={BOARD}
            module="./board.tsx"
            props={props}
            width={geometry.width}
            height={geometry.height}
          />
        ) : (
          <Text dimColor>The board needs the terminal.</Text>
        )}
        <Text> </Text>
        {status}
        <Text> </Text>
        <Box flexDirection="row" columnGap={4}>
          <Box flexDirection="column">
            {KEYPAD.map(line => (
              <Box key={`keys:${line[0]}`} flexDirection="row" columnGap={1}>
                {line.map(digit => (
                  <Button
                    key={`digit:${digit}`}
                    hotkey={String(digit)}
                    label={String(digit)}
                    onPress={enter(digit)}
                  />
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
            <Button
              key="new"
              plain
              hotkey="n"
              label="New game"
              onPress={() => showDifficultyPicker($)}
            />
          </Box>
        </Box>
      </Box>
    )
    const contentHeight = Client ? boardContentHeight(geometry) : 9
    return centerContent(content, contentHeight, geometry.width)
  })
}
