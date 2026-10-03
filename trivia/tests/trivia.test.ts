import { expect, mock, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'
import type { RenderElement, RenderNode } from 'claude-code'

import type { TriviaGame, TriviaHistory, TriviaProps, TriviaQuestion } from '../types'
import {
  addGame,
  decodeEntities,
  emptyHistory,
  layout,
  newGame,
  next,
  parseHistory,
  parseQuestionBank,
  pick,
  reveal,
  startOrRestart,
} from '../hooks/trivia'
import { stageGame } from '../hooks/register'

const fixedRandom = () => 0.37

const sampleBank = (count = 30): TriviaQuestion[] =>
  Array.from({ length: count }, (_, index) => ({
    difficulty: index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard',
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

test('decodes entities and filters boolean and malformed bank entries', () => {
  const entities = '&quot;&amp;&apos;&lt;&gt;&nbsp;&eacute;&aacute;&iacute;&oacute;&uacute;' +
    '&ntilde;&uuml;&ouml;&auml;&rsquo;&lsquo;&ldquo;&rdquo;&hellip;&ndash;&mdash;'
  const decoded = "\"&'<>\u00a0\u00e9\u00e1\u00ed\u00f3\u00fa\u00f1" +
    "\u00fc\u00f6\u00e4\u2019\u2018\u201c\u201d\u2026\u2013\u2014"
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

test('shuffles every bank question without repeats and keeps correct answer keys', () => {
  const bank = sampleBank()
  const game = newGame(bank, fixedRandom)
  expect(game.rounds).toHaveLength(bank.length)
  expect(new Set(game.rounds.map(round => round.question)).size).toBe(bank.length)
  expect(game.rounds.map(round => round.question).join('|') ===
    bank.map(question => question.question).join('|')).toBe(false)
  expect(game.rounds.every(round => round.answers[round.correctIndex] !== undefined)).toBe(true)
  expect(game.rounds.every(round => new Set(round.answers).size === 4)).toBe(true)
  expect(new Set(game.rounds.map(round => round.difficulty)).size).toBe(3)
  expect(game.phase).toBe('idle')
  expect(game.streak).toBe(0)
  expect(newGame(sampleBank(3), fixedRandom).rounds).toHaveLength(3)
})

test('scores a streak, ends on a wrong answer, clears the bank and ignores other phases', () => {
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
  game = reveal(game)
  expect(game.phase).toBe('correct')
  expect(game.streak).toBe(1)
  game = next(game)
  expect(game.phase).toBe('asking')
  expect(game.currentIndex).toBe(1)
  expect(game.streak).toBe(1)

  game = startGame(bank)
  for (let question = 0; question < 4; question++) {
    const answer = game.rounds[game.currentIndex]!.correctIndex
    game = reveal(pick(game, answer))
    game = next(game)
  }
  expect(game.streak).toBe(4)

  const fifthRound = game.rounds[game.currentIndex]!
  const wrongChoice = fifthRound.correctIndex === 0 ? 1 : 0
  game = reveal(pick(game, wrongChoice))
  expect(game.phase).toBe('wrong')
  expect(game.streak).toBe(4)
  expect(next(game)).toBe(game)
  expect(reveal(game)).toBe(game)
  const restarted = startOrRestart(game, bank, fixedRandom)
  expect(restarted?.phase).toBe('asking')
  expect(restarted?.currentIndex).toBe(0)
  expect(restarted?.streak).toBe(0)

  let finalGame = startGame(sampleBank(1))
  const finalAnswer = finalGame.rounds[0]!.correctIndex
  finalGame = reveal(pick(finalGame, finalAnswer))
  expect(finalGame.phase).toBe('cleared')
  expect(finalGame.streak).toBe(1)
  expect(startOrRestart(finalGame, sampleBank(1), fixedRandom)?.phase).toBe('asking')
})

test('keeps the newest ten history entries and treats invalid history as empty', () => {
  let history: TriviaHistory = emptyHistory()
  for (let streak = 0; streak < 12; streak++) {
    history = addGame(history, streak, 1_000 + streak)
  }

  expect(history.best).toBe(11)
  expect(history.games).toHaveLength(10)
  expect(history.games.map(game => game.streak)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  expect(history.games[0]!.at).toBe(1_011)
  expect(parseHistory(history)).toEqual(history)
  expect(parseHistory(undefined)).toEqual(emptyHistory())
  expect(parseHistory({ best: 2, games: [{ streak: 3, at: 10 }] })).toEqual(emptyHistory())
  expect(parseHistory({ best: 0, games: [{ streak: -1, at: 10 }] })).toEqual(emptyHistory())
})

test('loads, saves and displays streak history in the mounted band', async ($, on) => {
  const startingHistory: TriviaHistory = {
    best: 0,
    games: Array.from({ length: 10 }, (_, index) => ({ streak: 0, at: 100 - index })),
  }
  mock.store(on, { history: startingHistory })
  mock.clock(on, { now: 5_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })

  const bank = sampleBank()
  const bankSource = JSON.stringify({
    response_code: 0,
    results: bank.map(question => ({
      type: 'multiple',
      difficulty: question.difficulty,
      category: question.category,
      question: question.question,
      correct_answer: question.correctAnswer,
      incorrect_answers: question.incorrectAnswers,
    })),
  })
  on('fs.read', (_, e) => {
    expect(e.path.endsWith('questions.json')).toBe(true)
    return { value: bankSource }
  })

  await $.session.start({ cwd: '/work/trivia', surface: 'terminal', isInteractive: true })
  expect(parseQuestionBank(bankSource)).toHaveLength(bank.length)

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

  const geometry = layout(60)
  const client = await ui.find({ key: 'stage' })
  expect(client?.props.width).toBe(60)
  expect(client?.props.height).toBe(12)
  const initialProps = triviaProps(client)
  expect(initialProps.best).toBe(0)
  expect(initialProps.recent).toEqual(Array.from({ length: 10 }, () => 0))
  expect(initialProps.game?.phase).toBe('idle')
  expect(initialProps.game?.roundCount).toBe(bank.length)

  const idleGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expectGridWidth(idleGrid, 60)
  const idleCard = geometry.outro
  expect(idleGrid[idleCard.titleY]!.join('')).toContain('✦ TRIVIA ✦')
  expect(idleGrid[idleCard.missedY]!.join('')).toContain(`${bank.length} questions in the pool`)
  expect(idleGrid[idleCard.newButton.y + 1]!.join('')).toContain('Start')
  expect(idleGrid[idleCard.historyY]!.join('')).toContain('Best 0 · Last games')
  // The title, the button and the history all center on the same column.
  const centerOf = (row: string[], text: string) => {
    const line = row.join('')
    return line.indexOf(text) + text.length / 2
  }
  const buttonCenter = idleCard.newButton.x + idleCard.newButton.width / 2
  expect(Math.abs(centerOf(idleGrid[idleCard.titleY]!, '✦ TRIVIA ✦') - buttonCenter) <= 1).toBe(true)

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
  const blockPixel = /[\u2580\u2584\u2588]/
  expect(blockPixel.test(clawdFrame(firstFrame))).toBe(true)
  expectGridWidth(firstFrame, 60)
  await ui.advance(210)
  const secondFrame = canvasOf(await ui.drawn({ in: 'stage' }))
  expect(clawdFrame(secondFrame) !== clawdFrame(firstFrame)).toBe(true)
  await ui.advance(1_390)

  const askingGame = triviaProps(await ui.find({ key: 'stage' })).game!
  const correctBox = geometry.answerBoxes[askingGame.round!.correctIndex]!
  await ui.pointer({
    type: 'down',
    x: correctBox.x + 2,
    y: correctBox.y + 1,
    button: 'left',
    in: 'stage',
  })
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('locked')
  await ui.advance(2_000)
  let currentGame = triviaProps(await ui.find({ key: 'stage' })).game!
  expect(currentGame.phase).toBe('correct')
  expect(currentGame.streak).toBe(1)

  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'stage' })
  await ui.advance(1_600)
  currentGame = triviaProps(await ui.find({ key: 'stage' })).game!
  expect(currentGame.currentIndex).toBe(1)
  const wrongChoice = currentGame.round!.correctIndex === 0 ? 1 : 0
  const wrongBox = geometry.answerBoxes[wrongChoice]!
  await ui.pointer({
    type: 'down',
    x: wrongBox.x + 2,
    y: wrongBox.y + 1,
    button: 'left',
    in: 'stage',
  })
  await ui.advance(2_000)
  currentGame = triviaProps(await ui.find({ key: 'stage' })).game!
  expect(currentGame.phase).toBe('wrong')
  expect(currentGame.streak).toBe(1)

  const terminalProps = triviaProps(await ui.find({ key: 'stage' }))
  expect(terminalProps.best).toBe(1)
  expect(terminalProps.recent).toEqual([1, ...Array.from({ length: 9 }, () => 0)])
  expect(terminalProps.newBest).toBe(true)
  const wrongGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expectGridWidth(wrongGrid, 60)
  const correctAnswer = currentGame.round!
  const answerLabel = String.fromCharCode(65 + correctAnswer.correctIndex)
  expect(wrongGrid[4]!.join('')).not.toContain('Best')
  expect(wrongGrid[11]!.join('')).toContain(
    `Wrong — answer: ${answerLabel}: ${correctAnswer.answers[correctAnswer.correctIndex]}`,
  )
  expect(wrongGrid[11]!.join('')).not.toContain('New game')

  await ui.advance(3_000)
  const outroGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expectGridWidth(outroGrid, 60)
  expect(outroGrid[1]!.join('')).toContain('GAME OVER')
  expect(outroGrid[2]!.join('')).toContain('Final streak 1')
  expect(outroGrid[2]!.join('')).toContain('new best!')
  expect(outroGrid[3]!.join('')).toContain('Missed:')
  expect(outroGrid[3]!.join('')).toContain('→')
  expect(outroGrid[5]!.join('')).toContain('╭')
  expect(outroGrid[6]!.join('')).toContain('New game')
  expect(outroGrid[7]!.join('')).toContain('╰')
  const chart = layout(60).outro.chart
  const plotX = chart.x + Math.floor((chart.width - 29) / 2)
  expect(outroGrid[9]!.join('').match(/[▁▂▃▄▅▆▇█]/g)).toHaveLength(20)
  const chartNumbers = Array.from({ length: 10 }, (_, index) =>
    outroGrid[10]![plotX + index * 3],
  )
  expect(chartNumbers).toEqual([...Array.from({ length: 9 }, () => '0'), '1'])

  const newButton = layout(60).outro.newButton
  await ui.pointer({
    type: 'down',
    x: newButton.x + Math.floor(newButton.width / 2),
    y: newButton.y + 1,
    button: 'left',
    in: 'stage',
  })
  const restarted = triviaProps(await ui.find({ key: 'stage' }))
  expect(restarted.game?.phase).toBe('asking')
  expect(restarted.game?.currentIndex).toBe(0)
  expect(restarted.game?.streak).toBe(0)
  expect(restarted.best).toBe(1)
  await ui.unmount()

  await $.session.start({ cwd: '/work/reloaded', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'trivia',
    args: 'on',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 60 },
  })
  ui = await mount()
  const reloaded = triviaProps(await ui.find({ key: 'stage' }))
  expect(reloaded.best).toBe(1)
  expect(reloaded.recent).toEqual([1, ...Array.from({ length: 9 }, () => 0)])

  await ui.advance(1_600)
  const retryGame = triviaProps(await ui.find({ key: 'stage' })).game!
  const retryRound = retryGame.round!
  const retryWrong = retryRound.correctIndex === 0 ? 1 : 0
  const retryBox = layout(60).answerBoxes[retryWrong]!
  await ui.pointer({
    type: 'down',
    x: retryBox.x + 2,
    y: retryBox.y + 1,
    button: 'left',
    in: 'stage',
  })
  await ui.advance(2_000)
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('wrong')
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'stage' })
  expect(canvasOf(await ui.drawn({ in: 'stage' }))[1]!.join('')).toContain('GAME OVER')
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('wrong')
  const retryButton = layout(60).outro.newButton
  await ui.pointer({
    type: 'down',
    x: retryButton.x + Math.floor(retryButton.width / 2),
    y: retryButton.y + 1,
    button: 'left',
    in: 'stage',
  })
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('asking')
  await ui.unmount()

  ui = await mount(59)
  const narrowGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expectGridWidth(narrowGrid, 59)
  expect(blockPixel.test(narrowGrid.flat().join(''))).toBe(false)
  await ui.unmount()
})

test('shows the cleared outro in a 45-column band and starts a fresh game', async ($, on) => {
  mock.store(on, { history: emptyHistory() })
  mock.clock(on, { now: 8_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })

  const bank = sampleBank(1)
  const bankSource = JSON.stringify({
    response_code: 0,
    results: bank.map(question => ({
      type: 'multiple',
      difficulty: question.difficulty,
      category: question.category,
      question: question.question,
      correct_answer: question.correctAnswer,
      incorrect_answers: question.incorrectAnswers,
    })),
  })
  on('fs.read', () => ({ value: bankSource }))
  await $.session.start({ cwd: '/work/trivia-clear', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'trivia',
    args: 'on',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 45 },
  })

  const bandProps = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 45,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  } as const
  const ui = await $.ui.mount({
    plugin: 'trivia',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: bandProps,
  })
  const geometry = layout(45)
  const startButton = geometry.startButton!
  await ui.pointer({
    type: 'down',
    x: startButton.x + Math.floor(startButton.width / 2),
    y: startButton.y,
    button: 'left',
    in: 'stage',
  })
  await ui.advance(1_600)

  const game = triviaProps(await ui.find({ key: 'stage' })).game!
  const correctBox = geometry.answerBoxes[game.round!.correctIndex]!
  await ui.pointer({
    type: 'down',
    x: correctBox.x + 2,
    y: correctBox.y + 1,
    button: 'left',
    in: 'stage',
  })
  await ui.advance(2_000)
  expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('cleared')

  const revealGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expectGridWidth(revealGrid, 45)
  expect(revealGrid[11]!.join('')).toContain('You answered all 1 questions!')
  expect(revealGrid[11]!.join('')).not.toContain('New game')
  expect(revealGrid[1]!.join('')).not.toContain('ALL CLEARED!')

  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'stage' })
  const outroGrid = canvasOf(await ui.drawn({ in: 'stage' }))
  expectGridWidth(outroGrid, 45)
  expect(outroGrid[1]!.join('')).toContain('ALL CLEARED!')
  expect(outroGrid[2]!.join('')).toContain('Final streak 1')
  expect(outroGrid[8]!.join('')).toContain('Best 1')
  expect(outroGrid[8]!.join('')).toContain('Last games')
  expect(outroGrid[9]!.join('').match(/[▁▂▃▄▅▆▇█]/g)).toHaveLength(2)
  expect(outroGrid[10]!.join('')).toContain('1')
  const leftSpriteArea = outroGrid
    .slice(1, 5)
    .map(row => row.slice(0, 16).join(''))
    .join('')
  expect(/[▀▄█]/.test(leftSpriteArea)).toBe(false)

  const newButton = geometry.outro.newButton
  await ui.pointer({
    type: 'down',
    x: newButton.x + Math.floor(newButton.width / 2),
    y: newButton.y + 1,
    button: 'left',
    in: 'stage',
  })
  const restarted = triviaProps(await ui.find({ key: 'stage' })).game
  expect(restarted?.phase).toBe('asking')
  expect(restarted?.streak).toBe(0)
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

const expectGridWidth = (grid: string[][], width: number) => {
  expect(grid).toHaveLength(12)
  expect(grid.every(row => row.length === width)).toBe(true)
}

test('hands the Client only the current round, however large the bank is', () => {
  const bank: TriviaQuestion[] = Array.from({ length: 5_000 }, (_, index) => ({
    difficulty: 'easy',
    category: 'Bulk',
    question: `Bulk question number ${index} with some padding to look like a real one?`,
    correctAnswer: `Right answer ${index}`,
    incorrectAnswers: [`Wrong A ${index}`, `Wrong B ${index}`, `Wrong C ${index}`],
  }))
  const game = newGame(bank, fixedRandom)
  const visible = stageGame(game)

  expect(visible?.roundCount).toBe(5_000)
  expect(visible?.round?.question).toBe(game.rounds[0]!.question)
  expect(JSON.stringify(visible).length < 2_000).toBe(true)
})
