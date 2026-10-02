import { expect, mock, test } from 'claude-code/testing'

import { conflicts, countSolutions, newGame, setDigit, toGrid } from '../hooks/sudoku'

const PANE_PROPS = {
  title: 'Sudoku',
  isFocused: true,
  bodyColumns: 48,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 22 },
  view: {},
} as const

test('each difficulty makes a puzzle with a unique solution', async () => {
  const limits = {
    easy: [40, 42],
    medium: [32, 36],
    hard: [26, 32],
  } as const

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const game = newGame(difficulty)
    const givens = [...game.puzzle].filter(digit => digit !== '0').length
    const [minimum, maximum] = limits[difficulty]

    expect(givens).toBeGreaterThanOrEqual(minimum)
    expect(givens).toBeLessThanOrEqual(maximum)
    expect(countSolutions(toGrid(game.puzzle))).toBe(1)
    expect(conflicts(game.solution).size).toBe(0)
    expect(game.board).toBe(game.puzzle)
    expect(game.difficulty).toBe(difficulty)
  }
})

test('entering the right digits solves the game; givens never change', async () => {
  let game = newGame('medium')
  const given = game.puzzle.search(/[1-9]/)

  game = setDigit({ ...game, cursor: given }, 0)
  expect(game.board).toBe(game.puzzle)

  for (let index = 0; index < 81; index++) {
    game = setDigit({ ...game, cursor: index }, Number(game.solution[index]))
  }
  expect(game.isSolved).toBe(true)
})

test('the pane selects a difficulty and saves each game per folder', async ($, on) => {
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
  const openSudoku = () => $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  const mount = () => $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: PANE_PROPS,
  })

  await startIn('/work/a')
  await openSudoku()

  type Ui = Awaited<ReturnType<typeof mount>>
  const cells = async (ui: Ui) =>
    (await ui.findAll({ type: 'Text', in: 'board' })).filter(found => /^ [ 1-9] $/.test(found.text))
  const cursorOf = async (ui: Ui) =>
    (await cells(ui)).findIndex(found =>
      found.props.backgroundColor === '#e2a93b' || found.props.backgroundColor === '#edb0a8',
    )

  let ui = await mount()
  expect(await ui.find({ key: 'easy' })).toBeDefined()
  expect(await ui.find({ key: 'medium' })).toBeDefined()
  expect(await ui.find({ key: 'hard' })).toBeDefined()
  await ui.press({ key: 'medium' })

  // Click coordinates include the one-cell frame around the inner grid.
  const at = (index: number) => {
    const r = Math.floor(index / 9)
    const c = index % 9
    return {
      x: 1 + Math.floor(c / 3) * 14 + (c % 3) * 4 + 1,
      y: 1 + Math.floor(r / 3) * 6 + (r % 3) * 2,
    }
  }

  const drawn = await cells(ui)
  expect(drawn).toHaveLength(81)
  const initialCursor = await cursorOf(ui)
  const empty = drawn.findIndex((found, index) => found.text === '   ' && index !== initialCursor)

  await ui.pointer({ type: 'down', ...at(empty), button: 'left', in: 'board' })
  expect(await cursorOf(ui)).toBe(empty)

  await ui.key({ key: '5', in: 'board' })
  expect((await cells(ui))[empty]?.text).toBe(' 5 ')

  const isLastColumn = empty % 9 === 8
  await ui.key({ key: isLastColumn ? 'left' : 'right', in: 'board' })
  expect(await cursorOf(ui)).toBe(isLastColumn ? empty - 1 : empty + 1)
  await ui.unmount()

  await startIn('/work/b')
  await openSudoku()
  ui = await mount()
  expect(await ui.find({ key: 'easy' })).toBeDefined()
  await ui.unmount()

  await startIn('/work/a')
  await openSudoku()
  ui = await mount()
  expect((await cells(ui))[empty]?.text).toBe(' 5 ')
  await ui.unmount()
})

test('new game selection can cancel unchanged or start hard', async ($, on) => {
  const original = newGame('easy')
  const originalBoard = setDigit(original, Number(original.solution[original.cursor]))
  mock.store(on, { 'game:/work/a': originalBoard })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/a' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  const ui = await $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: PANE_PROPS,
  })
  const cells = async () => (await ui.findAll({ type: 'Text', in: 'board' }))
    .filter(found => /^ [ 1-9] $/.test(found.text))
  const originalCells = (await cells()).map(found => found.text)

  await ui.press({ key: 'new' })
  expect(await ui.find({ key: 'hard' })).toBeDefined()
  expect(await ui.find({ key: 'cancel' })).toBeDefined()
  await ui.press({ key: 'cancel' })
  expect((await cells()).map(found => found.text)).toEqual(originalCells)

  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  expect((await cells()).map(found => found.text)).toEqual(originalCells)
  expect(await ui.find({ type: 'Text', text: /Easy/ })).toBeDefined()

  await ui.press({ key: 'new' })
  await ui.press({ key: 'hard' })
  expect(await ui.find({ type: 'Text', text: /Hard/ })).toBeDefined()
  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  expect(await ui.find({ type: 'Text', text: /Hard/ })).toBeDefined()
  await ui.unmount()
})

test('a saved game without difficulty loads as medium', async ($, on) => {
  const current = newGame('easy')
  mock.store(on, {
    'game:/work/legacy': {
      puzzle: current.puzzle,
      solution: current.solution,
      board: current.board,
      cursor: current.cursor,
      isSolved: current.isSolved,
    },
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/legacy' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/legacy', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  const ui = await $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: PANE_PROPS,
  })
  expect(await ui.find({ type: 'Text', text: /Medium/ })).toBeDefined()
  await ui.unmount()
})
