import { expect, mock, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

import type { BoardProps, ControlsProps, GeometryProps } from '../types'
import {
  boardContentHeight,
  controlsGeometry,
  controlsHeight,
  geometryAtScale,
  geometryForPanel,
  pickerHeight,
} from '../hooks/geometry'
import { CURSOR, FINE_LINE, PAPER, WOOD } from '../hooks/palette'
import { conflicts, countSolutions, newGame, setDigit, toGrid } from '../hooks/sudoku'
import { focusTarget, scrollPlan } from '../hooks/register'

type RootProps = {
  width?: unknown
  height?: unknown
  justifyContent?: unknown
  alignItems?: unknown
  borderStyle?: unknown
  backgroundColor?: unknown
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

const controlsState = (element: FoundElement | undefined): ControlsProps => {
  if (!element || typeof element.props.props !== 'object' || element.props.props === null) {
    throw new Error('Expected the controls Client props')
  }
  return element.props.props as ControlsProps
}

const newGameClick = (geometry: GeometryProps) => {
  const controls = controlsGeometry(geometry)
  return {
    type: 'down' as const,
    x: Math.floor(controls.width / 2),
    y: controls.newY + Math.floor(controls.tileHeight / 2),
    button: 'left' as const,
    in: 'controls' as const,
  }
}

const blockFill = /[\u2580\u2584\u258c\u2590\u2598\u259d\u2596\u2597\u259a\u259e\u259b\u259c\u2599\u259f]/

const childrenOf = (node: RenderNode): RenderNode[] => {
  if (typeof node === 'string' || !('children' in node)) return []
  return node.children ?? []
}

const propsOf = (node: RenderNode): Record<string, unknown> | null => {
  if (typeof node === 'string' || !('props' in node) || !node.props) return null
  return node.props as Record<string, unknown>
}

const textOf = (node: RenderNode): string =>
  typeof node === 'string' ? node : childrenOf(node).map(textOf).join('')

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
  expect(rootProps(await ui.drawn()).backgroundColor).toBe(PAPER)
  await ui.key({ key: 'm', in: 'picker' })
  expect(await ui.find({ type: 'Text', text: /Click the board/ })).toBeUndefined()
  expect(rootProps(await ui.drawn()).height).toBe(22)
  expect(rootProps(await ui.drawn()).width).toBe(48)
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

  ui = await mount(55)
  expect(rootProps(await ui.drawn()).height).toBe(55)
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
  const geometry = geometryAtScale(boardState(await ui.find({ key: 'board' })).geometry.scale)
  await ui.pointer(newGameClick(geometry))
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cancel/, in: 'picker' })).toBeDefined()
  await ui.key({ key: 'c', in: 'picker' })
  expect(boardState(await ui.find({ key: 'board' })).board).toBe(originalGame.board)

  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  expect(boardState(await ui.find({ key: 'board' })).board).toBe(originalGame.board)
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('easy')

  await ui.pointer(newGameClick(geometry))
  await ui.key({ key: 'h', in: 'picker' })
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('hard')
  await $.session.start({ cwd: '/work/a', surface: 'terminal', isInteractive: true })
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('hard')
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
  const pickerRoot = rootProps(await ui.drawn({ in: 'picker' }))
  expect(pickerRoot.borderStyle).toBeUndefined()
  const pickerTexts = await ui.findAll({ type: 'Text', in: 'picker' })
  expect(pickerTexts[0]?.props.backgroundColor).toBe(WOOD)
  expect(pickerTexts[0]?.text).toHaveLength(geometryForPanel(48, 22).width)
  const pickerBottom = pickerTexts[pickerTexts.length - 1]
  expect(pickerBottom?.props.backgroundColor).toBe(WOOD)
  expect(pickerBottom?.text).toHaveLength(geometryForPanel(48, 22).width)
  expect(pickerTexts.some(text => blockFill.test(text.text))).toBe(false)
  expect((await ui.find({ type: 'Text', text: /m  Medium/, in: 'picker' }))?.props.backgroundColor)
    .toBe('#e2a93b')
  expect(rootProps(await ui.drawn()).height).toBe(22)
  expect(rootProps(await ui.drawn()).justifyContent).toBe('center')
  await ui.unmount()

  ui = await mount(8)
  expect(rootProps(await ui.drawn()).height).toBe(8)

  await ui.key({ key: 'down', in: 'picker' })
  expect((await ui.find({ type: 'Text', text: /h  Hard/, in: 'picker' }))?.props.backgroundColor)
    .toBe('#e2a93b')
  await ui.key({ key: 'return', in: 'picker' })
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('hard')
  await ui.unmount()

  ui = await mount(32)
  const openPicker = async () => {
    const board = boardState(await ui.find({ key: 'board' }))
    await ui.pointer(newGameClick(board.geometry))
  }
  const choices = [
    {
      hotkey: 'e', label: 'Easy', selectedKey: 'h', selectedLabel: 'Hard', difficulty: 'easy',
    },
    {
      hotkey: 'm', label: 'Medium', selectedKey: 'e', selectedLabel: 'Easy', difficulty: 'medium',
    },
    {
      hotkey: 'h', label: 'Hard', selectedKey: 'm', selectedLabel: 'Medium', difficulty: 'hard',
    },
  ]
  for (const choice of choices) {
    await openPicker()
    const selectedRow = new RegExp(`${choice.selectedKey}  ${choice.selectedLabel}`)
    expect((await ui.find({ type: 'Text', text: selectedRow, in: 'picker' }))?.props.backgroundColor)
      .toBe('#e2a93b')
    await ui.key({ key: choice.hotkey, in: 'picker' })
    expect(controlsState(await ui.find({ key: 'controls' })).difficulty)
      .toBe(choice.difficulty)
  }

  await openPicker()
  await ui.key({ key: 'm', in: 'picker' })
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('medium')
  await openPicker()
  await ui.pointer({ type: 'down', x: 20, y: 8, button: 'left', in: 'picker' })
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('hard')
  await ui.unmount()
})

test('terminal controls write, clear, show status and open the picker', async ($, on) => {
  const fresh = newGame('medium')
  let pair: number[] = []
  for (let row = 0; row < 9 && pair.length === 0; row++) {
    const blanks = [...fresh.puzzle].flatMap((digit, index) =>
      Math.floor(index / 9) === row && digit === '0' ? [index] : [],
    )
    if (blanks.length >= 2) pair = blanks.slice(0, 2)
  }
  if (pair.length !== 2) throw new Error('Expected two empty cells in one row')

  const board = [...fresh.board]
  board[pair[0]!] = '5'
  const current = { ...fresh, board: board.join(''), cursor: pair[1]! }
  mock.store(on, { 'game:/work/controls': current })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/controls' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/controls', surface: 'terminal', isInteractive: true })
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
    props: {
      ...PANE_PROPS,
      bodyColumns: 48,
      scroll: { ...PANE_PROPS.scroll, bodyRows: 55 },
    },
  })
  const root = rootProps(await ui.drawn())
  expect(root.backgroundColor).toBe(PAPER)
  expect(root.width).toBe(48)
  expect(root.height).toBe(55)
  expect(root.justifyContent).toBe('center')
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  const controlTexts = await ui.findAll({ type: 'Text', in: 'controls' })
  expect(controlTexts.some(text => /[\u2190-\u2193]/.test(text.text))).toBe(false)

  const boardProps = boardState(await ui.find({ key: 'board' }))
  const geometry = geometryAtScale(boardProps.geometry.scale)
  const controls = controlsGeometry(boardProps.geometry)
  const cell = geometry.cellPosition(Math.floor(pair[1]! / 9), pair[1]! % 9)
  await ui.pointer({
    type: 'down',
    x: cell.x + Math.floor(geometry.cellWidth / 2),
    y: cell.y + Math.floor(geometry.cellHeight / 2),
    button: 'left',
    in: 'board',
  })

  const fiveX = controls.keypadX + controls.tileWidth + 1 + Math.floor(controls.tileWidth / 2)
  const fiveY = controls.keypadY + controls.tileHeight + 1 + Math.floor(controls.tileHeight / 2)
  await ui.pointer({ type: 'down', x: fiveX, y: fiveY, button: 'left', in: 'controls' })
  let changed = boardState(await ui.find({ key: 'board' }))
  expect(changed.board[pair[1]!]).toBe('5')

  let controlsProps = controlsState(await ui.find({ key: 'controls' }))
  expect(controlsProps.difficulty).toBe('medium')
  expect(controlsProps.filled).toBe([...changed.board].filter(digit => digit !== '0').length)
  expect(controlsProps.clashes).toBe(conflicts(changed.board).size)
  expect((await ui.find({ type: 'Text', text: /Medium/, in: 'controls' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /\d+\/81 filled/, in: 'controls' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /in conflict/, in: 'controls' }))).toBeDefined()
  const highlights = await ui.findAll({ type: 'Text', in: 'controls' })
  expect(highlights.some(text => text.props.backgroundColor === CURSOR && text.text.includes('5')))
    .toBe(true)

  const clearY = controls.keypadY + 3 * (controls.tileHeight + 1) +
    Math.floor(controls.tileHeight / 2)
  await ui.pointer({
    type: 'down',
    x: controls.keypadX,
    y: clearY,
    button: 'left',
    in: 'controls',
  })
  changed = boardState(await ui.find({ key: 'board' }))
  expect(changed.board[pair[1]!]).toBe('0')
  controlsProps = controlsState(await ui.find({ key: 'controls' }))
  expect(controlsProps.clashes).toBe(conflicts(changed.board).size)

  await ui.pointer(newGameClick(boardProps.geometry))
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  await ui.unmount()
})

test('focus routing preserves engine stops and keyboard scroll distinguishes the wheel', async () => {
  expect(focusTarget('another-element', 'another-plugin', false)).toBe('board')
  expect(focusTarget('another-element', 'another-plugin', true)).toBe('picker')
  expect(focusTarget(undefined, undefined, false)).toBeUndefined()
  expect(focusTarget('new', 'sudoku', false)).toBe('new')

  expect(scrollPlan('person', false, 1, false)).toEqual({ consume: true, rowDelta: 1 })
  expect(scrollPlan('person', false, -1, false)).toEqual({ consume: true, rowDelta: -1 })
  expect(scrollPlan('person', false, 1, true)).toEqual({ consume: true, rowDelta: 0 })
  expect(scrollPlan('person', true, 1, false)).toEqual({ consume: false, rowDelta: 0 })
  expect(scrollPlan('plugin', false, 1, false)).toEqual({ consume: false, rowDelta: 0 })
})

test('geometry scales the board, fills highlights and maps clicks to nearby cells', async ($, on) => {
  const cases = [
    { columns: 44, rows: 30, scale: 1 },
    { columns: 80, rows: 50, scale: 2 },
    { columns: 120, rows: 75, scale: 4 },
    { columns: 20, rows: 15, scale: 1 },
  ] as const

  for (const panel of cases) {
    const chosen = geometryForPanel(panel.columns, panel.rows)
    expect(chosen.scale).toBe(panel.scale)
    expect(chosen.cellWidth).toBe(2 * chosen.cellHeight + 1)
    const chosenFits = chosen.width <= panel.columns && boardContentHeight(chosen) <= panel.rows
    expect(chosenFits).toBe(chosen.scale > 1 || (panel.columns >= 41 && panel.rows >= 33))

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
  const controlsClient = await ui.find({ key: 'controls' })
  const controlGeometry = controlsGeometry(state.geometry)
  expect(controlsClient?.props.width).toBe(controlGeometry.width)
  expect(controlsClient?.props.height).toBe(controlsHeight(state.geometry.scale))
  const controlsRoot = rootProps(await ui.drawn({ in: 'controls' }))
  expect(controlsRoot.width).toBe(controlGeometry.width)
  expect(controlsRoot.height).toBe(controlGeometry.height)
  const drawnRoot = rootProps(await ui.drawn({ in: 'board' }))
  expect(drawnRoot.width).toBe(geometry.width)
  expect(drawnRoot.height).toBe(geometry.height)
  expect(drawnRoot.borderStyle).toBeUndefined()
  const scaleOneTexts = await ui.findAll({ type: 'Text', in: 'board' })
  expect(scaleOneTexts.every(text => typeof text.props.backgroundColor === 'string')).toBe(true)
  expect(scaleOneTexts.some(text => blockFill.test(text.text))).toBe(false)
  expect(scaleOneTexts[0]?.props.backgroundColor).toBe(WOOD)
  expect(scaleOneTexts[0]?.text).toHaveLength(geometry.width)
  const scaleOneBottom = scaleOneTexts[scaleOneTexts.length - 1]
  expect(scaleOneBottom?.props.backgroundColor).toBe(WOOD)
  expect(scaleOneBottom?.text).toHaveLength(geometry.width)

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

  ui = await mount(80, 50)
  state = boardState(await ui.find({ key: 'board' }))
  geometry = geometryAtScale(state.geometry.scale)
  expect(state.geometry.scale).toBe(2)
  const panelRoot = rootProps(await ui.drawn())
  expect(panelRoot.backgroundColor).toBe(PAPER)
  expect(panelRoot.width).toBe(80)
  expect(panelRoot.height).toBe(50)
  expect(panelRoot.justifyContent).toBe('center')
  expect(panelRoot.alignItems).toBe('center')
  const largeClient = await ui.find({ key: 'board' })
  expect(largeClient?.props.width).toBe(geometry.width)
  expect(largeClient?.props.height).toBe(geometry.height)
  const largeRoot = rootProps(await ui.drawn({ in: 'board' }))
  expect(largeRoot.width).toBe(geometry.width)
  expect(largeRoot.height).toBe(geometry.height)
  expect(largeRoot.borderStyle).toBeUndefined()
  const largeControls = controlsGeometry(state.geometry)
  const largeControlsClient = await ui.find({ key: 'controls' })
  expect(largeControlsClient?.props.width).toBe(largeControls.width)
  expect(largeControlsClient?.props.height).toBe(largeControls.height)

  const selectedPosition = geometry.cellPosition(1, 1)
  await selectAt(
    selectedPosition.x + Math.floor(geometry.cellWidth / 2),
    selectedPosition.y + Math.floor(geometry.cellHeight / 2),
    10,
  )
  const largeTexts = await ui.findAll({ type: 'Text', in: 'board' })
  expect(largeTexts.every(text => typeof text.props.backgroundColor === 'string')).toBe(true)
  expect(largeTexts.some(text => blockFill.test(text.text))).toBe(false)
  expect(largeTexts[0]?.props.backgroundColor).toBe(WOOD)
  expect(largeTexts[0]?.text).toHaveLength(geometry.width)
  const largeBottom = largeTexts[largeTexts.length - 1]
  expect(largeBottom?.props.backgroundColor).toBe(WOOD)
  expect(largeBottom?.text).toHaveLength(geometry.width)

  const boardTree = await ui.drawn({ in: 'board' })
  const gridRows = childrenOf(boardTree).slice(1, -1)
  const lineSpans = (row: number) => {
    const framedRow = gridRows[row]
    if (!framedRow) return []
    const innerRow = childrenOf(framedRow)[1]
    return innerRow ? childrenOf(innerRow) : []
  }
  const cursorWidthAt = (row: number) => lineSpans(row).reduce((width, span) => {
    return propsOf(span)?.backgroundColor === CURSOR ? width + textOf(span).length : width
  }, 0)
  const selectedTop = selectedPosition.y - 1
  for (let row = selectedTop; row < selectedTop + geometry.cellHeight; row++) {
    expect(cursorWidthAt(row)).toBe(geometry.cellWidth)
  }

  const hasFineLineAt = (row: number, character: string) => lineSpans(row).some(span => {
    const props = propsOf(span)
    return textOf(span).includes(character) && props?.color === FINE_LINE &&
      props.backgroundColor === PAPER
  })
  expect(hasFineLineAt(selectedTop - 1, '─')).toBe(true)
  expect(hasFineLineAt(selectedTop + geometry.cellHeight, '─')).toBe(true)
  expect(hasFineLineAt(selectedTop, '│')).toBe(true)
  expect(hasFineLineAt(selectedTop + geometry.cellHeight - 1, '│')).toBe(true)

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
  expect(await ui.find({ type: 'Text', text: /Medium/, in: 'controls' })).toBeDefined()
  await ui.unmount()
})
