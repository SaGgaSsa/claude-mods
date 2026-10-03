import type {
  TriviaDifficulty,
  TriviaGame,
  TriviaLayout,
  TriviaLayoutTarget,
  TriviaMessage,
  TriviaPhase,
  TriviaQuestion,
  TriviaRect,
  TriviaRound,
} from '../types'

export const PRIZE_LADDER = [
  100,
  200,
  300,
  500,
  1_000,
  2_000,
  4_000,
  8_000,
  16_000,
  32_000,
  64_000,
  125_000,
  250_000,
  500_000,
  1_000_000,
] as const

const DIFFICULTIES: TriviaDifficulty[] = ['easy', 'medium', 'hard']
const WALK_LABEL = '[ Walk away ]'
const START_LABEL = '[ Start ]'
const NEXT_LABEL = '[ Next question ]'
const NEW_LABEL = '[ New game ]'

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

const uniqueQuestions = (bank: readonly TriviaQuestion[]): TriviaQuestion[] => {
  const seen = new Set<string>()
  return bank.filter(question => {
    const key = `${question.question.toLowerCase()}\u0000${question.correctAnswer.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const selectQuestions = (
  bank: readonly TriviaQuestion[],
  random: () => number,
): TriviaQuestion[] => {
  let remaining = shuffle(uniqueQuestions(bank), random)
  const selected: TriviaQuestion[] = []

  for (const difficulty of DIFFICULTIES) {
    const preferred = shuffle(
      remaining.filter(question => question.difficulty === difficulty),
      random,
    ).slice(0, 5)
    const used = new Set(preferred)
    remaining = remaining.filter(question => !used.has(question))

    const group = [...preferred]
    while (group.length < 5 && remaining.length > 0) {
      group.push(remaining.shift()!)
    }
    selected.push(...group)
  }

  return selected
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
  const questions = selectQuestions(bank, random)
  const rounds = questions.map(question => makeRound(question, random))

  return {
    rounds,
    prizes: PRIZE_LADDER.slice(PRIZE_LADDER.length - rounds.length),
    currentIndex: 0,
    correctCount: 0,
    phase: 'idle',
    selectedAnswer: null,
    takeHome: 0,
  }
}

export const currentRound = (game: TriviaGame): TriviaRound | null =>
  game.rounds[game.currentIndex] ?? null

export const formatMoney = (amount: number): string =>
  `$${Math.max(0, Math.floor(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

export const safeWinnings = (game: TriviaGame): number => {
  if (game.correctCount >= 10) return 32_000
  if (game.correctCount >= 5) return 1_000
  return 0
}

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
  if (!isCorrect) {
    return { ...game, phase: 'wrong', takeHome: safeWinnings(game) }
  }

  const correctCount = game.correctCount + 1
  const isLast = game.currentIndex === game.rounds.length - 1
  return {
    ...game,
    correctCount,
    phase: isLast ? 'won' : 'correct',
    takeHome: isLast ? game.prizes[game.currentIndex] ?? 0 : game.takeHome,
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

export const walkAway = (game: TriviaGame): TriviaGame => {
  if (game.phase !== 'asking') return game
  const takeHome = game.correctCount > 0 ? game.prizes[game.correctCount - 1] ?? 0 : 0
  return { ...game, phase: 'walked', takeHome }
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
  if (game.phase !== 'wrong' && game.phase !== 'won' && game.phase !== 'walked') return game

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
    value.type === 'walk' || value.type === 'new'
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
  const statusY = height - 1
  const firstAnswerY = questionY + questionLines + 1
  const pairWidth = Math.floor((width - 2) / 2)
  const rightX = pairWidth + 2
  const rightWidth = Math.max(1, width - rightX)
  const answerBoxes = narrow ? [] : [
    makeRect(0, firstAnswerY, pairWidth, 3),
    makeRect(rightX, firstAnswerY, rightWidth, 3),
    makeRect(0, firstAnswerY + 3, pairWidth, 3),
    makeRect(rightX, firstAnswerY + 3, rightWidth, 3),
  ]
  const walkWidth = Math.min(width, WALK_LABEL.length)
  const walkButton = narrow ? null : makeRect(width - walkWidth, headerY, walkWidth)
  const startWidth = Math.min(width, START_LABEL.length)
  const startButton = narrow
    ? null
    : makeRect(Math.floor((width - startWidth) / 2), statusY, startWidth)
  const nextButton = makeRect(
    Math.max(0, width - NEXT_LABEL.length),
    statusY,
    Math.min(width, NEXT_LABEL.length),
  )
  const newButton = makeRect(
    Math.max(0, width - NEW_LABEL.length),
    statusY,
    Math.min(width, NEW_LABEL.length),
  )

  const answerAt = (x: number, y: number): 0 | 1 | 2 | 3 | null => {
    const index = answerBoxes.findIndex(box => contains(box, x, y))
    return index >= 0 ? index as 0 | 1 | 2 | 3 : null
  }

  const targetAt = (x: number, y: number): TriviaLayoutTarget | null => {
    const answer = answerAt(x, y)
    if (answer !== null) return { type: 'answer', choice: answer }
    if (walkButton && contains(walkButton, x, y)) return { type: 'walk' }
    if (startButton && contains(startButton, x, y)) return { type: 'start' }
    if (contains(nextButton, x, y)) return { type: 'next' }
    if (contains(newButton, x, y)) return { type: 'new' }
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
    statusY,
    narrowNoticeY: Math.floor(height / 2) - 1,
    answerBoxes,
    walkButton,
    startButton,
    nextButton,
    newButton,
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
