import { expect, mock, test } from 'claude-code/testing'

import { conflicts, countSolutions, newGame, setDigit, toGrid } from '../hooks/sudoku'

const PANE_PROPS = {
  title: 'Sudoku',
  isFocused: true,
  bodyColumns: 48,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 18 },
  view: {},
} as const

test('a new game is a medium puzzle with one solution', async () => {
  const game = newGame()
  const givens = [...game.puzzle].filter(digit => digit !== '0').length

  expect(givens).toBeGreaterThanOrEqual(32)
  expect(givens).toBeLessThanOrEqual(36)
  expect(countSolutions(toGrid(game.puzzle))).toBe(1)
  expect(conflicts(game.solution).size).toBe(0)
  expect(game.board).toBe(game.puzzle)
})

test('entering the right digits solves the game; givens never change', async () => {
  let game = newGame()
  const given = game.puzzle.search(/[1-9]/)

  game = setDigit({ ...game, cursor: given }, 0)
  expect(game.board).toBe(game.puzzle)

  for (let index = 0; index < 81; index++) {
    game = setDigit({ ...game, cursor: index }, Number(game.solution[index]))
  }
  expect(game.isSolved).toBe(true)
})

test('the pane plays and saves the game per folder', async ($, on) => {
  let cwd = '/work/a'
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const startIn = async (folder: string) => {
    cwd = folder
    await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
  }
  const mount = () =>
    $.ui.mount({ plugin: 'sudoku', surface: 'terminal', component: 'Pane', requestId: 'sudoku', props: PANE_PROPS })

  await startIn('/work/a')
  await $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  // Where cell `index` sits in the board Client's region.
  const at = (index: number) => {
    const r = Math.floor(index / 9)
    const c = index % 9
    return { x: Math.floor(c / 3) * 14 + (c % 3) * 4 + 1, y: Math.floor(r / 3) * 6 + (r % 3) * 2 }
  }

  // The 81 cells the board drew, row by row; the cursor is the highlighted one.
  type Ui = Awaited<ReturnType<typeof mount>>
  const cells = async (ui: Ui) =>
    (await ui.findAll({ type: 'Text', in: 'board' })).filter(found => /^ [·1-9] $/.test(found.text))
  const cursorOf = async (ui: Ui) => (await cells(ui)).findIndex(found => found.props.backgroundColor)

  let ui = await mount()
  const drawn = await cells(ui)
  expect(drawn).toHaveLength(81)
  const empty = drawn.findIndex((found, index) => found.text === ' · ' && index !== 0)

  await ui.pointer({ type: 'down', ...at(empty), button: 'left' })
  expect(await cursorOf(ui)).toBe(empty)

  await ui.key({ key: '5', in: 'board' })
  expect((await cells(ui))[empty]?.text).toBe(' 5 ')

  // Arrows move the cursor inside the board instead of reaching the prompt.
  const isLastColumn = empty % 9 === 8
  await ui.key({ key: isLastColumn ? 'left' : 'right', in: 'board' })
  expect(await cursorOf(ui)).toBe(isLastColumn ? empty - 1 : empty + 1)
  await ui.unmount()

  // Another folder has no game of its own yet.
  await startIn('/work/b')
  ui = await mount()
  expect(await ui.find({ key: 'new' })).toBeDefined()
  await ui.unmount()

  // Back in the first folder, the game is where it was left.
  await startIn('/work/a')
  ui = await mount()
  expect((await cells(ui))[empty]?.text).toBe(' 5 ')
  await ui.unmount()
})
