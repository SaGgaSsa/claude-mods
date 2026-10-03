import type {
  TriviaDifficulty,
  TriviaGame,
  TriviaHistory,
  TriviaLayout,
  TriviaLayoutTarget,
  TriviaMessage,
  TriviaPhase,
  TriviaQuestion,
  TriviaRect,
  TriviaRound,
} from '../types'

const START_LABEL = '[ Start ]'
const NEXT_LABEL = '[ Next question ]'
const OUTRO_BUTTON_WIDTH = 20
const CHART_WIDTH = 29

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: '\u00a0',
  eacute: 'é',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  ndash: '–',
  mdash: '—',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDifficulty = (value: unknown): value is TriviaDifficulty =>
  value === 'easy' || value === 'medium' || value === 'hard'

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const nonEmptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry: unknown) => nonEmptyString(entry))

export const decodeEntities = (value: string): string =>
  value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (!token.startsWith('#')) return NAMED_ENTITIES[token.toLowerCase()] ?? entity

    const hexadecimal = /^#x/i.test(token)
    const digits = token.slice(hexadecimal ? 2 : 1)
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10)
    if (
      !Number.isInteger(codePoint) ||
      codePoint <= 0 ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return entity
    }

    return String.fromCodePoint(codePoint)
  })

const parseQuestion = (value: unknown): TriviaQuestion | null => {
  if (!isRecord(value) || value.type !== 'multiple') return null
  if (!isDifficulty(value.difficulty)) return null
  if (!nonEmptyString(value.category) || !nonEmptyString(value.question)) return null
  if (!nonEmptyString(value.correct_answer) || !nonEmptyStringArray(value.incorrect_answers)) {
    return null
  }
  if (value.incorrect_answers.length !== 3) return null

  const question = decodeEntities(value.question.trim())
  const correctAnswer = decodeEntities(value.correct_answer.trim())
  const incorrectAnswers = value.incorrect_answers.map(answer =>
    decodeEntities(answer.trim()),
  )
  const allAnswers = [correctAnswer, ...incorrectAnswers]
  if (new Set(allAnswers.map(answer => answer.toLowerCase())).size !== 4) return null

  return {
    difficulty: value.difficulty,
    category: decodeEntities(value.category.trim()),
    question,
    correctAnswer,
    incorrectAnswers,
  }
}

export const parseQuestionBank = (source: string): TriviaQuestion[] => {
  const parsed: unknown = JSON.parse(source)
  if (!isRecord(parsed) || parsed.response_code !== 0 || !Array.isArray(parsed.results)) {
    throw new Error('Question bank must have response_code 0 and a results array.')
  }

  const results: unknown[] = parsed.results
  return results.flatMap((entry: unknown): TriviaQuestion[] => {
    const question = parseQuestion(entry)
    return question ? [question] : []
  })
}

export const shuffle = <T>(items: readonly T[], random: () => number): T[] => {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const sample = random()
    const safeSample = Number.isFinite(sample)
      ? Math.max(0, Math.min(sample, 0.999999999999))
      : 0
    const swapIndex = Math.floor(safeSample * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!]
  }
  return shuffled
}

const makeRound = (question: TriviaQuestion, random: () => number): TriviaRound => {
  const choices = shuffle([
    { answer: question.correctAnswer, correct: true },
    ...question.incorrectAnswers.map(answer => ({ answer, correct: false })),
  ], random)
  const correctIndex = choices.findIndex(choice => choice.correct)
  const answers = choices.map(choice => choice.answer)

  return {
    difficulty: question.difficulty,
    category: question.category,
    question: question.question,
    answers,
    correctIndex: correctIndex as 0 | 1 | 2 | 3,
  }
}

export const newGame = (
  bank: readonly TriviaQuestion[],
  random: () => number = Math.random,
): TriviaGame => {
  const questions = shuffle(bank, random)
  const rounds = questions.map(question => makeRound(question, random))

  return {
    rounds,
    currentIndex: 0,
    streak: 0,
    phase: 'idle',
    selectedAnswer: null,
  }
}

export const currentRound = (game: TriviaGame): TriviaRound | null =>
  game.rounds[game.currentIndex] ?? null

export const pick = (game: TriviaGame, choice: number): TriviaGame => {
  if (game.phase !== 'asking' || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return game
  }

  return { ...game, phase: 'locked', selectedAnswer: choice as 0 | 1 | 2 | 3 }
}

export const reveal = (game: TriviaGame): TriviaGame => {
  if (game.phase !== 'locked' || game.selectedAnswer === null) return game
  const round = currentRound(game)
  if (!round) return game

  const isCorrect = game.selectedAnswer === round.correctIndex
  if (!isCorrect) return { ...game, phase: 'wrong' }

  const streak = game.streak + 1
  const isLast = game.currentIndex === game.rounds.length - 1
  return {
    ...game,
    streak,
    phase: isLast ? 'cleared' : 'correct',
  }
}

export const next = (game: TriviaGame): TriviaGame => {
  if (game.phase !== 'correct' || game.currentIndex >= game.rounds.length - 1) return game
  return {
    ...game,
    currentIndex: game.currentIndex + 1,
    phase: 'asking',
    selectedAnswer: null,
  }
}

export const startOrRestart = (
  game: TriviaGame | null,
  bank: readonly TriviaQuestion[],
  random: () => number = Math.random,
): TriviaGame | null => {
  if (!game) {
    const fresh = newGame(bank, random)
    return fresh.rounds.length > 0 ? { ...fresh, phase: 'asking' } : fresh
  }

  if (game.phase === 'idle') {
    return game.rounds.length > 0 ? { ...game, phase: 'asking' } : game
  }
  if (game.phase !== 'wrong' && game.phase !== 'cleared') return game

  const fresh = newGame(bank, random)
  return fresh.rounds.length > 0 ? { ...fresh, phase: 'asking' } : fresh
}

export const isTriviaMessage = (value: unknown): value is TriviaMessage => {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'pick') {
    return typeof value.choice === 'number' && Number.isInteger(value.choice) &&
      value.choice >= 0 && value.choice <= 3
  }
  return value.type === 'reveal' || value.type === 'next' ||
    value.type === 'new'
}

const isHistoryEntry = (value: unknown): value is TriviaHistory['games'][number] =>
  isRecord(value) &&
  typeof value.streak === 'number' && Number.isInteger(value.streak) && value.streak >= 0 &&
  typeof value.at === 'number' && Number.isFinite(value.at) && value.at >= 0

export const emptyHistory = (): TriviaHistory => ({ best: 0, games: [] })

export const parseHistory = (value: unknown): TriviaHistory => {
  if (
    !isRecord(value) ||
    typeof value.best !== 'number' ||
    !Number.isInteger(value.best) ||
    value.best < 0
  ) {
    return emptyHistory()
  }
  if (!Array.isArray(value.games)) return emptyHistory()

  const entries: unknown[] = value.games
  const games = entries.filter(isHistoryEntry)
  if (games.length !== entries.length) return emptyHistory()

  const best = value.best
  if (games.some(game => game.streak > best)) return emptyHistory()
  return {
    best,
    games: games.slice(0, 10).map(game => ({ streak: game.streak, at: game.at })),
  }
}

export const addGame = (
  history: TriviaHistory,
  streak: number,
  at: number,
): TriviaHistory => {
  const validHistory = parseHistory(history)
  if (!Number.isInteger(streak) || streak < 0 || !Number.isFinite(at) || at < 0) {
    return validHistory
  }
  return {
    best: Math.max(validHistory.best, streak),
    games: [{ streak, at }, ...validHistory.games].slice(0, 10),
  }
}

const contains = (rect: TriviaRect, x: number, y: number): boolean =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height

const makeRect = (x: number, y: number, width: number, height = 1): TriviaRect => ({
  x,
  y,
  width,
  height,
})

export const layout = (requestedWidth: number): TriviaLayout => {
  const width = Math.max(1, Math.floor(requestedWidth))
  const narrow = width < 40
  const height = 12
  const headerY = 0
  const titleY = 2
  const questionY = 1
  const questionLines = 3
  const clawd = width >= 60 ? makeRect(0, questionY, 16, 4) : null
  const questionX = clawd ? 18 : 0
  const questionWidth = clawd ? width - questionX : Math.max(1, width - 4)
  const questionCenterWidth = clawd ? questionWidth : width
  const statusY = height - 1
  const firstAnswerY = questionY + questionLines + 1
  const historyY = firstAnswerY - 1
  const pairWidth = Math.floor((width - 2) / 2)
  const rightX = pairWidth + 2
  const rightWidth = Math.max(1, width - rightX)
  const answerBoxes = narrow ? [] : [
    makeRect(0, firstAnswerY, pairWidth, 3),
    makeRect(rightX, firstAnswerY, rightWidth, 3),
    makeRect(0, firstAnswerY + 3, pairWidth, 3),
    makeRect(rightX, firstAnswerY + 3, rightWidth, 3),
  ]
  const startWidth = Math.min(width, START_LABEL.length)
  const startButton = narrow
    ? null
    : makeRect(Math.floor((width - startWidth) / 2), statusY, startWidth)
  const nextButton = makeRect(
    Math.max(0, width - NEXT_LABEL.length),
    statusY,
    Math.min(width, NEXT_LABEL.length),
  )
  const newButtonWidth = Math.min(width, OUTRO_BUTTON_WIDTH)
  const outro = {
    titleY: 1,
    streakY: 2,
    missedY: 3,
    newButton: makeRect(
      Math.floor((width - newButtonWidth) / 2),
      5,
      newButtonWidth,
      3,
    ),
    historyY: 8,
    barsY: 9,
    numbersY: 10,
    chart: makeRect(
      Math.floor((width - Math.min(width, CHART_WIDTH)) / 2),
      8,
      Math.min(width, CHART_WIDTH),
      3,
    ),
  }

  const answerAt = (x: number, y: number): 0 | 1 | 2 | 3 | null => {
    const index = answerBoxes.findIndex(box => contains(box, x, y))
    return index >= 0 ? index as 0 | 1 | 2 | 3 : null
  }

  const targetAt = (
    x: number,
    y: number,
    phase: TriviaPhase,
    view: 'reveal' | 'outro',
  ): TriviaLayoutTarget | null => {
    if (phase === 'wrong' || phase === 'cleared') {
      return view === 'outro' && contains(outro.newButton, x, y) ? { type: 'new' } : null
    }

    const answer = answerAt(x, y)
    if (answer !== null) return { type: 'answer', choice: answer }
    if (phase === 'idle' && startButton && contains(startButton, x, y)) {
      return { type: 'start' }
    }
    if (phase === 'correct' && contains(nextButton, x, y)) return { type: 'next' }
    return null
  }

  return {
    width,
    height,
    narrow,
    headerY,
    titleY,
    questionY,
    questionLines,
    questionX,
    questionWidth,
    questionCenterWidth,
    clawd,
    historyY,
    statusY,
    narrowNoticeY: Math.floor(height / 2) - 1,
    answerBoxes,
    startButton,
    nextButton,
    outro,
    answerAt,
    targetAt,
  }
}

export const wrapText = (
  value: string,
  width: number,
  maxLines = Number.POSITIVE_INFINITY,
): string[] => {
  const lineWidth = Math.max(1, Math.floor(width))
  const completeLines: string[] = []
  const words = value.trim().split(/\s+/).filter(Boolean)
  let line = ''

  const pushLine = () => {
    if (line) completeLines.push(line)
    line = ''
  }

  for (const word of words) {
    let characters = Array.from(word)
    if (characters.length > lineWidth) {
      pushLine()
      while (characters.length > lineWidth) {
        completeLines.push(characters.splice(0, lineWidth).join(''))
      }
      line = characters.join('')
      continue
    }

    const candidate = line ? `${line} ${word}` : word
    if (Array.from(candidate).length <= lineWidth) {
      line = candidate
    } else {
      pushLine()
      line = word
    }
  }

  pushLine()
  const maximumLines = Math.max(1, Math.floor(maxLines))
  if (completeLines.length <= maximumLines) return completeLines

  const visibleLines = completeLines.slice(0, maximumLines)
  const last = maximumLines - 1
  visibleLines[last] = `${Array.from(visibleLines[last]!).slice(0, Math.max(0, lineWidth - 1)).join('')}…`
  return visibleLines
}
