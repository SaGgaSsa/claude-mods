import { expect, mock, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import type { BoardProps } from '../types'
import {
  boardContentHeight,
  geometryAtScale,
  geometryForPanel,
  pickerHeight,
} from '../hooks/geometry'
import { CURSOR, PAPER, WOOD } from '../hooks/palette'
import { conflicts, countSolutions, newGame, setDigit, toGrid } from '../hooks/sudoku'

type RootProps = {
  width?: unknown
  height?: unknown
  justifyContent?: unknown
  alignItems?: unknown
}

const rootProps = (element: RenderElement): RootProps => {
  if (!('props' in element) || !element.props) throw new Error('Expected a drawn element with props')
  return element.props as RootProps
}

const boardState = (element: FoundElement | undefined): BoardProps => {
  if (!element || typeof element.props.props !== 'object' || element.props.props === null) {
    throw new Error('Expected the board Client props')
  }
  return element.props.props as BoardProps
}

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
  const mount = (bodyRows = 22) => $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: {
      ...PANE_PROPS,
      scroll: { ...PANE_PROPS.scroll, bodyRows },
    },
  })

  await startIn('/work/a')
  await openSudoku()

  let ui = await mount()
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  expect(rootProps(await ui.drawn()).height).toBe(22)
  expect(rootProps(await ui.drawn()).justifyContent).toBe('center')
  await ui.key({ key: 'm', in: 'picker' })
  expect(await ui.find({ type: 'Text', text: /Click the board/ })).toBeUndefined()
  expect(rootProps(await ui.drawn()).height).toBeUndefined()
  expect(rootProps(await ui.drawn()).justifyContent).toBeUndefined()

  let current = boardState(await ui.find({ key: 'board' }))
  expect(current.board).toHaveLength(81)
  const empty = current.board.indexOf('0')
  const geometry = geometryAtScale(current.geometry.scale)
  const center = (index: number) => {
    const position = geometry.cellPosition(Math.floor(index / 9), index % 9)
    return {
      x: position.x + Math.floor(geometry.cellWidth / 2),
      y: position.y + Math.floor(geometry.cellHeight / 2),
    }
  }

  await ui.pointer({ type: 'down', ...center(empty), button: 'left', in: 'board' })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(empty)

  await ui.key({ key: '5', in: 'board' })
  current = boardState(await ui.find({ key: 'board' }))
  expect(current.board[empty]).toBe('5')

  const isLastColumn = empty % 9 === 8
  await ui.key({ key: isLastColumn ? 'left' : 'right', in: 'board' })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(isLastColumn ? empty - 1 : empty + 1)
  await ui.unmount()

  ui = await mount(32)
  expect(rootProps(await ui.drawn()).height).toBe(32)
  expect(rootProps(await ui.drawn()).justifyContent).toBe('center')
  expect(rootProps(await ui.drawn()).alignItems).toBe('center')
  await ui.unmount()

  await startIn('/work/b')
  await openSudoku()
  ui = await mount()
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  await ui.unmount()

  await startIn('/work/a')
  await openSudoku()
  ui = await mount()
  expect(boardState(await ui.find({ key: 'board' })).board[empty]).toBe('5')
  await ui.unmount()
})

test('new game selection can cancel unchanged or start hard', async ($, on) => {
  const original = newGame('easy')
  const originalGame = setDigit(original, Number(original.solution[original.cursor]))
  mock.store(on, { 'game:/work/a': originalGame })
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

  let ui = await $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: PANE_PROPS,
  })
  await ui.press({ key: 'new' })
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cancel/, in: 'picker' })).toBeDefined()
  await ui.key({ key: 'c', in: 'picker' })
  expect(boardState(await ui.find({ key: 'board' })).board).toBe(originalGame.board)

  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  expect(boardState(await ui.find({ key: 'board' })).board).toBe(originalGame.board)
  expect(await ui.find({ type: 'Text', text: /Easy/ })).toBeDefined()

  await ui.press({ key: 'new' })
  await ui.key({ key: 'h', in: 'picker' })
  expect(await ui.find({ type: 'Text', text: /Hard/ })).toBeDefined()
  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  expect(await ui.find({ type: 'Text', text: /Hard/ })).toBeDefined()
  await ui.unmount()
})

test('the terminal picker supports hotkeys, arrows, Enter and row clicks', async ($, on) => {
  let cwd = '/work/a'
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  const mount = (bodyRows = 22) => $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: {
      ...PANE_PROPS,
      scroll: { ...PANE_PROPS.scroll, bodyRows },
    },
  })
  type Ui = Awaited<ReturnType<typeof mount>>

  let ui: Ui = await mount()
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /m  Medium/, in: 'picker' }))?.props.backgroundColor)
    .toBe('#e2a93b')
  expect(rootProps(await ui.drawn()).height).toBe(22)
  expect(rootProps(await ui.drawn()).justifyContent).toBe('center')
  await ui.unmount()

  ui = await mount(8)
  expect(rootProps(await ui.drawn()).height).toBeUndefined()

  await ui.key({ key: 'down', in: 'picker' })
  expect((await ui.find({ type: 'Text', text: /h  Hard/, in: 'picker' }))?.props.backgroundColor)
    .toBe('#e2a93b')
  await ui.key({ key: 'return', in: 'picker' })
  expect(await ui.find({ type: 'Text', text: /Hard/ })).toBeDefined()
  await ui.unmount()

  ui = await mount(32)
  const choices = [
    { hotkey: 'e', label: 'Easy', selectedKey: 'h', selectedLabel: 'Hard' },
    { hotkey: 'm', label: 'Medium', selectedKey: 'e', selectedLabel: 'Easy' },
    { hotkey: 'h', label: 'Hard', selectedKey: 'm', selectedLabel: 'Medium' },
  ]
  for (const choice of choices) {
    await ui.press({ key: 'new' })
    const selectedRow = new RegExp(`${choice.selectedKey}  ${choice.selectedLabel}`)
    expect((await ui.find({ type: 'Text', text: selectedRow, in: 'picker' }))?.props.backgroundColor)
      .toBe('#e2a93b')
    await ui.key({ key: choice.hotkey, in: 'picker' })
    expect(await ui.find({ type: 'Text', text: new RegExp(choice.label) })).toBeDefined()
  }

  await ui.press({ key: 'new' })
  await ui.key({ key: 'm', in: 'picker' })
  expect(await ui.find({ type: 'Text', text: /Medium/ })).toBeDefined()
  await ui.press({ key: 'new' })
  await ui.pointer({ type: 'down', x: 20, y: 8, button: 'left', in: 'picker' })
  expect(await ui.find({ type: 'Text', text: /Hard/ })).toBeDefined()
  await ui.unmount()
})

test('geometry scales the board, fills highlights and maps clicks to nearby cells', async ($, on) => {
  const cases = [
    { columns: 44, rows: 30, scale: 1 },
    { columns: 80, rows: 40, scale: 2 },
    { columns: 120, rows: 60, scale: 4 },
    { columns: 20, rows: 15, scale: 1 },
  ] as const

  for (const panel of cases) {
    const chosen = geometryForPanel(panel.columns, panel.rows)
    expect(chosen.scale).toBe(panel.scale)
    expect(chosen.cellWidth).toBe(2 * chosen.cellHeight + 1)
    const chosenFits = chosen.width <= panel.columns && boardContentHeight(chosen) <= panel.rows
    expect(chosenFits).toBe(panel.columns >= 41 && panel.rows >= 27)

    const larger = geometryAtScale(panel.scale + 1)
    expect(larger.width > panel.columns || boardContentHeight(larger) > panel.rows).toBe(true)
  }
  expect(pickerHeight(3)).toBe(9)
  expect(pickerHeight(4)).toBe(11)

  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/geometry' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/geometry', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  const mount = (columns: number, rows: number) => $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: {
      ...PANE_PROPS,
      bodyColumns: columns,
      scroll: { ...PANE_PROPS.scroll, bodyRows: rows },
    },
  })

  let ui = await mount(44, 30)
  await ui.key({ key: 'm', in: 'picker' })
  let state = boardState(await ui.find({ key: 'board' }))
  let geometry = geometryAtScale(state.geometry.scale)
  expect(state.geometry.scale).toBe(1)

  const client = await ui.find({ key: 'board' })
  expect(client?.props.width).toBe(geometry.width)
  expect(client?.props.height).toBe(geometry.height)
  const drawnRoot = rootProps(await ui.drawn({ in: 'board' }))
  expect(drawnRoot.width).toBe(geometry.width)
  expect(drawnRoot.height).toBe(geometry.height)

  const emptyIndex = [...state.board].findIndex((digit, index) =>
    digit === '0' && Math.floor(index / 9) < 8 && index % 9 < 8,
  )
  const emptyPosition = geometry.cellPosition(Math.floor(emptyIndex / 9), emptyIndex % 9)
  await ui.pointer({
    type: 'down',
    x: emptyPosition.x + Math.floor(geometry.cellWidth / 2),
    y: emptyPosition.y + Math.floor(geometry.cellHeight / 2),
    button: 'left',
    in: 'board',
  })
  state = boardState(await ui.find({ key: 'board' }))
  expect(state.cursor).toBe(emptyIndex)

  const spans = await ui.findAll({ type: 'Text', in: 'board' })
  expect(spans.some(span =>
    /[▀▄]/.test(span.text) && span.props.color === CURSOR &&
      (span.props.backgroundColor === PAPER || span.props.backgroundColor === WOOD),
  )).toBe(true)
  expect(spans.some(span =>
    /[▌▐]/.test(span.text) && span.props.color === CURSOR &&
      span.props.backgroundColor === PAPER,
  )).toBe(true)

  const selectAt = async (x: number, y: number, index: number) => {
    expect(geometry.cellAt(x, y)).toBe(index)
    await ui.pointer({ type: 'down', x, y, button: 'left', in: 'board' })
    expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(index)
  }
  await selectAt(0, 0, 0)
  await selectAt(geometry.width - 1, 0, 8)
  await selectAt(0, geometry.height - 1, 72)
  await selectAt(geometry.width - 1, geometry.height - 1, 80)

  const firstCell = geometry.cellPosition(0, 0)
  const fineLineX = firstCell.x + geometry.cellWidth
  const middleY = firstCell.y + Math.floor(geometry.cellHeight / 2)
  await selectAt(fineLineX - 1, middleY, 0)
  await selectAt(fineLineX, middleY, 1)
  await selectAt(fineLineX + 1, middleY, 1)

  const blockCell = geometry.cellPosition(0, 2)
  const blockLineX = blockCell.x + geometry.cellWidth
  await selectAt(blockLineX, middleY, 2)
  await selectAt(blockLineX + 1, middleY, 3)
  await selectAt(blockLineX + 2, middleY, 3)

  const rowLineY = firstCell.y + geometry.cellHeight
  const colCenter = geometry.cellPosition(0, 4).x + Math.floor(geometry.cellWidth / 2)
  await selectAt(colCenter, rowLineY - 1, 4)
  await selectAt(colCenter, rowLineY, 13)
  await selectAt(colCenter, rowLineY + 1, 13)

  const thickRowLineY = geometry.cellPosition(2, 0).y + geometry.cellHeight
  await selectAt(colCenter, thickRowLineY, 31)

  const beforeOutsideClick = boardState(await ui.find({ key: 'board' })).cursor
  expect(geometry.cellAt(geometry.width, middleY)).toBeNull()
  await ui.pointer({
    type: 'down',
    x: geometry.width,
    y: middleY,
    button: 'left',
    in: 'board',
  })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(beforeOutsideClick)
  await ui.unmount()

  ui = await mount(80, 40)
  state = boardState(await ui.find({ key: 'board' }))
  geometry = geometryAtScale(state.geometry.scale)
  expect(state.geometry.scale).toBe(2)
  const secondFineLine = geometry.cellPosition(0, 4).x + geometry.cellWidth
  await selectAt(secondFineLine, geometry.cellPosition(0, 4).y + 1, 5)
  const secondBlockLine = geometry.cellPosition(3, 2).x + geometry.cellWidth
  await selectAt(secondBlockLine, geometry.cellPosition(3, 2).y + 1, 29)
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
