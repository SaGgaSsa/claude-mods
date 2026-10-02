// Boards are 81-character strings, row by row; '0' is an empty cell.
export type Difficulty = 'easy' | 'medium' | 'hard'

export type GeometryProps = {
  scale: number
  cellWidth: number
  cellHeight: number
  width: number
  height: number
}

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
  geometry: GeometryProps
}

// What the board Client posts back on a key or a click.
export type BoardAction =
  | { type: 'select'; index: number }
  | { type: 'move'; rows: number; cols: number }
  | { type: 'digit'; digit: number }
  | { type: 'new' }
  | { type: 'input' }

export type BoardMessage = BoardAction & { geometry: GeometryProps }

export type PickerProps = {
  difficulty: Difficulty | null
  hasGame: boolean
  geometry: GeometryProps
}

export type PickerMessage =
  | { type: 'choose'; difficulty: Difficulty }
  | { type: 'cancel' }
  | { type: 'digit'; digit: number }
  | { type: 'input' }

export type ControlsProps = {
  difficulty: Difficulty
  filled: number
  clashes: number
  isSolved: boolean
  keyboardActive: boolean
  geometry: GeometryProps
}

export type ControlsMessage =
  | { type: 'digit'; digit: number; geometry: GeometryProps }
  | { type: 'move'; rows: number; cols: number; geometry: GeometryProps }
  | { type: 'new'; geometry: GeometryProps }
  | { type: 'focus'; geometry: GeometryProps }
  | { type: 'input'; geometry: GeometryProps }

declare module 'claude-code' {
  interface PluginState {
    sudoku: {
      game: SudokuGame | null
      selectingDifficulty: boolean
      keyboardActive: boolean
    }
  }
}
