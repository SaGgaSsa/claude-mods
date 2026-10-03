import { expect, mock, test } from 'claude-code/testing'
import type { FoundElement } from 'claude-code/testing'

import type { TriviaProps, TriviaQuestion } from '../types'

const sampleBank: TriviaQuestion[] = Array.from({ length: 3 }, (_, index) => ({
  difficulty: 'easy',
  category: 'Test questions',
  question: `Question ${index + 1}?`,
  correctAnswer: `Right ${index + 1}`,
  incorrectAnswers: [`Wrong ${index}-A`, `Wrong ${index}-B`, `Wrong ${index}-C`],
}))

const bankSourceFor = (bank: TriviaQuestion[]): string => JSON.stringify({
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
const bankSource = bankSourceFor(sampleBank)

const triviaProps = (element: FoundElement | undefined): TriviaProps => {
  const value = element?.props.props
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected Trivia Client props')
  }
  return value as TriviaProps
}

const sourceOf = (element: FoundElement | undefined): string => {
  const source = element?.props.source
  if (typeof source !== 'string') throw new Error('Expected Clawd SVG source')
  return source
}

test('mounts a desktop view and plays a full streak round with native buttons', async ($, on) => {
  mock.store(on, { history: { best: 0, games: [] }, seen: [] })
  mock.clock(on, { now: 5_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })
  on('fs.read', () => ({ value: bankSource }))

  await $.session.start({
    cwd: '/work/trivia-desktop',
    surface: 'terminal',
    isInteractive: true,
  })
  await $.command.run({
    command: 'trivia',
    args: 'on',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 60 },
  })

  const bandProps = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  } as const

  const terminalUi = await $.ui.mount({
    plugin: 'trivia',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: bandProps,
  })
  const terminalClient = await terminalUi.find({ key: 'stage' })
  expect(terminalClient?.props.module).toMatch(/stage\.tsx$/)
  expect(await terminalUi.find({ type: 'Svg' })).toBeUndefined()
  await terminalUi.unmount()

  const ui = await $.ui.mount({
    plugin: 'trivia',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: bandProps,
  })
  try {
    const client = await ui.find({ key: 'stage' })
    const idleSvg = await ui.find({ type: 'Svg' })
    expect(client?.props.module).toMatch(/stage-desktop\.tsx$/)
    expect(sourceOf(idleSvg).length < 131_072).toBe(true)
    expect(idleSvg?.props.alt).toBe('Clawd waves hello before the trivia game starts.')
    expect(sourceOf(idleSvg).includes('#d97757')).toBe(true)

    await ui.press({ key: 'start' })
    expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('asking')
    const askingSvg = await ui.find({ type: 'Svg' })
    expect(sourceOf(askingSvg)).not.toBe(sourceOf(idleSvg))
    expect(sourceOf(askingSvg).includes('<animateTransform')).toBe(true)
    expect(askingSvg?.props.isInteractive).toBe(true)

    await ui.advance(70)
    expect(await ui.find({ type: 'Text', text: /^Que$/, in: 'stage' })).toBeDefined()
    expect(await ui.find({ key: 'answer-0', in: 'stage' })).toBeUndefined()
    await ui.advance(5 * 70)
    expect(await ui.find({ key: 'answer-0', in: 'stage' })).toBeUndefined()
    await ui.advance(70)
    expect(await ui.find({ key: 'answer-0', in: 'stage' })).toBeDefined()
    await ui.advance(9 * 70)
    for (const key of ['answer-0', 'answer-1', 'answer-2', 'answer-3']) {
      expect(await ui.find({ key, in: 'stage' })).toBeDefined()
    }

    const firstRound = triviaProps(await ui.find({ key: 'stage' })).game!.round!
    const firstRoundId = triviaProps(await ui.find({ key: 'stage' })).game!.roundId
    await ui.press({ key: `answer-${firstRound.correctIndex}` })
    expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('locked')
    const lockedSvg = await ui.find({ type: 'Svg' })
    expect(sourceOf(lockedSvg)).not.toBe(sourceOf(askingSvg))
    await ui.advance(26 * 70)
    const correctGame = triviaProps(await ui.find({ key: 'stage' })).game!
    expect(correctGame.phase).toBe('correct')
    expect(correctGame.streak).toBe(1)
    const correctSvg = await ui.find({ type: 'Svg' })
    expect(correctSvg?.props.alt).toBe('Clawd jumps with both arms raised after a correct answer.')
    expect(sourceOf(correctSvg).includes('<animateTransform')).toBe(false)

    await ui.press({ key: 'next' })
    const nextGame = triviaProps(await ui.find({ key: 'stage' })).game!
    expect(nextGame.phase).toBe('asking')
    expect(nextGame.roundId).not.toBe(firstRoundId)
    await ui.advance(3_000)

    const wrongRound = triviaProps(await ui.find({ key: 'stage' })).game!.round!
    const wrongChoice = wrongRound.correctIndex === 0 ? 1 : 0
    await ui.press({ key: `answer-${wrongChoice}` })
    await ui.advance(26 * 70)
    const wrongGame = triviaProps(await ui.find({ key: 'stage' })).game!
    expect(wrongGame.phase).toBe('wrong')
    expect(wrongGame.streak).toBe(1)
    const wrongSvg = await ui.find({ type: 'Svg' })
    expect(wrongSvg?.props.alt)
      .toBe('Clawd lowers both arms and closes its eyes after a wrong answer.')

    await ui.advance(36 * 70)
    expect(await ui.find({ type: 'Text', text: /GAME OVER/, in: 'stage' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Best 1/, in: 'stage' })).toBeDefined()
    expect(await ui.find({ key: 'new-game', in: 'stage' })).toBeDefined()
    await ui.press({ key: 'new-game' })
    const restarted = triviaProps(await ui.find({ key: 'stage' })).game!
    expect(restarted.phase).toBe('asking')
    expect(restarted.roundId).not.toBe(wrongGame.roundId)

  } finally {
    await ui.unmount()
  }
})

test('cleared Desktop games show the outro after the matching delay', async ($, on) => {
  const singleQuestionBank = sampleBank.slice(0, 1)
  mock.store(on, { history: { best: 0, games: [] }, seen: [] })
  mock.clock(on, { now: 6_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })
  on('fs.read', () => ({ value: bankSourceFor(singleQuestionBank) }))

  await $.session.start({
    cwd: '/work/trivia-desktop-cleared',
    surface: 'desktop',
    isInteractive: true,
  })
  await $.command.run({
    command: 'trivia',
    args: 'on',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 60 },
  })

  const ui = await $.ui.mount({
    plugin: 'trivia',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns: 60,
      scroll: { offset: 0, bodyRows: 12 },
      view: {},
    },
  })
  try {
    await ui.press({ key: 'start' })
    await ui.advance(3_000)
    const round = triviaProps(await ui.find({ key: 'stage' })).game!.round!
    await ui.press({ key: `answer-${round.correctIndex}` })
    await ui.advance(26 * 70)
    expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('cleared')
    const clearedSvg = await ui.find({ type: 'Svg' })
    expect(clearedSvg?.props.alt)
      .toBe('Clawd jumps with both arms raised after clearing the trivia.')

    await ui.advance(36 * 70)
    expect(await ui.find({ type: 'Text', text: /ALL CLEARED!/, in: 'stage' })).toBeDefined()
    expect(await ui.find({ key: 'new-game', in: 'stage' })).toBeDefined()
  } finally {
    await ui.unmount()
  }
})
