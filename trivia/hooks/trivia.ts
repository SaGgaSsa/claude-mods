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

export const TRIVIA_CONFIG = {
  difficultyWeights: [
    { maxStreak: 0, easy: 90, medium: 9, hard: 1 },
    { maxStreak: 2, easy: 84, medium: 14, hard: 2 },
    { maxStreak: 5, easy: 64, medium: 29, hard: 7 },
    { maxStreak: 9, easy: 46, medium: 38, hard: 16 },
    { maxStreak: 14, easy: 31, medium: 42, hard: 27 },
    { maxStreak: 19, easy: 19, medium: 40, hard: 41 },
    { maxStreak: Infinity, easy: 10, medium: 34, hard: 56 },
  ],
  poolBalanceExponent: 2,
  antiStreak: {
    hardSoftAfter: 2,
    hardWeightMultiplier: 0.35,
    hardCap: 3,
    easySoftAfter: 3,
    easyWeightMultiplier: 0.35,
    easyCap: 4,
  },
} as const

export type TriviaDifficultyCounts = Record<TriviaDifficulty, number>
export type TriviaDifficultyWeights = Record<TriviaDifficulty, number>
export type TriviaConfig = typeof TRIVIA_CONFIG

export type NextQuestion = {
  question: TriviaQuestion
  id: string
  seen: string[]
  cycleReset: boolean
}

export type GameSelection = {
  game: TriviaGame
  seen: string[]
  cycleReset: boolean
}

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

const hashByte = (hash: number, byte: number): number => Math.imul(hash ^ byte, 0x01000193)

export const questionId = (question: string): string => {
  const normalized = decodeEntities(question).trim().toLowerCase()
  let hash = 0x811c9dc5

  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) {
      hash = hashByte(hash, codePoint)
    } else if (codePoint <= 0x7ff) {
      hash = hashByte(hash, 0xc0 | (codePoint >> 6))
      hash = hashByte(hash, 0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      hash = hashByte(hash, 0xe0 | (codePoint >> 12))
      hash = hashByte(hash, 0x80 | ((codePoint >> 6) & 0x3f))
      hash = hashByte(hash, 0x80 | (codePoint & 0x3f))
    } else {
      hash = hashByte(hash, 0xf0 | (codePoint >> 18))
      hash = hashByte(hash, 0x80 | ((codePoint >> 12) & 0x3f))
      hash = hashByte(hash, 0x80 | ((codePoint >> 6) & 0x3f))
      hash = hashByte(hash, 0x80 | (codePoint & 0x3f))
    }
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const parseSeen = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const seen: string[] = []
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string' || !/^[\da-f]{8}$/i.test(entry)) return []
    const id = entry.toLowerCase()
    if (!seen.includes(id)) seen.push(id)
  }
  return seen
}

type QuestionEntry = { question: TriviaQuestion; id: string }

const uniqueQuestionEntries = (bank: readonly TriviaQuestion[]): QuestionEntry[] => {
  const ids = new Set<string>()
  return bank.flatMap((question): QuestionEntry[] => {
    const id = questionId(question.question)
    if (ids.has(id)) return []
    ids.add(id)
    return [{ question, id }]
  })
}

const uniqueQuestions = (bank: readonly TriviaQuestion[]): TriviaQuestion[] =>
  uniqueQuestionEntries(bank).map(entry => entry.question)

const cleanSeen = (bank: readonly TriviaQuestion[], seen: readonly string[]): string[] => {
  const bankIds = new Set(uniqueQuestions(bank).map(question => questionId(question.question)))
  return [...new Set(seen.filter(id => bankIds.has(id)))]
}

export const markSeen = (
  bank: readonly TriviaQuestion[],
  seen: readonly string[],
  question: string,
): string[] => {
  const updated = cleanSeen(bank, seen)
  const id = questionId(question)
  if (
    uniqueQuestions(bank).some(entry => questionId(entry.question) === id) &&
    !updated.includes(id)
  ) {
    updated.push(id)
  }
  return updated
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

const DIFFICULTIES: readonly TriviaDifficulty[] = ['easy', 'medium', 'hard']

const emptyCounts = (): TriviaDifficultyCounts => ({ easy: 0, medium: 0, hard: 0 })

const safeRandom = (random: () => number): number => {
  const sample = random()
  return Number.isFinite(sample) ? Math.max(0, Math.min(sample, 0.999999999999)) : 0
}

export const difficultyWeights = (
  streak: number,
  config: TriviaConfig = TRIVIA_CONFIG,
): TriviaDifficultyWeights => {
  const normalizedStreak = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0
  const entry = config.difficultyWeights.find(weight => normalizedStreak <= weight.maxStreak)
  const selected = entry ?? config.difficultyWeights[config.difficultyWeights.length - 1]!
  return { easy: selected.easy, medium: selected.medium, hard: selected.hard }
}

export const poolFactors = (
  totals: TriviaDifficultyCounts,
  remaining: TriviaDifficultyCounts,
  config: TriviaConfig = TRIVIA_CONFIG,
): TriviaDifficultyCounts => {
  const totalQuestions = DIFFICULTIES.reduce((sum, difficulty) => sum + totals[difficulty], 0)
  const remainingQuestions = DIFFICULTIES.reduce(
    (sum, difficulty) => sum + remaining[difficulty],
    0,
  )
  if (totalQuestions <= 0 || remainingQuestions <= 0) return emptyCounts()

  const remainingShare = remainingQuestions / totalQuestions
  const factors = emptyCounts()
  for (const difficulty of DIFFICULTIES) {
    const total = totals[difficulty]
    const left = remaining[difficulty]
    if (total <= 0 || left <= 0) continue
    const difficultyShare = left / total
    factors[difficulty] = Math.pow(difficultyShare / remainingShare, config.poolBalanceExponent)
  }
  return factors
}

const trailingCount = (
  recent: readonly TriviaDifficulty[],
  difficulty: TriviaDifficulty,
): number => {
  let count = 0
  for (let index = recent.length - 1; index >= 0; index--) {
    if (recent[index] !== difficulty) break
    count++
  }
  return count
}

export const antiStreakWeights = (
  weights: TriviaDifficultyWeights,
  recent: readonly TriviaDifficulty[],
  available: TriviaDifficultyCounts,
  config: TriviaConfig = TRIVIA_CONFIG,
): TriviaDifficultyWeights => {
  const adjusted = { ...weights }
  const blocked: TriviaDifficulty[] = []
  const hardRun = trailingCount(recent, 'hard')
  const easyRun = trailingCount(recent, 'easy')

  if (hardRun >= config.antiStreak.hardCap) {
    adjusted.hard = 0
    blocked.push('hard')
  } else if (hardRun >= config.antiStreak.hardSoftAfter) {
    adjusted.hard *= config.antiStreak.hardWeightMultiplier
  }
  if (easyRun >= config.antiStreak.easyCap) {
    adjusted.easy = 0
    blocked.push('easy')
  } else if (easyRun >= config.antiStreak.easySoftAfter) {
    adjusted.easy *= config.antiStreak.easyWeightMultiplier
  }

  const allAvailableBlocked = DIFFICULTIES.every(
    difficulty => available[difficulty] <= 0 || adjusted[difficulty] <= 0,
  )
  if (allAvailableBlocked) {
    for (const difficulty of blocked) adjusted[difficulty] = weights[difficulty]
  }
  return adjusted
}

export const pickDifficulty = (
  weights: TriviaDifficultyWeights,
  available: TriviaDifficultyCounts,
  random: () => number,
): TriviaDifficulty | null => {
  const candidates = DIFFICULTIES.filter(difficulty => available[difficulty] > 0)
  if (candidates.length === 0) return null

  const totalWeight = candidates.reduce((sum, difficulty) => sum + weights[difficulty], 0)
  const proportional = totalWeight <= 0
  const total = proportional
    ? candidates.reduce((sum, difficulty) => sum + available[difficulty], 0)
    : totalWeight
  let target = safeRandom(random) * total

  for (const difficulty of candidates) {
    target -= proportional ? available[difficulty] : weights[difficulty]
    if (target < 0) return difficulty
  }
  return candidates[candidates.length - 1]!
}

const countByDifficulty = (
  questions: readonly TriviaQuestion[],
): TriviaDifficultyCounts => {
  const counts = emptyCounts()
  for (const question of questions) counts[question.difficulty]++
  return counts
}

const recentWith = (
  recent: readonly TriviaDifficulty[],
  difficulty: TriviaDifficulty,
): TriviaDifficulty[] => [...recent, difficulty].slice(-4)

export const pickNextQuestion = (
  bank: readonly TriviaQuestion[],
  seen: readonly string[],
  askedIds: readonly string[],
  streak: number,
  recent: readonly TriviaDifficulty[],
  random: () => number = Math.random,
  config: TriviaConfig = TRIVIA_CONFIG,
): NextQuestion | null => {
  const entries = uniqueQuestionEntries(bank)
  if (entries.length === 0) return null

  const bankIds = new Set(entries.map(entry => entry.id))
  const asked = [...new Set(askedIds.filter(id => bankIds.has(id)))]
  const askedSet = new Set(asked)
  let cleanedSeen = [...new Set(seen.filter(id => bankIds.has(id)))]
  const seenSet = new Set(cleanedSeen)
  const unseen = entries.filter(entry => !seenSet.has(entry.id) && !askedSet.has(entry.id))

  let candidates = unseen
  let cycleReset = false
  if (candidates.length === 0) {
    candidates = entries.filter(entry => !askedSet.has(entry.id))
    if (candidates.length === 0) return null
    cleanedSeen = asked
    cycleReset = true
  }

  const totals = countByDifficulty(entries.map(entry => entry.question))
  const remaining = countByDifficulty(candidates.map(entry => entry.question))
  const base = difficultyWeights(streak, config)
  const factors = poolFactors(totals, remaining, config)
  const pooled: TriviaDifficultyWeights = {
    easy: base.easy * factors.easy,
    medium: base.medium * factors.medium,
    hard: base.hard * factors.hard,
  }
  const balanced = antiStreakWeights(pooled, recent.slice(-4), remaining, config)
  const difficulty = pickDifficulty(balanced, remaining, random)
  if (!difficulty) return null

  const questionPool = candidates.filter(entry => entry.question.difficulty === difficulty)
  const index = Math.floor(safeRandom(random) * questionPool.length)
  const selected = questionPool[index]
  if (!selected) return null

  return {
    question: selected.question,
    id: selected.id,
    seen: cleanedSeen,
    cycleReset,
  }
}

const gameFromSelection = (
  selection: NextQuestion | null,
  random: () => number,
  phase: TriviaGame['phase'],
  streak = 0,
  recent: readonly TriviaDifficulty[] = [],
  askedIds: readonly string[] = [],
): TriviaGame => {
  if (!selection) {
    return {
      round: null,
      roundId: null,
      askedIds: [...askedIds],
      recent: [...recent].slice(-4),
      streak,
      phase,
      selectedAnswer: null,
    }
  }

  return {
    round: makeRound(selection.question, random),
    roundId: selection.id,
    askedIds: [...askedIds, selection.id],
    recent: recentWith(recent, selection.question.difficulty),
    streak,
    phase,
    selectedAnswer: null,
  }
}

export const newGame = (
  bank: readonly TriviaQuestion[],
  random: () => number = Math.random,
  seen: readonly string[] = [],
  config: TriviaConfig = TRIVIA_CONFIG,
): GameSelection => {
  const selection = pickNextQuestion(bank, seen, [], 0, [], random, config)
  const game = gameFromSelection(selection, random, 'idle')
  return {
    game: { ...game, askedIds: [], recent: [] },
    seen: selection?.seen ?? cleanSeen(bank, seen),
    cycleReset: selection?.cycleReset ?? false,
  }
}

export const beginGame = (game: TriviaGame): TriviaGame => {
  if (game.phase !== 'idle' || !game.round || !game.roundId) return game
  return {
    ...game,
    askedIds: [...new Set([...game.askedIds, game.roundId])],
    recent: recentWith(game.recent, game.round.difficulty),
    phase: 'asking',
  }
}

export const pick = (game: TriviaGame, choice: number): TriviaGame => {
  if (game.phase !== 'asking' || !Number.isInteger(choice) || choice < 0 || choice > 3) {
    return game
  }

  return { ...game, phase: 'locked', selectedAnswer: choice as 0 | 1 | 2 | 3 }
}

export const reveal = (
  game: TriviaGame,
  bank: readonly TriviaQuestion[],
): TriviaGame => {
  if (game.phase !== 'locked' || game.selectedAnswer === null) return game
  const round = game.round
  if (!round) return game

  const isCorrect = game.selectedAnswer === round.correctIndex
  if (!isCorrect) return { ...game, phase: 'wrong' }

  const streak = game.streak + 1
  const isLast = game.askedIds.length >= uniqueQuestions(bank).length
  return {
    ...game,
    streak,
    phase: isLast ? 'cleared' : 'correct',
  }
}

export const next = (
  game: TriviaGame,
  bank: readonly TriviaQuestion[],
  random: () => number = Math.random,
  seen: readonly string[] = [],
  config: TriviaConfig = TRIVIA_CONFIG,
): GameSelection => {
  if (game.phase !== 'correct') {
    return { game, seen: [...seen], cycleReset: false }
  }
  const selection = pickNextQuestion(
    bank,
    seen,
    game.askedIds,
    game.streak,
    game.recent,
    random,
    config,
  )
  const updated = selection
    ? gameFromSelection(
      selection,
      random,
      'asking',
      game.streak,
      game.recent,
      game.askedIds,
    )
    : { ...game, phase: 'cleared' as const }
  return {
    game: updated,
    seen: selection?.seen ?? cleanSeen(bank, seen),
    cycleReset: selection?.cycleReset ?? false,
  }
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
  // The intro's Start shares the final screen's button.
  const startButton = narrow ? null : outro.newButton

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
