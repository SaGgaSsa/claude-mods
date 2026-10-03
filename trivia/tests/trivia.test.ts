import { expect, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

import type { TriviaGame, TriviaProps, TriviaQuestion } from '../types'
import {
  decodeEntities,
  formatMoney,
  layout,
  newGame,
  next,
  parseQuestionBank,
  pick,
  PRIZE_LADDER,
  reveal,
  safeWinnings,
  startOrRestart,
  walkAway,
} from '../hooks/trivia'

const fixedRandom = () => 0.37

const sampleBank = (count = 15): TriviaQuestion[] =>
  Array.from({ length: count }, (_, index) => ({
    difficulty: index < 5 ? 'easy' : index < 10 ? 'medium' : 'hard',
    category: 'Test questions',
    question: `Question ${index + 1}?`,
    correctAnswer: `Right ${index + 1}`,
    incorrectAnswers: [`Wrong ${index}-A`, `Wrong ${index}-B`, `Wrong ${index}-C`],
  }))

const startGame = (bank = sampleBank()): TriviaGame => {
  const game = startOrRestart(newGame(bank, fixedRandom), bank, fixedRandom)
  if (!game) throw new Error('Expected a game')
  return game
}

const sourceQuestion = {
  type: 'multiple',
  difficulty: 'easy',
  category: 'Arts &amp; Culture',
  question: 'Who said &quot;hello&quot;? &#039;A&#039;',
  correct_answer: 'A &amp; B',
  incorrect_answers: ['C &amp; D', 'E', 'F'],
}

test('decodes common named and numeric entities and filters malformed bank entries', () => {
  const entities = '&quot;&amp;&apos;&lt;&gt;&nbsp;&eacute;&aacute;&iacute;&oacute;&uacute;' +
    '&ntilde;&uuml;&ouml;&auml;&rsquo;&lsquo;&ldquo;&rdquo;&hellip;&ndash;&mdash;'
  const decoded = '"&\'<>\u00a0éáíóúñüöä’‘“”…–—'
  expect(decodeEntities(entities)).toBe(decoded)
  expect(decodeEntities('&#39; and &#x41;')).toBe("' and A")

  const malformed = { ...sourceQuestion, incorrect_answers: ['only one'] }
  const booleanQuestion = {
    type: 'boolean',
    difficulty: 'easy',
    category: 'Science',
    question: 'Is this true?',
    correct_answer: 'False',
    incorrect_answers: ['True'],
  }
  const bank = parseQuestionBank(JSON.stringify({
    response_code: 0,
    results: [sourceQuestion, booleanQuestion, malformed, null],
  }))

  expect(bank).toHaveLength(1)
  expect(bank[0]!.category).toBe('Arts & Culture')
  expect(bank[0]!.question).toBe('Who said "hello"? \'A\'')
  expect(bank[0]!.correctAnswer).toBe('A & B')
})

test('creates a shuffled fifteen-question ladder with matching answer keys', () => {
  const game = newGame(sampleBank(), fixedRandom)
  expect(game.rounds).toHaveLength(15)
  expect(game.rounds.map(round => round.difficulty)).toEqual([
    'easy', 'easy', 'easy', 'easy', 'easy',
    'medium', 'medium', 'medium', 'medium', 'medium',
    'hard', 'hard', 'hard', 'hard', 'hard',
  ])
  expect(game.rounds.every(round => round.answers[round.correctIndex] !== undefined)).toBe(true)
  expect(game.rounds.every(round => new Set(round.answers).size === 4)).toBe(true)
  expect(game.rounds.map(round => round.question).length).toBe(new Set(
    game.rounds.map(round => round.question),
  ).size)
  expect(game.prizes).toEqual([...PRIZE_LADDER])
  expect(game.phase).toBe('idle')

  const shortGame = newGame(sampleBank(3), fixedRandom)
  expect(shortGame.rounds).toHaveLength(3)
  expect(shortGame.prizes).toEqual([250_000, 500_000, 1_000_000])
  expect(formatMoney(shortGame.prizes[0]!)).toBe('$250,000')

  const missingDifficulty = sampleBank(15).map((question, index) => ({
    ...question,
    difficulty: index < 5 ? 'easy' as const : 'medium' as const,
  }))
  const filledGame = newGame(missingDifficulty, fixedRandom)
  expect(filledGame.rounds).toHaveLength(15)
  expect(new Set(filledGame.rounds.map(round => round.question)).size).toBe(15)
})

test('handles pick, reveal, safe payouts, walking away, winning and ignored phases', () => {
  const bank = sampleBank()
  const idle = newGame(bank, fixedRandom)
  expect(pick(idle, 0)).toBe(idle)
  expect(reveal(idle)).toBe(idle)
  expect(next(idle)).toBe(idle)

  let game = startGame(bank)
  expect(reveal(game)).toBe(game)
  expect(next(game)).toBe(game)

  const firstRound = game.rounds[0]!
  game = pick(game, firstRound.correctIndex)
  expect(game.phase).toBe('locked')
  expect(pick(game, 0)).toBe(game)
  expect(walkAway(game)).toBe(game)
  game = reveal(game)
  expect(game.phase).toBe('correct')
  game = next(game)
  expect(game.phase).toBe('asking')
  expect(game.currentIndex).toBe(1)
  game = walkAway(game)
  expect(game.phase).toBe('walked')
  expect(game.takeHome).toBe(game.prizes[0])
  expect(walkAway(game)).toBe(game)

  game = startGame(bank)
  for (let question = 0; question < 5; question++) {
    const answer = game.rounds[game.currentIndex]!.correctIndex
    game = reveal(pick(game, answer))
    if (question < 4) game = next(game)
  }
  expect(game.correctCount).toBe(5)
  expect(safeWinnings(game)).toBe(1_000)
  game = next(game)

  const sixthRound = game.rounds[game.currentIndex]!
  const wrongChoice = sixthRound.correctIndex === 0 ? 1 : 0
  game = reveal(pick(game, wrongChoice))
  expect(game.phase).toBe('wrong')
  expect(game.takeHome).toBe(1_000)
  expect(next(game)).toBe(game)
  const restarted = startOrRestart(game, bank, fixedRandom)
  expect(restarted?.phase).toBe('asking')
  expect(restarted?.currentIndex).toBe(0)

  let finalGame = startGame(sampleBank(1))
  const finalAnswer = finalGame.rounds[0]!.correctIndex
  finalGame = reveal(pick(finalGame, finalAnswer))
  expect(finalGame.phase).toBe('won')
  expect(finalGame.takeHome).toBe(1_000_000)
})

test('layout provides exact-width rows and a shared hit target for answer A', async ($, on) => {
  const geometry = layout(60)
  expect(geometry.height).toBe(12)
  expect(geometry.answerBoxes).toHaveLength(4)
  expect(geometry.clawd).toEqual({ x: 0, y: 1, width: 16, height: 4 })
  expect(layout(59).clawd).toBeNull()
  const boxA = geometry.answerBoxes[0]!
  expect(geometry.answerAt(boxA.x + 2, boxA.y + 1)).toBe(0)
  expect(geometry.targetAt(boxA.x + 2, boxA.y + 1, 'asking')).toEqual({
    type: 'answer',
    choice: 0,
  })
  expect(geometry.targetAt(geometry.newButton.x + 1, geometry.statusY, 'wrong')).toEqual({
    type: 'new',
  })
  expect(geometry.targetAt(geometry.newButton.x + 1, geometry.statusY, 'walked')).toEqual({
    type: 'new',
  })
  expect(geometry.targetAt(geometry.newButton.x + 1, geometry.statusY, 'correct')).toEqual({
    type: 'next',
  })

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })

  const fileBank = sampleBank().map(question => ({
    type: 'multiple',
    difficulty: question.difficulty,
    category: question.category,
    question: question.question,
    correct_answer: question.correctAnswer,
    incorrect_answers: question.incorrectAnswers,
  }))
  const bankSource = JSON.stringify({ response_code: 0, results: fileBank })
  on('fs.read', (_, e) => {
    expect(e.path.endsWith('questions.json')).toBe(true)
    return { value: bankSource }
  })

  await $.session.start({ cwd: '/work/trivia', surface: 'terminal', isInteractive: true })
  expect(parseQuestionBank(bankSource)).toHaveLength(15)

  const bandProps = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  } as const
  const mount = (bodyColumns = 60) => $.ui.mount({
    plugin: 'trivia',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...bandProps, bodyColumns },
  })

  let ui = await mount()
  expect(await ui.find({ key: 'stage' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Engine output/ })).toBeDefined()
  await ui.unmount()

  await $.command.run({
    command: 'trivia',
    args: 'on',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 60 },
  })
  ui = await mount()

  const client = await ui.find({ key: 'stage' })
  expect(client?.props.width).toBe(60)
  expect(client?.props.height).toBe(12)
  const initial = triviaProps(client)
  expect(initial.game?.phase).toBe('idle')
  expect(initial.game?.rounds).toHaveLength(15)

  const startButton = geometry.startButton!
  await ui.pointer({
    type: 'down',
    x: startButton.x + Math.floor(startButton.width / 2),
    y: startButton.y,
    button: 'left',
    in: 'stage',
  })
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('asking')

  const clawdArea = geometry.clawd!
  const firstFrame = canvasOf(await ui.drawn({ in: 'stage' }))
  const clawdFrame = (grid: string[][]) => grid
    .slice(clawdArea.y, clawdArea.y + clawdArea.height)
    .map(row => row.slice(clawdArea.x, clawdArea.x + clawdArea.width).join(''))
    .join('\n')
  expect(/[▀▄█]/.test(clawdFrame(firstFrame))).toBe(true)
  expect(firstFrame).toHaveLength(12)
  expect(firstFrame.every(row => row.length === 60)).toBe(true)

  await ui.advance(210)
  const secondFrame = canvasOf(await ui.drawn({ in: 'stage' }))
  expect(clawdFrame(secondFrame) !== clawdFrame(firstFrame)).toBe(true)
  await ui.advance(1_390)

  const drawn = await ui.drawn({ in: 'stage' })
  const grid = canvasOf(drawn)
  expect(grid).toHaveLength(12)
  expect(grid.every(row => row.length === 60)).toBe(true)
  expect(grid[6]!.join('')).toContain('A:')

  const answerA = geometry.answerBoxes[0]!
  await ui.pointer({
    type: 'down',
    x: answerA.x + 2,
    y: answerA.y + 1,
    button: 'left',
    in: 'stage',
  })
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('locked')

  await ui.advance(2_000)
  let liveGame = triviaProps(await ui.find({ key: 'stage' })).game
  if (liveGame?.phase === 'correct') {
    await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'stage' })
    await ui.advance(1_600)
    liveGame = triviaProps(await ui.find({ key: 'stage' })).game
    if (!liveGame || liveGame.phase !== 'asking') throw new Error('Expected the next question')

    const round = liveGame.rounds[liveGame.currentIndex]!
    const wrongChoice = round.correctIndex === 0 ? 1 : 0
    const wrongBox = geometry.answerBoxes[wrongChoice]!
    await ui.pointer({
      type: 'down',
      x: wrongBox.x + 2,
      y: wrongBox.y + 1,
      button: 'left',
      in: 'stage',
    })
    await ui.advance(2_000)
    liveGame = triviaProps(await ui.find({ key: 'stage' })).game
  }
  expect(liveGame?.phase).toBe('wrong')

  const clickNewGame = async () => ui.pointer({
    type: 'down',
    x: geometry.newButton.x + 1,
    y: geometry.newButton.y,
    button: 'left',
    in: 'stage',
  })
  await clickNewGame()
  liveGame = triviaProps(await ui.find({ key: 'stage' })).game
  expect(liveGame?.phase).toBe('asking')
  expect(liveGame?.currentIndex).toBe(0)

  const walkButton = geometry.walkButton!
  await ui.pointer({
    type: 'down',
    x: walkButton.x + 1,
    y: walkButton.y,
    button: 'left',
    in: 'stage',
  })
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('walked')
  await clickNewGame()
  liveGame = triviaProps(await ui.find({ key: 'stage' })).game
  expect(liveGame?.phase).toBe('asking')
  expect(liveGame?.currentIndex).toBe(0)

  await ui.unmount()

  ui = await mount(59)
  const narrowGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expect(narrowGrid).toHaveLength(12)
  expect(narrowGrid.every(row => row.length === 59)).toBe(true)
  expect(/[▀▄█]/.test(narrowGrid.flat().join(''))).toBe(false)
  await ui.unmount()
})

const triviaProps = (element: FoundElement | undefined): TriviaProps => {
  if (!element || typeof element.props.props !== 'object' || element.props.props === null) {
    throw new Error('Expected Trivia Client props')
  }
  return element.props.props as TriviaProps
}

const childrenOf = (node: RenderNode): RenderNode[] => {
  if (typeof node === 'string' || !('children' in node)) return []
  return node.children ?? []
}

const textOf = (node: RenderNode): string =>
  typeof node === 'string' ? node : childrenOf(node).map(textOf).join('')

const canvasOf = (tree: RenderElement): string[][] => childrenOf(tree).map(row =>
  childrenOf(row).flatMap(span => Array.from(textOf(span))),
)
