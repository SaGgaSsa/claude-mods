import type { Difficulty, SudokuGame } from '../types'

const TARGET_GIVENS = {
  easy: 40,
  medium: 32,
  hard: 26,
} as const

type Grid = number[]

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy
}

const canPlace = (grid: Grid, index: number, digit: number): boolean => {
  const row = Math.floor(index / 9)
  const col = index % 9
  const boxRow = row - (row % 3)
  const boxCol = col - (col % 3)

  for (let i = 0; i < 9; i++) {
    if (grid[row * 9 + i] === digit) return false
    if (grid[i * 9 + col] === digit) return false
    const r = boxRow + Math.floor(i / 3)
    const c = boxCol + (i % 3)
    if (grid[r * 9 + c] === digit) return false
  }
  return true
}

// Fills a grid with a random complete solution.
const fill = (grid: Grid): boolean => {
  const index = grid.indexOf(0)
  if (index === -1) return true

  for (const digit of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(grid, index, digit)) {
      grid[index] = digit
      if (fill(grid)) return true
      grid[index] = 0
    }
  }
  return false
}

// Counts solutions, stopping once `limit` is reached.
export const countSolutions = (grid: Grid, limit = 2): number => {
  const index = grid.indexOf(0)
  if (index === -1) return 1

  let count = 0
  for (let digit = 1; digit <= 9 && count < limit; digit++) {
    if (canPlace(grid, index, digit)) {
      grid[index] = digit
      count += countSolutions(grid, limit - count)
      grid[index] = 0
    }
  }
  return count
}

export const toGrid = (board: string): Grid => [...board].map(Number)

export const newGame = (difficulty: Difficulty): SudokuGame => {
  const solution: Grid = new Array(81).fill(0)
  fill(solution)

  const puzzle = [...solution]
  let givens = 81
  for (const index of shuffle([...Array(81).keys()])) {
    if (givens <= TARGET_GIVENS[difficulty]) break
    const digit = puzzle[index] ?? 0
    puzzle[index] = 0
    if (countSolutions([...puzzle]) === 1) {
      givens--
    } else {
      puzzle[index] = digit
    }
  }

  const puzzleText = puzzle.join('')
  const cursor = puzzle.indexOf(0)

  return {
    puzzle: puzzleText,
    solution: solution.join(''),
    board: puzzleText,
    cursor: cursor === -1 ? 0 : cursor,
    isSolved: false,
    difficulty,
  }
}

export const isGiven = (game: SudokuGame, index: number): boolean => game.puzzle[index] !== '0'

// Writes a digit (0 clears) into the cursor cell; givens never change.
export const setDigit = (game: SudokuGame, digit: number): SudokuGame => {
  if (game.isSolved || isGiven(game, game.cursor)) return game

  const board = game.board.slice(0, game.cursor) + digit + game.board.slice(game.cursor + 1)
  return { ...game, board, isSolved: board === game.solution }
}

export const moveCursor = (game: SudokuGame, rows: number, cols: number): SudokuGame => {
  const row = (Math.floor(game.cursor / 9) + rows + 9) % 9
  const col = ((game.cursor % 9) + cols + 9) % 9
  return { ...game, cursor: row * 9 + col }
}

// Cells whose digit repeats in their row, column or box.
export const conflicts = (board: string): Set<number> => {
  const grid = toGrid(board)
  const found = new Set<number>()

  for (let index = 0; index < 81; index++) {
    const digit = grid[index] ?? 0
    if (digit === 0) continue
    grid[index] = 0
    if (!canPlace(grid, index, digit)) found.add(index)
    grid[index] = digit
  }
  return found
}
