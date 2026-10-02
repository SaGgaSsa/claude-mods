// Boards are 81-character strings, row by row; '0' is an empty cell.
export type Difficulty = 'easy' | 'medium' | 'hard'

export type SudokuGame = {
  puzzle: string
  solution: string
  board: string
  cursor: number
  isSolved: boolean
  difficulty: Difficulty
}

// What the board Client draws, handed over as its props.
export type BoardProps = {
  puzzle: string
  board: string
  cursor: number
  clashes: number[]
}

// What the board Client posts back on a key or a click.
export type BoardMessage =
  | { type: 'select'; index: number }
  | { type: 'move'; rows: number; cols: number }
  | { type: 'digit'; digit: number }

declare module 'claude-code' {
  interface PluginState {
    sudoku: {
      game: SudokuGame | null
      selectingDifficulty: boolean
    }
  }
}
