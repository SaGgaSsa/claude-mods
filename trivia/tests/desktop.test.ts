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
    expect(client?.props.props).toMatchObject({ maxRows: 11 })
    expect(sourceOf(idleSvg).length < 131_072).toBe(true)
    expect(sourceOf(idleSvg).includes('background-color:transparent')).toBe(true)
    expect(idleSvg?.props.alt).toBe('Clawd waves hello before the trivia game starts.')
    expect(sourceOf(idleSvg).includes('#d97757')).toBe(true)
    expect(idleSvg?.props.isInteractive).toBeUndefined()

    await ui.press({ key: 'start' })
    expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('asking')
    expect(await ui.find({ type: 'Text', text: /^$/, in: 'stage' })).toBeUndefined()
    const askingSvg = await ui.find({ type: 'Svg' })
    expect(sourceOf(askingSvg)).not.toBe(sourceOf(idleSvg))
    expect(sourceOf(askingSvg).length < 131_072).toBe(true)
    expect(sourceOf(askingSvg).includes('<animateTransform')).toBe(true)
    expect(askingSvg?.props.isInteractive).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Choose an answer/, in: 'stage' })).toBeDefined()

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
    expect(await ui.find({ type: 'Text', text: /Choose an answer/, in: 'stage' })).toBeDefined()
    expect(await ui.find({
      type: 'Text',
      text: /^Test questions · easy · Streak 0 · Choose an answer$/,
      in: 'stage',
    })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Choose an answer$/, in: 'stage' })).toBeUndefined()
    for (const choice of [0, 1, 2, 3]) {
      const card = await ui.find({ key: `answer-card-${choice}`, in: 'stage' })
      const button = await ui.find({ key: `answer-${choice}`, in: 'stage' })
      expect(card?.props.width).toBe('50%')
      expect(card?.props.backgroundColor).toBe('#302a20')
      expect(card?.props.borderStyle).toBe('round')
      expect(button?.props.variant).toBe('secondary')
      expect(button?.props.dimColor).toBe(false)
    }

    const firstRound = triviaProps(await ui.find({ key: 'stage' })).game!.round!
    const firstRoundId = triviaProps(await ui.find({ key: 'stage' })).game!.roundId
    await ui.press({ key: `answer-${firstRound.correctIndex}` })
    expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('locked')
    expect((await ui.find({ key: `answer-card-${firstRound.correctIndex}`, in: 'stage' }))
      ?.props.backgroundColor).toBe('#c7771b')
    await ui.advance(3 * 70)
    expect((await ui.find({ key: `answer-card-${firstRound.correctIndex}`, in: 'stage' }))
      ?.props.backgroundColor).toBe('#e3a32d')
    const lockedSvg = await ui.find({ type: 'Svg' })
    expect(sourceOf(lockedSvg)).not.toBe(sourceOf(askingSvg))
    expect(sourceOf(lockedSvg).length < 131_072).toBe(true)
    await ui.advance(23 * 70)
    const correctGame = triviaProps(await ui.find({ key: 'stage' })).game!
    expect(correctGame.phase).toBe('correct')
    expect(correctGame.streak).toBe(1)
    expect((await ui.find({
      key: `answer-card-${firstRound.correctIndex}`,
      in: 'stage',
    }))?.props.backgroundColor).toBe('#28783d')
    const correctSvg = await ui.find({ type: 'Svg' })
    expect(correctSvg?.props.alt).toBe('Clawd jumps with both arms raised after a correct answer.')
    expect(sourceOf(correctSvg).length < 131_072).toBe(true)
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
    expect((await ui.find({ key: `answer-card-${wrongRound.correctIndex}`, in: 'stage' }))
      ?.props.backgroundColor).toBe('#28783d')
    expect((await ui.find({ key: `answer-card-${wrongChoice}`, in: 'stage' }))
      ?.props.backgroundColor).toBe('#a93636')
    const wrongSvg = await ui.find({ type: 'Svg' })
    expect(wrongSvg?.props.alt)
      .toBe('Clawd lowers both arms and closes its eyes after a wrong answer.')
    expect(sourceOf(wrongSvg).length < 131_072).toBe(true)

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
    expect(sourceOf(clearedSvg).length < 131_072).toBe(true)

    await ui.advance(36 * 70)
    expect(await ui.find({ type: 'Text', text: /ALL CLEARED!/, in: 'stage' })).toBeDefined()
    expect(await ui.find({ key: 'new-game', in: 'stage' })).toBeDefined()
  } finally {
    await ui.unmount()
  }
})

test('Desktop card corners pick answers while the gap and locked state do nothing', async ($, on) => {
  mock.store(on, { history: { best: 0, games: [] }, seen: [] })
  mock.clock(on, { now: 7_000 })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: 'Engine output' })
  })
  on('fs.read', () => ({ value: bankSource }))

  await $.session.start({
    cwd: '/work/trivia-desktop-pointer',
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
    await ui.resize({ columns: 50, rows: 12, in: 'stage' })
    await ui.press({ key: 'start' })
    await ui.advance(3_000)
    expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('asking')

    await ui.pointer({ type: 'down', x: 25, y: 3, button: 'left', in: 'stage' })
    const afterGap = triviaProps(await ui.find({ key: 'stage' })).game!
    expect(afterGap.phase).toBe('asking')
    await ui.pointer({ type: 'down', x: 0, y: 5, button: 'left', in: 'stage' })
    expect(triviaProps(await ui.find({ key: 'stage' })).game!.phase).toBe('asking')
    expect(afterGap.selectedAnswer).toBeNull()

    const corners = [
      { choice: 0, x: 0, y: 3 },
      { choice: 1, x: 49, y: 4 },
      { choice: 2, x: 0, y: 6 },
      { choice: 3, x: 49, y: 7 },
    ] as const

    for (const corner of corners) {
      await ui.pointer({
        type: 'down',
        x: corner.x,
        y: corner.y,
        button: 'left',
        in: 'stage',
      })
      let game = triviaProps(await ui.find({ key: 'stage' })).game!
      expect(game.phase).toBe('locked')
      expect(game.selectedAnswer).toBe(corner.choice)

      await ui.pointer({
        type: 'down',
        x: corner.x === 0 ? 49 : 0,
        y: corner.choice < 2 ? 8 : 3,
        button: 'left',
        in: 'stage',
      })
      game = triviaProps(await ui.find({ key: 'stage' })).game!
      expect(game.phase).toBe('locked')
      expect(game.selectedAnswer).toBe(corner.choice)

      await ui.advance(26 * 70)
      game = triviaProps(await ui.find({ key: 'stage' })).game!
      if (game.phase === 'correct') {
        await ui.press({ key: 'next' })
      } else {
        expect(game.phase === 'wrong' || game.phase === 'cleared').toBe(true)
        await ui.advance(36 * 70)
        await ui.press({ key: 'new-game' })
      }
      await ui.advance(3_000)
      expect(triviaProps(await ui.find({ key: 'stage' })).game?.phase).toBe('asking')
    }
  } finally {
    await ui.unmount()
  }
})
