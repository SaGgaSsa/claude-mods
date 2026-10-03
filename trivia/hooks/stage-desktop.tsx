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
const CARD = '#302a20'
const CARD_HOVER = '#45391f'

const HEADER_ROWS = 1
const QUESTION_ROWS = 2
const ANSWER_CARD_ROWS = 2
const ANSWER_ROW_MARGIN = 1
const ANSWER_ROW_COUNT = 2
const ANSWER_GAP = 1
const ANSWER_CARD_WIDTH = '50%' as const

type Choice = 0 | 1 | 2 | 3

type AnswerGeometry = {
  headerRows: number
  questionRows: number
  answerTop: number
  answerRows: number
  cardRows: number
  rowMargin: number
  cardWidth: typeof ANSWER_CARD_WIDTH
  gap: number
  leftEnd: number
  rightStart: number
}

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
}

const phaseOf = (props: TriviaProps): TriviaPhase => props.game?.phase ?? 'idle'
const questionKeyOf = (props: TriviaProps): string => props.game?.roundId ?? ''
const questionLengthOf = (props: TriviaProps): number =>
  Array.from(props.game?.round?.question ?? '').length

const answerGeometryFor = (columns: number): AnswerGeometry => {
  const leftWidth = Math.ceil((columns - ANSWER_GAP) / 2)
  return {
    headerRows: HEADER_ROWS,
    questionRows: QUESTION_ROWS,
    answerTop: HEADER_ROWS + QUESTION_ROWS,
    answerRows: ANSWER_ROW_COUNT,
    cardRows: ANSWER_CARD_ROWS,
    rowMargin: ANSWER_ROW_MARGIN,
    cardWidth: ANSWER_CARD_WIDTH,
    gap: ANSWER_GAP,
    leftEnd: leftWidth,
    rightStart: leftWidth + ANSWER_GAP,
  }
}

const answerAt = (x: number, y: number, columns: number): Choice | null => {
  if (x < 0 || x >= columns) return null
  const geometry = answerGeometryFor(columns)
  const relativeY = y - geometry.answerTop
  if (relativeY < 0) return null

  // Each row of cards is followed by its margin, which picks nothing.
  const pitch = geometry.cardRows + geometry.rowMargin
  const row = Math.floor(relativeY / pitch)
  if (row >= geometry.answerRows || relativeY % pitch >= geometry.cardRows) return null

  if (x < geometry.leftEnd) return (row * 2) as Choice
  if (x >= geometry.rightStart) return (row * 2 + 1) as Choice
  return null
}

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
  const maxBarHeight = Math.max(1, Math.min(2, Math.floor((props.maxRows ?? 10) - 6)))
  const { Box, Text } = elements

  if (recent.length === 0) {
    return Box({
      flexDirection: 'column',
      alignItems: 'center',
      children: [
        Text({ color: AMBER, bold: true, children: `Best ${props.best} · Last games` }),
        Text({ color: '#8f8a80', children: 'No games yet' }),
      ],
    })
  }

  const bars = recent.map((streak, index) => {
    const isLatest = index === recent.length - 1
    const height = maxStreak === 0
      ? 1
      : Math.max(1, Math.round((streak / maxStreak) * maxBarHeight))
    const color = streak === 0 && !isLatest
      ? '#77736a'
      : isLatest ? BRIGHT_AMBER : AMBER

    return Box({
      width: 2,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      children: [
        Box({ width: 2, height, backgroundColor: color }),
        Text({ color: isLatest ? BRIGHT_AMBER : SOFT_WHITE, children: String(streak) }),
      ],
    })
  })

  return Box({
    flexDirection: 'column',
    alignItems: 'center',
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
      children: [
        Text({ color: AMBER, bold: true, wrap: 'truncate', children: model.title }),
        ...model.lines.map(line => Text({
          color: line.color,
          wrap: 'truncate',
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
        dimColor: false,
        onPress: onAction,
      })],
    }))
  }

  children.push(panelHistory(elements, props, model.history))
  return Box({ flexDirection: 'column', alignItems: 'stretch', children })
}

const introPanel = (props: TriviaProps): PanelModel => {
  const count = props.game?.roundCount ?? 0
  const problem = props.error
    ? `Error: ${props.error}`
    : count === 0 ? 'No valid questions are available.' : null

  return {
    title: 'TRIVIA',
    lines: [problem
      ? { text: problem, color: '#e49a91' }
      : { text: `Answer until you miss · ${count} questions`, color: SOFT_WHITE, bold: true }],
    action: problem ? null : 'start',
    actionLabel: problem ? null : 'Start',
    history: props.recent,
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
      text: `Missed: ${game.round.question} → ${game.round.answers[game.round.correctIndex]}`,
      color: '#b9b2a2',
    })
  }

  return {
    title: game.phase === 'cleared' ? 'ALL CLEARED!' : 'GAME OVER',
    lines,
    action: 'new',
    actionLabel: 'New game',
    history: props.recent.length > 0 ? props.recent : [game.streak],
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
  columns: number,
  onPick: (choice: Choice) => void,
): RenderElement[] => {
  const game = props.game
  const round = game?.round
  if (!game || !round) return []

  const { Box, Button } = elements
  const geometry = answerGeometryFor(columns)
  const rows: RenderElement[] = []

  for (const firstChoice of [0, 2] as const) {
    if (state.answersShown <= firstChoice) continue
    const cells: RenderElement[] = []

    for (const choiceValue of [firstChoice, firstChoice + 1] as const) {
      if (choiceValue >= 4) continue
      if (choiceValue >= state.answersShown) {
        cells.push(Box({
          width: geometry.cardWidth,
          height: geometry.cardRows,
          minWidth: 0,
        }))
        continue
      }

      const choice = choiceValue as Choice
      const answer = round.answers[choice] ?? ''
      const stateColor = cardColorFor(props, choice, state)
      cells.push(Box({
        key: `answer-card-${choice}`,
        // A fixed half, not flexGrow: the cards would size to their labels.
        width: geometry.cardWidth,
        height: geometry.cardRows,
        minWidth: 0,
        borderStyle: 'round',
        borderColor: stateColor ?? AMBER,
        backgroundColor: stateColor ?? CARD,
        ...(!stateColor ? {
          hover: { backgroundColor: CARD_HOVER, borderColor: BRIGHT_AMBER },
        } : {}),
        children: [Button({
          key: `answer-${choice}`,
          label: `${String.fromCharCode(65 + choice)}. ${answer}`,
          variant: 'secondary',
          dimColor: false,
          hover: { color: SOFT_WHITE, bold: true },
          onPress: () => onPick(choice),
        })],
      }))
    }

    rows.push(Box({
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: geometry.gap,
      marginBottom: geometry.rowMargin,
      children: cells,
    }))
  }

  return rows
}

const renderStage = (
  props: TriviaProps,
  state: DesktopStageState,
  elements: ClientElements,
  post: (message: TriviaMessage) => void,
  showOutro: () => void,
  columns: number,
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
  const status = phase === 'asking'
    ? 'Choose an answer'
    : phase === 'locked'
      ? 'Final answer...'
      : phase === 'correct'
        ? 'Correct!'
        : phase === 'wrong'
          ? 'Wrong'
          : 'Cleared!'
  const headerColor = phase === 'wrong'
    ? RED
    : phase === 'correct' || phase === 'cleared'
      ? '#75d18a'
      : phase === 'locked'
        ? Math.floor((state.tick - state.phaseStartedAt) / 3) % 2 === 0
          ? LOCKED_ONE
          : LOCKED_TWO
        : AMBER
  const heading = round
    ? `${round.category} · ${round.difficulty} · Streak ${game.streak} · ${status}`
    : `Streak ${game.streak} · ${status}`
  const geometry = answerGeometryFor(columns)
  const children: RenderElement[] = [
    Box({
      flexDirection: 'column',
      height: geometry.headerRows,
      overflow: 'hidden',
      children: [Text({
        color: headerColor,
        bold: true,
        wrap: 'truncate',
        children: heading,
      })],
    }),
    Box({
      flexDirection: 'column',
      height: geometry.questionRows,
      overflow: 'hidden',
      children: visibleQuestion.length > 0 ? [Text({
        color: SOFT_WHITE,
        bold: true,
        wrap: 'wrap',
        children: visibleQuestion,
      })] : [],
    }),
  ]

  children.push(...answerRows(elements, props, state, columns, choice => {
    if (state.phaseKey === 'asking' && choice < state.answersShown) {
      post({ type: 'pick', choice })
    }
  }))

  // One row under the cards: what happened on the left, the way on at the right.
  const actionRow = (note: RenderElement | null, button: RenderElement) => Box({
    flexDirection: 'row',
    justifyContent: note ? 'space-between' : 'flex-end',
    alignItems: 'center',
    paddingX: 1,
    children: note ? [note, button] : [button],
  })
  const continueButton = Button({
    key: 'continue',
    label: 'Continue',
    variant: 'primary',
    dimColor: false,
    onPress: showOutro,
  })

  if (phase === 'correct') {
    children.push(actionRow(null, Button({
      key: 'next',
      label: 'Next',
      variant: 'primary',
      dimColor: false,
      onPress: () => post({ type: 'next' }),
    })))
  } else if (phase === 'wrong') {
    const note = round ? Text({
      color: RED,
      wrap: 'truncate',
      children: `Correct answer: ${round.answers[round.correctIndex]}`,
    }) : null
    children.push(actionRow(note, continueButton))
  } else if (phase === 'cleared') {
    children.push(actionRow(null, continueButton))
  }

  return Box({ flexDirection: 'column', gap: 0, flexGrow: 1, children })
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
    if (event.type !== 'down') return
    showOutro()

    if (event.button !== undefined && event.button !== 'left') return
    const current = surface.state ?? displayedState
    if (phaseOf(props) !== 'asking' || current.phaseKey !== 'asking') return

    const choice = answerAt(event.x, event.y, surface.columns)
    if (choice !== null && choice < current.answersShown) {
      post({ type: 'pick', choice })
    }
  })

  return renderStage(props, displayedState, surface.elements, post, showOutro, surface.columns)
}

export default DesktopStage
