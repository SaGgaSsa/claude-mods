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
import { CLASH_BACKGROUND, CURSOR, MATCH, PAPER, PAPER_ALT, WOOD } from '../hooks/palette'
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

type DrawnCell = {
  character: string
  color: unknown
  backgroundColor: unknown
}

const canvasOf = (tree: RenderElement): DrawnCell[][] => childrenOf(tree).map(row => {
  const rowStyle = propsOf(row)
  return childrenOf(row).flatMap(span => {
    const style = propsOf(span) ?? rowStyle
    return [...textOf(span)].map(character => ({
      character,
      color: style?.color,
      backgroundColor: style?.backgroundColor,
    }))
  })
})

const expectBoardGrid = (
  grid: DrawnCell[][],
  state: BoardProps,
  geometry: ReturnType<typeof geometryAtScale>,
) => {
  expect(grid).toHaveLength(geometry.height)
  expect(grid.every(row => row.length === geometry.width)).toBe(true)
  expect(grid[0]!.every(cell => cell.backgroundColor === WOOD)).toBe(true)
  expect(grid[geometry.height - 1]!.every(cell => cell.backgroundColor === WOOD)).toBe(true)
  expect(grid.every(row => row[0]!.backgroundColor === WOOD)).toBe(true)
  expect(grid.every(row => row[geometry.width - 1]!.backgroundColor === WOOD)).toBe(true)
  expect(grid.some(row => row.some(cell => blockFill.test(cell.character)))).toBe(false)
  const lineCharacter = /[\u2500\u2502\u253c\u2501\u2503\u254b\u253f\u2542]/
  expect(grid.slice(1, -1).every(row => row.slice(1, -1).every(cell =>
    !lineCharacter.test(cell.character),
  ))).toBe(true)

  for (let index = 0; index < 81; index++) {
    const digit = state.board[index]!
    const row = Math.floor(index / 9)
    const col = index % 9
    const position = geometry.cellPosition(row, col)
    const centerX = position.x + Math.floor(geometry.cellWidth / 2)
    const centerY = position.y + Math.floor(geometry.cellHeight / 2)
    if (digit !== '0') expect(grid[centerY]![centerX]!.character).toBe(digit)

    const blockBackground = (Math.floor(row / 3) + Math.floor(col / 3)) % 2 === 0
      ? PAPER
      : PAPER_ALT
    const expectedBackground = index === state.cursor
      ? state.clashes.includes(index) ? CLASH_BACKGROUND : CURSOR
      : digit !== '0' && digit === state.board[state.cursor] ? MATCH : blockBackground
    for (let y = position.y; y < position.y + geometry.cellHeight; y++) {
      for (let x = position.x; x < position.x + geometry.cellWidth; x++) {
        expect(grid[y]![x]!.backgroundColor).toBe(expectedBackground)
      }
    }
  }
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

test('/sudoku reloads the folder game when the session state was cleared', async ($, on) => {
  const original = newGame('hard')
  const savedGame = setDigit(original, Number(original.solution[original.cursor]))
  mock.store(on, { 'game:/work/cleared': savedGame })
  on('session.cwd', () => ({ value: '/work/cleared' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  // No session.start: after /clear the atoms are empty but the store still holds the game.
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
  expect(await ui.find({ key: 'picker' })).toBeUndefined()
  expect(boardState(await ui.find({ key: 'board' })).board).toBe(savedGame.board)
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
  const pickerGeometry = geometryForPanel(48, 22)
  const pickerClient = await ui.find({ key: 'picker' })
  expect(pickerClient?.props.width).toBe(pickerGeometry.width)
  expect(pickerClient?.props.height).toBe(pickerHeight(3))
  expect(pickerRoot.width).toBe(pickerGeometry.width)
  expect(pickerRoot.height).toBe(pickerHeight(3))
  const pickerGrid = canvasOf(await ui.drawn({ in: 'picker' }))
  expect(pickerGrid).toHaveLength(pickerHeight(3))
  expect(pickerGrid.every(row => row.length === pickerGeometry.width)).toBe(true)
  expect(pickerGrid[0]!.every(cell => cell.backgroundColor === WOOD)).toBe(true)
  expect(pickerGrid[pickerGrid.length - 1]!.every(cell => cell.backgroundColor === WOOD)).toBe(true)
  expect(pickerGrid[5]!.slice(1, -1).every(cell => cell.backgroundColor === CURSOR)).toBe(true)
  expect(pickerGrid.some(row => row.some(cell => blockFill.test(cell.character)))).toBe(false)
  expect(rootProps(await ui.drawn()).height).toBe(22)
  expect(rootProps(await ui.drawn()).justifyContent).toBe('center')
  await ui.unmount()

  ui = await mount(8)
  expect(rootProps(await ui.drawn()).height).toBe(8)

  await ui.key({ key: 'down', in: 'picker' })
  const hardGrid = canvasOf(await ui.drawn({ in: 'picker' }))
  expect(hardGrid[7]!.slice(1, -1).every(cell => cell.backgroundColor === CURSOR)).toBe(true)
  await ui.key({ key: 'return', in: 'picker' })
  expect(controlsState(await ui.find({ key: 'controls' })).difficulty).toBe('hard')
  await ui.unmount()

  ui = await mount(32)
  const openPicker = async () => {
    const board = boardState(await ui.find({ key: 'board' }))
    await ui.pointer(newGameClick(board.geometry))
  }
  const choices = [
    { hotkey: 'e', selectedKey: 'h', difficulty: 'easy' },
    { hotkey: 'm', selectedKey: 'e', difficulty: 'medium' },
    { hotkey: 'h', selectedKey: 'm', difficulty: 'hard' },
  ]
  for (const choice of choices) {
    await openPicker()
    const selectedIndex = choice.selectedKey === 'e' ? 0 : choice.selectedKey === 'm' ? 1 : 2
    const choiceGrid = canvasOf(await ui.drawn({ in: 'picker' }))
    expect(choiceGrid[3 + selectedIndex * 2]!.slice(1, -1)
      .every(cell => cell.backgroundColor === CURSOR)).toBe(true)
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
  expect(controlsState(await ui.find({ key: 'controls' })).keyboardActive).toBe(false)
  expect(await ui.find({ type: 'Text', text: /click (the )?board/, in: 'controls' })).toBeDefined()

  const boardProps = boardState(await ui.find({ key: 'board' }))
  const geometry = geometryAtScale(boardProps.geometry.scale)
  const controls = controlsGeometry(boardProps.geometry)
  const controlsClient = await ui.find({ key: 'controls' })
  expect(controlsClient?.props.width).toBe(controls.width)
  expect(controlsClient?.props.height).toBe(controls.height)
  const controlsRoot = rootProps(await ui.drawn({ in: 'controls' }))
  expect(controlsRoot.width).toBe(controls.width)
  expect(controlsRoot.height).toBe(controls.height)
  const beforeInputGrid = canvasOf(await ui.drawn({ in: 'controls' }))
  expect(beforeInputGrid).toHaveLength(controls.height)
  expect(beforeInputGrid.every(row => row.length === controls.width)).toBe(true)
  expect(beforeInputGrid[0]!.every(pixel => pixel.backgroundColor === WOOD)).toBe(true)
  expect(beforeInputGrid[controls.height - 1]!.every(pixel => pixel.backgroundColor === WOOD)).toBe(true)
  expect(beforeInputGrid.some(row => row.some(pixel => blockFill.test(pixel.character)))).toBe(false)
  const lineCharacter = /[\u2500\u2502\u253c\u2501\u2503\u254b\u253f\u2542]/
  expect(beforeInputGrid.some(row => row.some(pixel => lineCharacter.test(pixel.character)))).toBe(false)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const position = controls.tilePosition(row, col)
      const expectedBackground = (row + col) % 2 === 0 ? PAPER : PAPER_ALT
      for (let y = position.y; y < position.y + controls.tileHeight; y++) {
        for (let x = position.x; x < position.x + controls.tileWidth; x++) {
          expect(beforeInputGrid[y]![x]!.backgroundColor).toBe(expectedBackground)
        }
      }
    }
  }
  const cell = geometry.cellPosition(Math.floor(pair[1]! / 9), pair[1]! % 9)
  await ui.pointer({
    type: 'down',
    x: cell.x + Math.floor(geometry.cellWidth / 2),
    y: cell.y + Math.floor(geometry.cellHeight / 2),
    button: 'left',
    in: 'board',
  })
  if (!controlsState(await ui.find({ key: 'controls' })).keyboardActive) {
    throw new Error('Board click did not activate keyboard status')
  }
  expect(await ui.find({ type: 'Text', text: /click (the )?board/, in: 'controls' }))
    .toBeUndefined()

  const fiveX = controls.keypadX + controls.tileWidth + Math.floor(controls.tileWidth / 2)
  const fiveY = controls.keypadY + controls.tileHeight + Math.floor(controls.tileHeight / 2)
  await ui.pointer({ type: 'down', x: fiveX, y: fiveY, button: 'left', in: 'controls' })
  let changed = boardState(await ui.find({ key: 'board' }))
  expect(changed.board[pair[1]!]).toBe('5')

  let controlsProps = controlsState(await ui.find({ key: 'controls' }))
  expect(controlsProps.difficulty).toBe('medium')
  expect(controlsProps.filled).toBe([...changed.board].filter(digit => digit !== '0').length)
  expect(controlsProps.clashes).toBe(conflicts(changed.board).size)
  expect((await ui.find({ type: 'Text', text: /Medium/, in: 'controls' }))).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /\d+\/81 filled/, in: 'controls' }))).toBeDefined()
  const highlights = await ui.findAll({ type: 'Text', in: 'controls' })
  expect(highlights.map(text => text.text).join(' ')).toContain('in conflict')
  if (!highlights.some(text => text.props.backgroundColor === CURSOR && text.text.includes('5'))) {
    throw new Error(`Selected 5 is not highlighted: ${highlights.map(text => text.text).join('|')}`)
  }
  const selectedControlsGrid = canvasOf(await ui.drawn({ in: 'controls' }))
  const fivePosition = controls.tilePosition(1, 1)
  for (let y = fivePosition.y; y < fivePosition.y + controls.tileHeight; y++) {
    for (let x = fivePosition.x; x < fivePosition.x + controls.tileWidth; x++) {
      expect(selectedControlsGrid[y]![x]!.backgroundColor).toBe(CURSOR)
    }
  }

  const clearY = controls.clearY + Math.floor(controls.tileHeight / 2)
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

  const leftMargin = controls.keypadX - 1
  const rightMargin = controls.width - 1 - (controls.keypadX + controls.keypadWidth)
  expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(1)
  expect(controls.keypadWidth).toBe(controls.tileWidth * 3)

  const digitPositions = [
    [7, 0, 0], [8, 0, 1], [9, 0, 2],
    [4, 1, 0], [5, 1, 1], [6, 1, 2],
    [1, 2, 0], [2, 2, 1], [3, 2, 2],
  ] as const
  const keypadGrid = canvasOf(await ui.drawn({ in: 'controls' }))
  expect(keypadGrid).toHaveLength(controls.height)
  expect(keypadGrid.every(row => row.length === controls.width)).toBe(true)
  expect(keypadGrid.some(row => row.some(pixel => blockFill.test(pixel.character)))).toBe(false)
  for (const [digit, row, col] of digitPositions) {
    const position = controls.tilePosition(row, col)
    const tileX = position.x
    const tileY = position.y
    const centerX = tileX + Math.floor(controls.tileWidth / 2)
    const centerY = tileY + Math.floor(controls.tileHeight / 2)
    expect(keypadGrid[centerY]![centerX]!.character).toBe(String(digit))
    for (let y = tileY; y < tileY + controls.tileHeight; y++) {
      for (let x = tileX; x < tileX + controls.tileWidth; x++) {
        const tileBackground = (row + col) % 2 === 0 ? PAPER : PAPER_ALT
        expect(keypadGrid[y]![x]!.backgroundColor).toBe(tileBackground)
      }
    }
    for (const x of [tileX, tileX + Math.floor(controls.tileWidth / 2), tileX + controls.tileWidth - 1]) {
      await ui.pointer({
        type: 'down',
        x,
        y: centerY,
        button: 'left',
        in: 'controls',
      })
      expect(boardState(await ui.find({ key: 'board' })).board[pair[1]!]).toBe(String(digit))
      await ui.pointer({
        type: 'down',
        x: controls.keypadX,
        y: clearY,
        button: 'left',
        in: 'controls',
      })
      expect(boardState(await ui.find({ key: 'board' })).board[pair[1]!]).toBe('0')
    }
  }

  await ui.key({ key: '5', in: 'controls' })
  expect(boardState(await ui.find({ key: 'board' })).board[pair[1]!]).toBe('5')
  await ui.key({ key: '0', in: 'controls' })
  expect(boardState(await ui.find({ key: 'board' })).board[pair[1]!]).toBe('0')
  for (const x of [controls.keypadX + Math.floor(controls.keypadWidth / 2), controls.keypadX]) {
    await ui.key({ key: '5', in: 'controls' })
    await ui.pointer({
      type: 'down',
      x,
      y: clearY,
      button: 'left',
      in: 'controls',
    })
    expect(boardState(await ui.find({ key: 'board' })).board[pair[1]!]).toBe('0')
  }

  await ui.key({ key: 'left', in: 'controls' })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(pair[1]! - 1)
  await ui.key({ key: 'right', in: 'controls' })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(pair[1])
  await ui.key({ key: 'n', in: 'controls' })
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  await ui.key({ key: 'down', in: 'picker' })
  const activePickerGrid = canvasOf(await ui.drawn({ in: 'picker' }))
  expect(activePickerGrid[7]!.slice(1, -1).every(cell => cell.backgroundColor === CURSOR)).toBe(true)
  await ui.key({ key: '5', in: 'picker' })
  await ui.key({ key: 'c', in: 'picker' })
  changed = boardState(await ui.find({ key: 'board' }))
  expect(changed.board[pair[1]!]).toBe('5')

  await ui.pointer(newGameClick(boardProps.geometry))
  expect(await ui.find({ key: 'picker' })).toBeDefined()
  await ui.key({ key: 'c', in: 'picker' })
  await ui.pointer({
    type: 'down',
    x: controls.width - 2,
    y: controls.newY + Math.floor(controls.tileHeight / 2),
    button: 'left',
    in: 'controls',
  })
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
    { columns: 80, rows: 50, scale: 3 },
    { columns: 120, rows: 75, scale: 3 },
    { columns: 20, rows: 15, scale: 1 },
  ] as const

  for (const panel of cases) {
    const chosen = geometryForPanel(panel.columns, panel.rows)
    expect(chosen.scale).toBe(panel.scale)
    expect(chosen.cellWidth).toBe(2 * chosen.cellHeight + 1)
    expect(chosen.cellHeight % 2).toBe(1)
    expect(chosen.width).toBe(9 * chosen.cellWidth + 2)
    expect(chosen.height).toBe(9 * chosen.cellHeight + 2)
    const chosenFits = chosen.width <= panel.columns && boardContentHeight(chosen) <= panel.rows
    if (chosen.scale > 1) expect(chosenFits).toBe(true)

    const larger = geometryAtScale(panel.scale + 2)
    expect(larger.width > panel.columns || boardContentHeight(larger) > panel.rows).toBe(true)
  }
  expect(geometryAtScale(2).scale).toBe(1)
  expect(geometryAtScale(4).scale).toBe(3)
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
  const scaleOneGrid = canvasOf(await ui.drawn({ in: 'board' }))
  expectBoardGrid(scaleOneGrid, state, geometry)

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
  const blockEdgeX = blockCell.x + geometry.cellWidth - 1
  await selectAt(blockEdgeX, middleY, 2)
  await selectAt(blockEdgeX + 1, middleY, 3)

  const rowEdgeY = firstCell.y + geometry.cellHeight - 1
  const colCenter = geometry.cellPosition(0, 4).x + Math.floor(geometry.cellWidth / 2)
  await selectAt(colCenter, rowEdgeY, 4)
  await selectAt(colCenter, rowEdgeY + 1, 13)

  const blockEdgeY = geometry.cellPosition(2, 0).y + geometry.cellHeight - 1
  await selectAt(colCenter, blockEdgeY, 22)
  await selectAt(colCenter, blockEdgeY + 1, 31)

  const beforeOutsideClick = boardState(await ui.find({ key: 'board' })).cursor
  expect(geometry.cellAt(geometry.width, middleY)).toBeNull()
  expect(geometry.cellAt(middleY, geometry.height)).toBeNull()
  await ui.pointer({
    type: 'down',
    x: geometry.width,
    y: middleY,
    button: 'left',
    in: 'board',
  })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(beforeOutsideClick)
  await ui.pointer({
    type: 'down',
    x: middleY,
    y: geometry.height,
    button: 'left',
    in: 'board',
  })
  expect(boardState(await ui.find({ key: 'board' })).cursor).toBe(beforeOutsideClick)
  await ui.unmount()

  ui = await mount(80, 50)
  state = boardState(await ui.find({ key: 'board' }))
  geometry = geometryAtScale(state.geometry.scale)
  expect(state.geometry.scale).toBe(3)
  const panelRoot = rootProps(await ui.drawn())
  expect(panelRoot.backgroundColor).toBe(PAPER)
  expect(panelRoot.width).toBe(80)
  expect(panelRoot.height).toBe(50)
  expect(panelRoot.justifyContent).toBeUndefined()
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
  const largeGrid = canvasOf(await ui.drawn({ in: 'board' }))
  expectBoardGrid(largeGrid, boardState(await ui.find({ key: 'board' })), geometry)

  const secondFineLine = geometry.cellPosition(0, 4).x + geometry.cellWidth
  await selectAt(secondFineLine - 1, geometry.cellPosition(0, 4).y + 1, 4)
  await selectAt(secondFineLine, geometry.cellPosition(0, 4).y + 1, 5)
  const secondBlockEdge = geometry.cellPosition(3, 2).x + geometry.cellWidth - 1
  await selectAt(secondBlockEdge, geometry.cellPosition(3, 2).y + 1, 29)
  await selectAt(secondBlockEdge + 1, geometry.cellPosition(3, 2).y + 1, 30)
  const horizontalEdge = geometry.cellPosition(4, 5).y + geometry.cellHeight - 1
  const horizontalCol = geometry.cellPosition(0, 5).x + Math.floor(geometry.cellWidth / 2)
  await selectAt(horizontalCol, horizontalEdge, 41)
  await selectAt(horizontalCol, horizontalEdge + 1, 50)
  await ui.unmount()

  ui = await mount(120, 75)
  state = boardState(await ui.find({ key: 'board' }))
  geometry = geometryAtScale(state.geometry.scale)
  expect(state.geometry.scale).toBe(3)
  const scaleThreeClient = await ui.find({ key: 'board' })
  expect(scaleThreeClient?.props.width).toBe(geometry.width)
  expect(scaleThreeClient?.props.height).toBe(geometry.height)
  const scaleThreeControls = controlsGeometry(state.geometry)
  const scaleThreeControlsClient = await ui.find({ key: 'controls' })
  expect(scaleThreeControlsClient?.props.width).toBe(scaleThreeControls.width)
  expect(scaleThreeControlsClient?.props.height).toBe(scaleThreeControls.height)
  const scaleThreeControlsRoot = rootProps(await ui.drawn({ in: 'controls' }))
  expect(scaleThreeControlsRoot.width).toBe(scaleThreeControls.width)
  expect(scaleThreeControlsRoot.height).toBe(scaleThreeControls.height)
  expectBoardGrid(canvasOf(await ui.drawn({ in: 'board' })), state, geometry)
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
