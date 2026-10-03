import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type {
  TriviaGame,
  TriviaHistory,
  TriviaMessage,
  TriviaQuestion,
  TriviaProps,
  StageGame,
} from '../types'
import {
  addGame,
  currentRound,
  emptyHistory,
  isTriviaMessage,
  markSeen,
  newGame,
  next,
  parseHistory,
  parseQuestionBank,
  parseSeen,
  pick,
  reveal,
  seenForNewGame,
  startOrRestart,
  layout,
} from './trivia'

const STAGE = 'stage'
const isShown = atom({ plugin: 'trivia', key: 'isShown' } as const, false)
const gameState = atom({ plugin: 'trivia', key: 'game' } as const, null)

let questionBank: TriviaQuestion[] = []
let bankError: string | null = null
let history: TriviaHistory = emptyHistory()
let seenQuestions: string[] = []
let latestResultIsBest = false
let terminalResultRecorded = false

export const stageGame = (game: TriviaGame | null): StageGame | null => {
  if (!game) return null
  const { rounds, ...rest } = game
  return { ...rest, round: rounds[game.currentIndex] ?? null, roundCount: rounds.length }
}

const stageProps = (game: TriviaGame | null, width: number): TriviaProps => ({
  game: stageGame(game),
  error: bankError,
  width,
  best: history.best,
  recent: history.games.map(entry => entry.streak),
  newBest: Boolean(
    latestResultIsBest && game && (game.phase === 'wrong' || game.phase === 'cleared'),
  ),
})

const sameSeen = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

const prepareSeenForGame = (): boolean => {
  const prepared = seenForNewGame(questionBank, seenQuestions)
  if (sameSeen(prepared, seenQuestions)) return false
  seenQuestions = prepared
  return true
}

const applyMessage = (
  game: TriviaGame | null,
  message: TriviaMessage,
  seen: readonly string[],
): TriviaGame | null => {
  if (!game) return message.type === 'new'
    ? startOrRestart(null, questionBank, Math.random, seen)
    : null

  switch (message.type) {
    case 'pick':
      return pick(game, message.choice)
    case 'reveal':
      return reveal(game)
    case 'next':
      return next(game)
    case 'new':
      return startOrRestart(game, questionBank, Math.random, seen)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, nextEvent) => {
    await $.command.register({
      name: 'trivia',
      description: 'Play a multiple-choice streak game in the prompt band',
      argumentHint: '[on|off]',
      immediate: true,
    })

    try {
      const source = await $.fs.read(`${$.plugin.root}/questions.json`)
      questionBank = parseQuestionBank(source)
      bankError = questionBank.length > 0
        ? null
        : 'The question bank has no valid multiple-choice questions.'
    } catch (error) {
      questionBank = []
      bankError = error instanceof Error ? error.message : String(error)
    }

    try {
      history = parseHistory(await $.store.get('history'))
    } catch {
      history = emptyHistory()
    }
    try {
      seenQuestions = parseSeen(await $.store.get('seen'))
    } catch {
      seenQuestions = []
    }
    latestResultIsBest = false
    terminalResultRecorded = false

    return nextEvent(e)
  })

  on('command.run', { command: 'trivia' }, async ($, e) => {
    const argument = e.args.trim().toLowerCase()
    const currentlyShown = await read($, isShown)
    const shown = argument === 'on'
      ? true
      : argument === 'off'
        ? false
        : !currentlyShown

    await update($, isShown, () => shown)
    if (shown && !(await read($, gameState))) {
      if (prepareSeenForGame()) await $.store.set('seen', seenQuestions)
      latestResultIsBest = false
      terminalResultRecorded = false
      await update($, gameState, () => newGame(questionBank, Math.random, seenQuestions))
    }

    return { text: shown ? 'Trivia band shown.' : 'Trivia band hidden.' }
  })

  on('ui.message', { element: STAGE }, async ($, e) => {
    if (!isTriviaMessage(e.data)) return {}
    const current = await read($, gameState)
    const canStartGame = e.data.type === 'new' && (
      !current || current.phase === 'idle' || current.phase === 'wrong' ||
      current.phase === 'cleared'
    )
    if (canStartGame && prepareSeenForGame()) await $.store.set('seen', seenQuestions)

    const updated = applyMessage(current, e.data, seenQuestions)
    if (updated === current) return {}

    if (current?.phase === 'locked' && e.data.type === 'reveal' && updated) {
      const answered = currentRound(current)
      if (answered) {
        seenQuestions = markSeen(questionBank, seenQuestions, answered.question)
        await $.store.set('seen', seenQuestions)
      }
    }

    if (
      updated &&
      current &&
      (updated.phase === 'wrong' || updated.phase === 'cleared') &&
      current.phase !== 'wrong' &&
      current.phase !== 'cleared' &&
      !terminalResultRecorded
    ) {
      terminalResultRecorded = true
      const wasBest = updated.streak > history.best
      const timestamp = await $.clock.now()
      history = addGame(history, updated.streak, timestamp)
      latestResultIsBest = wasBest
      await $.store.set('history', history)
    } else if (e.data.type === 'new' && updated?.phase === 'asking') {
      latestResultIsBest = false
      terminalResultRecorded = false
    }

    await update($, gameState, () => updated)
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, nextEvent) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return nextEvent(e)

    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    if (e.surface !== 'terminal') return <Text>Trivia runs in the terminal.</Text>

    const Client = 'Client' in elements ? elements.Client : undefined
    if (!Client) return nextEvent(e)

    const bodyColumns = e.props.bodyColumns
    const geometry = layout(Math.max(1, Math.min(bodyColumns, 96)))
    const current = await read($, gameState)

    return (
      <Box width={bodyColumns} flexDirection="row" justifyContent="center" flexShrink={0}>
        <Client
          key={STAGE}
          module="./stage.tsx"
          props={stageProps(current, geometry.width)}
          width={geometry.width}
          height={geometry.height}
        />
      </Box>
    )
  })
}
