import { expect, mock, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'

import type { BoardProps } from '../types'
import { desktopCellAt, desktopCellPosition } from '../hooks/desktop-shared'

const PANE_PROPS = {
  title: 'Sudoku',
  isFocused: true,
  bodyColumns: 48,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 22 },
  view: {},
} as const

const boardProps = (element: FoundElement | undefined): BoardProps => {
  if (!element || typeof element.props.props !== 'object' || element.props.props === null) {
    throw new Error('Expected the board Client props')
  }
  return element.props.props as BoardProps
}

test('desktop uses flex Clients for the game and keeps terminal Clients unchanged', async ($, on) => {
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/desktop' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  await $.session.start({ cwd: '/work/desktop', surface: 'desktop', isInteractive: true })
  await $.command.run({
    command: 'sudoku',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  let ui = await $.ui.mount({
    plugin: 'sudoku',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'sudoku',
    props: PANE_PROPS,
  })

  expect((await ui.find({ key: 'picker' }))?.props.module).toBe('hooks/picker-desktop.tsx')
  expect(await ui.find({ type: 'Text', text: 'Choose a difficulty', in: 'picker' })).toBeDefined()
  await ui.press({ key: 'difficulty:medium' })

  let board = await ui.find({ key: 'board' })
  expect(board?.props.module).toBe('hooks/board-desktop.tsx')
  expect((await ui.find({ key: 'controls' }))?.props.module).toBe('hooks/controls-desktop.tsx')

  const state = boardProps(board)
  const empty = state.board.indexOf('0')
  const position = desktopCellPosition(
    state.geometry,
    Math.floor(empty / 9),
    empty % 9,
  )
  const clickX = position.x + Math.floor(state.geometry.cellWidth / 2)
  const clickY = position.y + Math.floor(state.geometry.cellHeight / 2)
  expect(desktopCellAt(state.geometry, clickX, clickY)).toBe(empty)
  await ui.pointer({ type: 'down', x: clickX, y: clickY, button: 'left', in: 'board' })
  expect(boardProps(await ui.find({ key: 'board' })).cursor).toBe(empty)

  await ui.key({ key: '5', in: 'board' })
  expect(boardProps(await ui.find({ key: 'board' })).board[empty]).toBe('5')
  await ui.press({ key: 'digit:7' })
  expect(boardProps(await ui.find({ key: 'board' })).board[empty]).toBe('7')
  await ui.press({ key: 'digit:0' })
  expect(boardProps(await ui.find({ key: 'board' })).board[empty]).toBe('0')

  await ui.press({ key: 'new' })
  expect((await ui.find({ key: 'picker' }))?.props.module).toBe('hooks/picker-desktop.tsx')
  await ui.key({ key: 'h', in: 'picker' })
  expect((await ui.find({ key: 'controls' }))?.props.props).toMatchObject({ difficulty: 'hard' })
  await ui.press({ key: 'new' })
  await ui.press({ key: 'difficulty:easy' })
  expect((await ui.find({ key: 'controls' }))?.props.props).toMatchObject({ difficulty: 'easy' })
  await ui.unmount()

  ui = await $.ui.mount({
    plugin: 'sudoku',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'sudoku',
    props: PANE_PROPS,
  })
  board = await ui.find({ key: 'board' })
  expect(board?.props.module).toBe('hooks/board.tsx')
  expect((await ui.find({ key: 'controls' }))?.props.module).toBe('hooks/controls.tsx')
  await ui.unmount()
})
