export type TriviaDifficulty = 'easy' | 'medium' | 'hard'

export type TriviaPhase =
  | 'idle'
  | 'asking'
  | 'locked'
  | 'correct'
  | 'wrong'
  | 'cleared'

export type TriviaQuestion = {
  difficulty: TriviaDifficulty
  category: string
  question: string
  correctAnswer: string
  incorrectAnswers: string[]
}

export type TriviaRound = {
  difficulty: TriviaDifficulty
  category: string
  question: string
  answers: string[]
  correctIndex: 0 | 1 | 2 | 3
}

export type TriviaGame = {
  rounds: TriviaRound[]
  currentIndex: number
  streak: number
  phase: TriviaPhase
  selectedAnswer: 0 | 1 | 2 | 3 | null
}

export type TriviaHistory = {
  best: number
  games: { streak: number; at: number }[]
}

export type TriviaProps = {
  game: TriviaGame | null
  error: string | null
  width: number
  best: number
  recent: number[]
  newBest: boolean
}

export type TriviaMessage =
  | { type: 'pick'; choice: 0 | 1 | 2 | 3 }
  | { type: 'reveal' }
  | { type: 'next' }
  | { type: 'new' }

export type TriviaRect = {
  x: number
  y: number
  width: number
  height: number
}

export type TriviaLayoutTarget =
  | { type: 'answer'; choice: 0 | 1 | 2 | 3 }
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'new' }

export type TriviaLayout = {
  width: number
  height: 12
  narrow: boolean
  headerY: number
  titleY: number
  questionY: number
  questionLines: number
  questionX: number
  questionWidth: number
  questionCenterWidth: number
  clawd: TriviaRect | null
  historyY: number
  statusY: number
  narrowNoticeY: number
  answerBoxes: TriviaRect[]
  startButton: TriviaRect | null
  nextButton: TriviaRect
  newButton: TriviaRect
  answerAt: (x: number, y: number) => 0 | 1 | 2 | 3 | null
  targetAt: (x: number, y: number, phase: TriviaPhase) => TriviaLayoutTarget | null
}

declare module 'claude-code' {
  interface PluginState {
    trivia: {
      isShown: boolean
      game: TriviaGame | null
    }
  }
}
