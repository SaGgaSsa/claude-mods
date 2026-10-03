import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type {
  BoardMessage,
  BoardProps,
  ControlsMessage,
  ControlsProps,
  Difficulty,
  GeometryProps,
  PickerMessage,
  PickerProps,
  SudokuGame,
} from '../types'
import { desktopBoardDimensions } from './desktop-shared'
import { boardContentHeight, controlsHeight, geometryForPanel, pickerHeight } from './geometry'
import { PAPER, PLAYER, WOOD } from './palette'
import { conflicts, moveCursor, newGame, setDigit } from './sudoku'

const PANE = 'sudoku'
const BOARD = 'board'
const PICKER = 'picker'
const CONTROLS = 'controls'
const game = atom({ plugin: 'sudoku', key: 'game' } as const, null)
const keyboardActive = atom({ plugin: 'sudoku', key: 'keyboardActive' } as const, false)
const selectingDifficulty = atom(
  { plugin: 'sudoku', key: 'selectingDifficulty' } as const,
  false,
)

const DIFFICULTIES: { difficulty: Difficulty; hotkey: string; label: string; givens: number }[] = [
  { difficulty: 'easy', hotkey: 'e', label: 'Easy', givens: 40 },
  { difficulty: 'medium', hotkey: 'm', label: 'Medium', givens: 32 },
  { difficulty: 'hard', hotkey: 'h', label: 'Hard', givens: 26 },
]

const FALLBACK_KEYS = new Set([
  'easy', 'medium', 'hard', 'cancel', 'new', 'clear',
  'digit:1', 'digit:2', 'digit:3', 'digit:4', 'digit:5',
  'digit:6', 'digit:7', 'digit:8', 'digit:9',
])

export const focusTarget = (
  element: string | undefined,
  plugin: string | undefined,
  choosingDifficulty: boolean,
): string | undefined => {
  if (!element) return undefined
  if (plugin === 'sudoku' && FALLBACK_KEYS.has(element)) return element
  return choosingDifficulty ? PICKER : BOARD
}

export const scrollPlan = (
  origin: 'person' | 'plugin',
  hasPointer: boolean,
  by: number,
  choosingDifficulty: boolean,
) => ({
  consume: origin === 'person' && !hasPointer,
  rowDelta: origin === 'person' && !hasPointer && !choosingDifficulty ? Math.sign(by) : 0,
})

// One saved game per workspace folder.
const storeKey = async ($: EngineInterface) => `game:${await $.session.cwd()}`

const save = async ($: EngineInterface, next: SudokuGame | null) => {
  await $.store.set(await storeKey($), next)
}

// Reads only, so a drawing may call it. Saves written before `difficulty` existed load as medium.
const savedGame = async ($: EngineInterface, cwd?: string): Promise<SudokuGame | null> => {
  const key = cwd === undefined ? await storeKey($) : `game:${cwd}`
  const saved = (await $.store.get(key)) as
    | (Omit<SudokuGame, 'difficulty'> & { difficulty?: Difficulty })
    | undefined
  return saved ? { ...saved, difficulty: saved.difficulty ?? 'medium' } : null
}

// `/clear` empties `$.state` without a new `session.start`; the folder's game is still in the store.
const currentGame = async ($: EngineInterface) => {
  const live = await read($, game)
  if (live) return live
  const saved = await savedGame($)
  if (saved) await update($, game, () => saved)
  return saved
}

const change = async ($: EngineInterface, fn: (current: SudokuGame) => SudokuGame) => {
  await currentGame($)
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

const controlsProps = (
  current: SudokuGame,
  geometry: GeometryProps,
  keyboardUsed: boolean,
): ControlsProps => ({
  difficulty: current.difficulty,
  filled: [...current.board].filter(digit => digit !== '0').length,
  clashes: conflicts(current.board).size,
  isSolved: current.isSolved,
  keyboardActive: keyboardUsed,
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
    case 'new':
    case 'input':
      return current
  }
}

const applyPickerMessage = async ($: EngineInterface, message: PickerMessage) => {
  if (message.type === 'choose') await chooseDifficulty($, message.difficulty)
  else if (message.type === 'cancel') await cancelDifficultyPicker($)
  else if (message.type === 'digit') await change($, current => setDigit(current, message.digit))
}

const applyControlsMessage = async ($: EngineInterface, message: ControlsMessage) => {
  await update($, keyboardActive, () => true)

  if (message.type === 'input' || message.type === 'focus') {
    const current = await currentGame($)
    if (message.type === 'focus') {
      await $.ui.focus({ requestId: PANE, key: BOARD }).catch(() => undefined)
    }
    return current ? { props: controlsProps(current, message.geometry, true) } : {}
  }

  if (message.type === 'new') {
    await showDifficultyPicker($)
    return {}
  }

  const current = await change($, game => message.type === 'digit'
    ? setDigit(game, message.digit)
    : moveCursor(game, message.rows, message.cols))
  await $.ui.focus({ requestId: PANE, key: BOARD }).catch(() => undefined)
  return current ? { props: controlsProps(current, message.geometry, true) } : {}
}

const titleCase = (difficulty: Difficulty) =>
  `${difficulty[0]!.toUpperCase()}${difficulty.slice(1)}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sudoku',
      description: 'Play the sudoku saved for this folder in a pane',
    })

    const loaded = await savedGame($, e.cwd)
    await update($, game, () => loaded)
    await update($, selectingDifficulty, () => !loaded)
    return next(e)
  })

  on('command.run', { command: 'sudoku' }, async $ => {
    await update($, keyboardActive, () => false)
    if (!(await currentGame($))) await showDifficultyPicker($)
    await openPane($)

    return { text: 'Sudoku pane opened.' }
  })

  // The ring follows the active Client; engine stops such as the close mark pass through.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const target = focusTarget(e.element, e.plugin, await read($, selectingDifficulty))
    if (!target || e.element === target) return next(e)
    return next({ ...e, element: target })
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const choosingDifficulty = await read($, selectingDifficulty)
    const plan = scrollPlan(e.origin.kind, Boolean(e.pointer), e.by, choosingDifficulty)
    if (!plan.consume) return next(e)

    if (plan.rowDelta !== 0) {
      await change($, current => moveCursor(current, plan.rowDelta, 0))
    }
    return {}
  })

  // Keys and clicks on the board arrive here; they never reach the prompt.
  on('ui.message', { requestId: PANE, element: BOARD }, async ($, e) => {
    const message = e.data as BoardMessage
    await update($, keyboardActive, () => true)

    if (message.type === 'new') {
      await showDifficultyPicker($)
      return {}
    }

    const current = await currentGame($)
    const next = message.type === 'input'
      ? current
      : current ? await change($, value => applyMessage(value, message)) : null

    return next ? { props: boardProps(next, message.geometry) } : {}
  })

  on('ui.message', { requestId: PANE, element: PICKER }, async ($, e) => {
    await update($, keyboardActive, () => true)
    await applyPickerMessage($, e.data as PickerMessage)
    return {}
  })

  on('ui.message', { requestId: PANE, element: CONTROLS }, async ($, e) =>
    applyControlsMessage($, e.data as ControlsMessage))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Client = 'Client' in elements ? elements.Client : undefined
    // After `/clear` the state is empty until a message rehydrates it; draw the stored game meanwhile.
    const current = (await read($, game)) ?? await savedGame($)
    const choosingDifficulty = await read($, selectingDifficulty)
    const keyboardUsed = await read($, keyboardActive)
    const bodyRows = e.props.scroll?.bodyRows
    const bodyColumns = e.props.bodyColumns
    const geometry = geometryForPanel(bodyColumns, bodyRows)
    const terminal = e.surface === 'terminal'

    const finish = (
      content: RenderElement,
      contentHeight: number,
      contentWidth: number,
    ): RenderElement => {
      const centerVertically = typeof bodyRows === 'number' && bodyRows > contentHeight
      const centerHorizontally = typeof bodyColumns === 'number' && bodyColumns > contentWidth
      if (!terminal && !centerVertically && !centerHorizontally) return content

      const bodyContent = terminal ? (
        <Box flexDirection="column" flexShrink={0} width={contentWidth}>
          {content}
        </Box>
      ) : content

      return (
        <Box
          flexDirection="column"
          height={terminal ? bodyRows : centerVertically ? bodyRows : undefined}
          width={terminal ? bodyColumns : centerHorizontally ? bodyColumns : undefined}
          justifyContent={centerVertically ? 'center' : undefined}
          alignItems={centerHorizontally ? 'center' : undefined}
          backgroundColor={terminal ? PAPER : undefined}
        >
          {bodyContent}
        </Box>
      )
    }

    if (e.surface === 'desktop' && Client) {
      if (!current || choosingDifficulty) {
        const pickerProps: PickerProps = {
          difficulty: current?.difficulty ?? null,
          hasGame: current !== null,
          geometry,
        }
        const cardHeight = pickerHeight(current ? 4 : 3)
        const picker = (
          <Client key={PICKER} module="./picker-desktop.tsx" props={pickerProps} />
        )
        return finish(picker, cardHeight, geometry.width)
      }

      const board = boardProps(current, geometry)
      const controlProps = controlsProps(current, geometry, keyboardUsed)
      const dimensions = desktopBoardDimensions(geometry)
      const content = (
        <Box flexDirection="column" alignItems="center" rowGap={1}>
          <Client key={BOARD} module="./board-desktop.tsx" props={board} />
          <Client key={CONTROLS} module="./controls-desktop.tsx" props={controlProps} />
        </Box>
      )
      return finish(content, dimensions.height + 13, dimensions.width)
    }

    if (!current || choosingDifficulty) {
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
          <Text bold color={WOOD}>Choose a difficulty</Text>
          {DIFFICULTIES.map(option => (
            <Box key={`difficulty:${option.difficulty}`} flexDirection="row" columnGap={2}>
              <Button
                key={option.difficulty}
                hotkey={option.hotkey}
                label={option.label}
                onPress={() => chooseDifficulty($, option.difficulty)}
              />
              <Text color={PLAYER}>{`${option.givens} given numbers`}</Text>
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
      return finish(picker, contentHeight, geometry.width)
    }

    const board = boardProps(current, geometry)
    const controlProps = controlsProps(current, geometry, keyboardUsed)
    const enter = (digit: number) => () => change($, game => setDigit(game, digit))
    const controls = Client ? (
      <Client
        key={CONTROLS}
        module="./controls.tsx"
        props={controlProps}
        width={geometry.width}
        height={controlsHeight(geometry.scale)}
      />
    ) : (
      <Box flexDirection="column" rowGap={1}>
        <Text color={PLAYER}>
          {`${titleCase(current.difficulty)} \u00b7 ${controlProps.filled}/81 filled`}
        </Text>
        <Box flexDirection="row" columnGap={1}>
          {[7, 8, 9].map(digit => (
            <Button
              key={`digit:${digit}`}
              hotkey={String(digit)}
              label={String(digit)}
              onPress={enter(digit)}
            />
          ))}
        </Box>
        <Box flexDirection="row" columnGap={1}>
          {[4, 5, 6].map(digit => (
            <Button
              key={`digit:${digit}`}
              hotkey={String(digit)}
              label={String(digit)}
              onPress={enter(digit)}
            />
          ))}
        </Box>
        <Box flexDirection="row" columnGap={1}>
          {[1, 2, 3].map(digit => (
            <Button
              key={`digit:${digit}`}
              hotkey={String(digit)}
              label={String(digit)}
              onPress={enter(digit)}
            />
          ))}
        </Box>
        <Button key="clear" hotkey="0" label="0 Clear" onPress={enter(0)} />
        <Button
          key="new"
          plain
          hotkey="n"
          label="New game"
          onPress={() => showDifficultyPicker($)}
        />
      </Box>
    )
    const content = (
      <Box flexDirection="column" width={geometry.width}>
        {Client ? (
          <Client
            key={BOARD}
            module="./board.tsx"
            props={board}
            width={geometry.width}
            height={geometry.height}
          />
        ) : (
          <Text color={WOOD}>The board needs the terminal.</Text>
        )}
        {Client ? (
          <Text color={PAPER} backgroundColor={PAPER}>{' '.repeat(geometry.width)}</Text>
        ) : null}
        {controls}
      </Box>
    )

    const contentHeight = Client ? boardContentHeight(geometry) : geometry.height + 8
    return finish(content, contentHeight, geometry.width)
  })
}
