import type { ClientElements, ClientModule, RenderElement } from 'claude-code'

import type { TriviaMessage, TriviaPhase, TriviaProps, TriviaView } from '../types'

const TICK_MS = 70
const LOCK_TICKS = 26
const OUTRO_DELAY_TICKS = 36

const AMBER = '#d6ad55'
const BRIGHT_AMBER = '#ffe08a'
const SOFT_WHITE = '#eee8d9'
const LOCKED_ONE = '#c7771b'
const LOCKED_TWO = '#e3a32d'
const GREEN = '#28783d'
const RED = '#a93636'

type Choice = 0 | 1 | 2 | 3

type DesktopStageState = {
  tick: number
  questionKey: string
  phaseKey: TriviaPhase
  view: TriviaView
  phaseStartedAt: number
  questionCharacters: number
  questionLength: number
  answersShown: number
  answerDelayTicks: number
  revealSent: boolean
}

type AnimationStep = {
  state: DesktopStageState
  reveal: boolean
}

type PanelLine = {
  text: string
  color: string
  bold?: boolean
}

type PanelModel = {
  title: string
  lines: PanelLine[]
  action: 'start' | 'new' | null
  actionLabel: string | null
  history: number[]
  footer: string
}

const phaseOf = (props: TriviaProps): TriviaPhase => props.game?.phase ?? 'idle'
const questionKeyOf = (props: TriviaProps): string => props.game?.roundId ?? ''
const questionLengthOf = (props: TriviaProps): number =>
  Array.from(props.game?.round?.question ?? '').length

const initialState = (props: TriviaProps): DesktopStageState => ({
  tick: 0,
  questionKey: questionKeyOf(props),
  phaseKey: phaseOf(props),
  view: 'reveal',
  phaseStartedAt: 0,
  questionCharacters: 0,
  questionLength: questionLengthOf(props),
  answersShown: 0,
  answerDelayTicks: 0,
  revealSent: false,
})

const syncState = (state: DesktopStageState, props: TriviaProps): DesktopStageState => {
  const questionKey = questionKeyOf(props)
  const phaseKey = phaseOf(props)
  const questionChanged = questionKey !== state.questionKey
  const startedAsking = phaseKey === 'asking' && state.phaseKey !== 'asking'
  if (!questionChanged && phaseKey === state.phaseKey) return state

  return {
    ...state,
    questionKey,
    phaseKey,
    view: 'reveal',
    phaseStartedAt: state.tick,
    questionCharacters: questionChanged || startedAsking ? 0 : state.questionCharacters,
    questionLength: questionLengthOf(props),
    answersShown: questionChanged || startedAsking ? 0 : state.answersShown,
    answerDelayTicks: questionChanged || startedAsking ? 0 : state.answerDelayTicks,
    revealSent: false,
  }
}

const advanceAnswers = (
  state: DesktopStageState,
): Pick<DesktopStageState, 'answersShown' | 'answerDelayTicks'> => {
  if (state.answersShown >= 4) return state
  const answerDelayTicks = state.answerDelayTicks + 1
  return answerDelayTicks >= 3
    ? { answersShown: state.answersShown + 1, answerDelayTicks: 0 }
    : { answersShown: state.answersShown, answerDelayTicks }
}

const advanceAnimation = (state: DesktopStageState): AnimationStep | null => {
  const tick = state.tick + 1

  if (state.phaseKey === 'asking') {
    if (state.questionCharacters < state.questionLength) {
      return {
        state: {
          ...state,
          tick,
          questionCharacters: Math.min(state.questionLength, state.questionCharacters + 3),
        },
        reveal: false,
      }
    }
    if (state.answersShown >= 4) return null
    return { state: { ...state, tick, ...advanceAnswers(state) }, reveal: false }
  }

  if (state.phaseKey === 'locked') {
    if (state.revealSent && state.answersShown >= 4) return null
    const shouldReveal = tick - state.phaseStartedAt >= LOCK_TICKS && !state.revealSent
    return {
      state: {
        ...state,
        ...advanceAnswers(state),
        tick,
        revealSent: state.revealSent || shouldReveal,
      },
      reveal: shouldReveal,
    }
  }

  if (state.phaseKey === 'wrong' || state.phaseKey === 'cleared') {
    if (state.view === 'reveal') {
      const openOutro = tick - state.phaseStartedAt >= OUTRO_DELAY_TICKS
      return {
        state: { ...state, tick, view: openOutro ? 'outro' : 'reveal' },
        reveal: false,
      }
    }
  }

  return null
}

const panelHistory = (
  elements: ClientElements,
  props: TriviaProps,
  streaks: number[],
): RenderElement => {
  const recent = streaks.slice(0, 10).reverse()
  const maxStreak = Math.max(0, ...recent)
  const { Box, Text } = elements
  const bars = recent.map((streak, index) => {
    const isLatest = index === recent.length - 1
    const height = maxStreak === 0 ? 0 : Math.round((streak / maxStreak) * 5)
    const color = streak === 0 && !isLatest
      ? '#77736a'
      : isLatest ? BRIGHT_AMBER : AMBER

    return Box({
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 1,
      children: [
        Box({ width: 2, height, backgroundColor: color }),
        Text({ color: isLatest ? BRIGHT_AMBER : SOFT_WHITE, children: String(streak) }),
      ],
    })
  })

  return Box({
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    children: [
      Text({ color: AMBER, bold: true, children: `Best ${props.best} · Last games` }),
      Box({ flexDirection: 'row', alignItems: 'flex-end', gap: 1, children: bars }),
    ],
  })
}

const renderPanel = (
  elements: ClientElements,
  props: TriviaProps,
  model: PanelModel,
  onAction: () => void,
): RenderElement => {
  const { Box, Button, Text } = elements
  const children: RenderElement[] = [
    Box({
      flexDirection: 'column',
      alignItems: 'center',
      gap: 1,
      children: [
        Text({ color: AMBER, bold: true, children: model.title }),
        ...model.lines.map(line => Text({
          color: line.color,
          ...(line.bold ? { bold: true } : {}),
          children: line.text,
        })),
      ],
    }),
  ]

  if (model.action && model.actionLabel) {
    children.push(Box({
      flexDirection: 'row',
      justifyContent: 'center',
      children: [Button({
        key: model.action === 'start' ? 'start' : 'new-game',
        label: model.actionLabel,
        variant: 'primary',
        onPress: onAction,
      })],
    }))
  }

  if (model.history.length > 0) children.push(panelHistory(elements, props, model.history))
  if (model.footer) {
    children.push(Text({ color: '#8f8a80', children: model.footer }))
  }

  return Box({ flexDirection: 'column', alignItems: 'stretch', gap: 1, children })
}

const introPanel = (props: TriviaProps): PanelModel => {
  const count = props.game?.roundCount ?? 0
  const problem = props.error
    ? `Error: ${props.error}`
    : count === 0 ? 'No valid questions are available.' : null

  return {
    title: 'TRIVIA',
    lines: [
      { text: 'Answer until you miss', color: SOFT_WHITE, bold: true },
      problem
        ? { text: problem, color: '#e49a91' }
        : { text: `${count} questions in the pool`, color: '#b9b2a2' },
    ],
    action: problem ? null : 'start',
    actionLabel: problem ? null : 'Start',
    history: props.recent,
    footer: problem ? '' : 'Click Start to play',
  }
}

const outroPanel = (props: TriviaProps): PanelModel | null => {
  const game = props.game
  if (!game) return null
  const lines: PanelLine[] = [{
    text: `Final streak ${game.streak}${props.newBest ? ' · new best!' : ''}`,
    color: SOFT_WHITE,
    bold: true,
  }]

  if (game.phase === 'wrong' && game.round) {
    lines.push({
      text: `Missed: ${game.round.question} -> ${game.round.answers[game.round.correctIndex]}`,
      color: '#b9b2a2',
    })
  }

  return {
    title: game.phase === 'cleared' ? 'ALL CLEARED!' : 'GAME OVER',
    lines,
    action: 'new',
    actionLabel: 'New game',
    history: props.recent.length > 0 ? props.recent : [game.streak],
    footer: 'Click New game to play again',
  }
}

const cardColorFor = (
  props: TriviaProps,
  choice: Choice,
  state: DesktopStageState,
): string | undefined => {
  const game = props.game
  const round = game?.round
  if (!game || !round) return undefined
  if ((game.phase === 'correct' || game.phase === 'wrong') && choice === round.correctIndex) {
    return GREEN
  }
  if (game.phase === 'wrong' && choice === game.selectedAnswer) return RED
  if (game.phase === 'locked' && choice === game.selectedAnswer) {
    return Math.floor((state.tick - state.phaseStartedAt) / 3) % 2 === 0
      ? LOCKED_ONE
      : LOCKED_TWO
  }
  return undefined
}

const answerRows = (
  elements: ClientElements,
  props: TriviaProps,
  state: DesktopStageState,
  onPick: (choice: Choice) => void,
): RenderElement[] => {
  const game = props.game
  const round = game?.round
  if (!game || !round) return []
  const { Box, Button } = elements
  const rows: RenderElement[] = []

  for (const firstChoice of [0, 2] as const) {
    if (state.answersShown <= firstChoice) continue
    const cells: RenderElement[] = []
    for (const choiceValue of [firstChoice, firstChoice + 1] as const) {
      if (choiceValue >= 4) continue
      if (choiceValue >= state.answersShown) {
        cells.push(Box({ flexGrow: 1, minWidth: 0 }))
        continue
      }

      const choice = choiceValue as Choice
      const answer = round.answers[choice] ?? ''
      const backgroundColor = cardColorFor(props, choice, state)
      cells.push(Box({
        flexGrow: 1,
        minWidth: 0,
        padding: 1,
        ...(backgroundColor ? { backgroundColor } : {}),
        children: [Button({
          key: `answer-${choice}`,
          label: `${String.fromCharCode(65 + choice)}. ${answer}`,
          onPress: () => onPick(choice),
        })],
      }))
    }
    rows.push(Box({ flexDirection: 'row', alignItems: 'stretch', gap: 1, children: cells }))
  }

  return rows
}

const renderStage = (
  props: TriviaProps,
  state: DesktopStageState,
  elements: ClientElements,
  post: (message: TriviaMessage) => void,
  showOutro: () => void,
): RenderElement => {
  const { Box, Button, Text } = elements
  const game = props.game
  const phase = phaseOf(props)

  if (!game || phase === 'idle') {
    return renderPanel(elements, props, introPanel(props), () => {
      if (props.game?.round) post({ type: 'new' })
    })
  }

  if ((phase === 'wrong' || phase === 'cleared') && state.view === 'outro') {
    const panel = outroPanel(props)
    if (panel) {
      return renderPanel(elements, props, panel, () => {
        const current = phaseOf(props)
        if (current === 'wrong' || current === 'cleared') post({ type: 'new' })
      })
    }
  }

  const round = game.round
  const question = round?.question ?? ''
  const visibleQuestion = phase === 'wrong' || phase === 'cleared'
    ? question
    : Array.from(question).slice(0, state.questionCharacters).join('')
  const children: RenderElement[] = [
    Text({
      color: AMBER,
      bold: true,
      children: round
        ? `${round.category} · ${round.difficulty} · Streak ${game.streak}`
        : `Streak ${game.streak}`,
    }),
    Text({ color: SOFT_WHITE, bold: true, children: visibleQuestion }),
    ...answerRows(elements, props, state, choice => {
      const current = state.phaseKey
      if (current === 'asking' && choice < state.answersShown) {
        post({ type: 'pick', choice })
      }
    }),
  ]

  if (phase === 'asking') {
    children.push(Text({ color: '#b9b2a2', children: 'Choose an answer' }))
  } else if (phase === 'locked') {
    const flash = Math.floor((state.tick - state.phaseStartedAt) / 3) % 2 === 0
    children.push(Text({
      color: flash ? LOCKED_ONE : LOCKED_TWO,
      bold: true,
      children: 'Final answer...',
    }))
  } else if (phase === 'correct') {
    children.push(Text({ color: '#75d18a', bold: true, children: `Correct! Streak ${game.streak}` }))
    children.push(Box({
      flexDirection: 'row',
      justifyContent: 'center',
      children: [Button({
        key: 'next',
        label: 'Next',
        variant: 'primary',
        onPress: () => post({ type: 'next' }),
      })],
    }))
  } else if (phase === 'wrong') {
    if (round) {
      children.push(Text({
        color: RED,
        children: `Correct answer: ${round.answers[round.correctIndex]}`,
      }))
    }
    children.push(Box({
      flexDirection: 'row',
      justifyContent: 'center',
      children: [Button({ key: 'continue', label: 'Continue', onPress: showOutro })],
    }))
  } else if (phase === 'cleared') {
    children.push(Text({ color: SOFT_WHITE, children: `You answered all ${game.roundCount} questions!` }))
    children.push(Box({
      flexDirection: 'row',
      justifyContent: 'center',
      children: [Button({ key: 'continue', label: 'Continue', onPress: showOutro })],
    }))
  }

  return Box({ flexDirection: 'column', gap: 1, flexGrow: 1, children })
}

const DesktopStage: ClientModule<TriviaProps, DesktopStageState> = (props, surface) => {
  let state = surface.state

  if (!state) {
    state = initialState(props)
    surface.every(TICK_MS, () => {
      const current = surface.state
      if (!current) return
      const step = advanceAnimation(current)
      if (!step) return
      surface.setState(step.state)
      if (step.reveal) surface.post({ type: 'reveal' })
    })
    surface.setState(state)
  } else {
    const synced = syncState(state, props)
    if (synced !== state) {
      surface.setState(synced)
      state = synced
    }
  }

  const displayedState = state ?? initialState(props)
  const showOutro = () => {
    const current = surface.state ?? displayedState
    if (
      (current.phaseKey === 'wrong' || current.phaseKey === 'cleared') &&
      current.view === 'reveal'
    ) {
      surface.setState({ ...current, view: 'outro' })
    }
  }
  const post = (message: TriviaMessage) => surface.post(message)

  surface.onPointer(event => {
    if (event.type === 'down') showOutro()
  })

  return renderStage(props, displayedState, surface.elements, post, showOutro)
}

export default DesktopStage
