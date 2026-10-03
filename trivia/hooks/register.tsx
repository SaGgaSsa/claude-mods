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
import type { GameSelection } from './trivia'
import { clawdSvgForPhase } from './clawd-svg'
import {
  addGame,
  beginGame,
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
  layout,
} from './trivia'

const STAGE = 'stage'
const DESKTOP_CLAWD_COLUMNS = 8
const DESKTOP_CLAWD_ROWS = 3
const isShown = atom({ plugin: 'trivia', key: 'isShown' } as const, false)
const gameState = atom({ plugin: 'trivia', key: 'game' } as const, null)

let questionBank: TriviaQuestion[] = []
let bankError: string | null = null
let history: TriviaHistory = emptyHistory()
let seenQuestions: string[] = []
let latestResultIsBest = false
let terminalResultRecorded = false

export const stageGame = (
  game: TriviaGame | null,
  roundCount: number,
): StageGame | null => {
  if (!game) return null
  return {
    round: game.round,
    roundId: game.roundId,
    streak: game.streak,
    phase: game.phase,
    selectedAnswer: game.selectedAnswer,
    roundCount,
  }
}

const stageProps = (game: TriviaGame | null, width: number, maxRows?: number): TriviaProps => ({
  game: stageGame(game, questionBank.length),
  error: bankError,
  width,
  ...(maxRows === undefined ? {} : { maxRows }),
  best: history.best,
  recent: history.games.map(entry => entry.streak),
  newBest: Boolean(
    latestResultIsBest && game && (game.phase === 'wrong' || game.phase === 'cleared'),
  ),
})

const sameSeen = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

const applyMessage = (
  game: TriviaGame | null,
  message: TriviaMessage,
  seen: readonly string[],
): { game: TriviaGame | null; seen: string[] } => {
  if (!game) {
    if (message.type !== 'new') return { game: null, seen: [...seen] }
    const fresh = newGame(questionBank, Math.random, seen)
    return {
      game: beginGame(fresh.game),
      seen: fresh.seen,
    }
  }

  switch (message.type) {
    case 'pick':
      return { game: pick(game, message.choice), seen: [...seen] }
    case 'reveal':
      return { game: reveal(game, questionBank), seen: [...seen] }
    case 'next': {
      const selected = next(game, questionBank, Math.random, seen)
      return { game: selected.game, seen: selected.seen }
    }
    case 'new':
      if (game.phase === 'idle') {
        return {
          game: beginGame(game),
          seen: [...seen],
        }
      }
      if (game.phase !== 'wrong' && game.phase !== 'cleared') {
        return { game, seen: [...seen] }
      }
      return startFreshGame(seen)
  }
}

const startFreshGame = (seen: readonly string[]): { game: TriviaGame; seen: string[] } => {
  const fresh: GameSelection = newGame(questionBank, Math.random, seen)
  return {
    game: beginGame(fresh.game),
    seen: fresh.seen,
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
      latestResultIsBest = false
      terminalResultRecorded = false
      const fresh = newGame(questionBank, Math.random, seenQuestions)
      if (!sameSeen(fresh.seen, seenQuestions)) {
        seenQuestions = fresh.seen
        await $.store.set('seen', seenQuestions)
      }
      await update($, gameState, () => fresh.game)
    }

    return { text: shown ? 'Trivia band shown.' : 'Trivia band hidden.' }
  })

  on('ui.message', { element: STAGE }, async ($, e) => {
    if (!isTriviaMessage(e.data)) return {}
    const current = await read($, gameState)
    const result = applyMessage(current, e.data, seenQuestions)
    const updated = result.game
    if (updated === current && sameSeen(result.seen, seenQuestions)) return {}

    if (current?.phase === 'locked' && e.data.type === 'reveal' && updated) {
      const answered = current.round
      if (answered) {
        result.seen = markSeen(questionBank, result.seen, answered.question)
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

    if (!sameSeen(result.seen, seenQuestions)) {
      seenQuestions = result.seen
      await $.store.set('seen', seenQuestions)
    }
    await update($, gameState, () => updated)
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, nextEvent) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return nextEvent(e)

    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // The terminal and the desktop app draw a Client; VS Code and mobile don't yet.
    const Client = 'Client' in elements ? elements.Client : undefined
    if (!Client) return <Text>Trivia runs in the terminal and the desktop app.</Text>

    const bodyColumns = e.props.bodyColumns
    const geometry = layout(Math.max(1, Math.min(bodyColumns, 96)))
    const current = await read($, gameState)

    if (e.surface === 'desktop' && 'Svg' in elements) {
      const Svg = elements.Svg
      const sprite = clawdSvgForPhase(current?.phase ?? 'idle')
      const desktopRows = Math.max(1, Math.min(e.props.maxRows, e.props.scroll.bodyRows) - 1)
      return (
        <Box width="100%" position="relative" flexDirection="column" flexShrink={0}>
          <Client
            key={STAGE}
            module="./stage-desktop.tsx"
            props={stageProps(current, geometry.width, desktopRows)}
            width="100%"
          />
          <Box key="clawd-overlay" position="absolute" left={0} top={0}
            width={DESKTOP_CLAWD_COLUMNS}
            height={DESKTOP_CLAWD_ROWS}
            flexDirection="column" justifyContent="center" alignItems="center">
            <Svg source={sprite.source} alt={sprite.alt} width={48} height={27} />
          </Box>
        </Box>
      )
    }

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
