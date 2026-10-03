import type { ClientModule } from 'claude-code'

import type { TriviaLayout, TriviaPhase, TriviaProps, TriviaRect } from '../types'
import {
  currentRound,
  formatMoney,
  layout,
  safeWinnings,
  wrapText,
} from './trivia'
import { createCanvas, fillRect, toElement, writeCentered, writeText } from './canvas'

const TICK_MS = 70
const LOCK_TICKS = 26
const CORRECT_FLASH_TICKS = 12

const AMBER = '#d6ad55'
const BRIGHT_AMBER = '#ffe08a'
const SOFT_WHITE = '#eee8d9'
const DARK_TEXT = '#17130c'
const LOCKED_ONE = '#c7771b'
const LOCKED_TWO = '#e3a32d'
const GREEN = '#28783d'
const RED = '#a93636'

type StageState = {
  tick: number
  questionKey: number
  phaseKey: TriviaPhase
  phaseStartedAt: number
  questionCharacters: number
  questionLength: number
  answersShown: number
  answerDelayTicks: number
  hoverChoice: number | null
  revealSent: boolean
}

type AnimationStep = {
  state: StageState
  reveal: boolean
}

const phaseOf = (props: TriviaProps): TriviaPhase => props.game?.phase ?? 'idle'
const questionIndexOf = (props: TriviaProps): number => props.game?.currentIndex ?? -1
const questionLengthOf = (props: TriviaProps): number => {
  const round = props.game ? currentRound(props.game) : null
  return round ? Array.from(round.question).length : 0
}

const initialState = (props: TriviaProps): StageState => ({
  tick: 0,
  questionKey: questionIndexOf(props),
  phaseKey: phaseOf(props),
  phaseStartedAt: 0,
  questionCharacters: 0,
  questionLength: questionLengthOf(props),
  answersShown: 0,
  answerDelayTicks: 0,
  hoverChoice: null,
  revealSent: false,
})

const syncState = (state: StageState, props: TriviaProps): StageState => {
  const questionKey = questionIndexOf(props)
  const phaseKey = phaseOf(props)
  const questionChanged = questionKey !== state.questionKey
  const startedAsking = phaseKey === 'asking' && state.phaseKey !== 'asking'
  if (!questionChanged && phaseKey === state.phaseKey) return state

  return {
    ...state,
    questionKey,
    phaseKey,
    phaseStartedAt: state.tick,
    questionCharacters: questionChanged || startedAsking ? 0 : state.questionCharacters,
    questionLength: questionLengthOf(props),
    answersShown: questionChanged || startedAsking ? 0 : state.answersShown,
    answerDelayTicks: questionChanged || startedAsking ? 0 : state.answerDelayTicks,
    hoverChoice: null,
    revealSent: false,
  }
}

const advanceAnswers = (state: StageState): Pick<StageState, 'answersShown' | 'answerDelayTicks'> => {
  if (state.answersShown >= 4) return state
  const answerDelayTicks = state.answerDelayTicks + 1
  return answerDelayTicks >= 3
    ? { answersShown: state.answersShown + 1, answerDelayTicks: 0 }
    : { answersShown: state.answersShown, answerDelayTicks }
}

const advanceAnimation = (state: StageState): AnimationStep | null => {
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
    const answerAnimation = advanceAnswers(state)
    const shouldReveal = tick - state.phaseStartedAt >= LOCK_TICKS && !state.revealSent
    return {
      state: {
        ...state,
        ...answerAnimation,
        tick,
        revealSent: state.revealSent || shouldReveal,
      },
      reveal: shouldReveal,
    }
  }

  if (state.phaseKey === 'correct' && tick - state.phaseStartedAt < CORRECT_FLASH_TICKS) {
    return { state: { ...state, tick }, reveal: false }
  }

  if (state.phaseKey === 'won') return { state: { ...state, tick }, reveal: false }
  return null
}

const truncate = (value: string, width: number): string => {
  const characters = Array.from(value)
  if (characters.length <= width) return value
  if (width <= 0) return ''
  return `${characters.slice(0, Math.max(0, width - 1)).join('')}…`
}

const placeButton = (
  canvas: ReturnType<typeof createCanvas>,
  rect: TriviaRect | null,
  label: string,
) => {
  if (!rect) return
  writeCentered(canvas, truncate(label, rect.width), rect.x, rect.y, rect.width, {
    color: AMBER,
    bold: true,
  })
}

const drawHeader = (
  canvas: ReturnType<typeof createCanvas>,
  props: TriviaProps,
  gamePhase: TriviaPhase,
  gameRoundCount: number,
  currentNumber: number,
  dueAmount: number,
  safeAmount: number,
  geometry: TriviaLayout,
) => {
  const text = props.game && gamePhase !== 'idle'
    ? `TRIVIA  Q ${currentNumber}/${gameRoundCount} · for ${formatMoney(dueAmount)} · safe ${formatMoney(safeAmount)}`
    : 'TRIVIA LADDER'
  const available = geometry.walkButton ? Math.max(0, geometry.walkButton.x - 1) : geometry.width
  writeText(canvas, truncate(text, available), 0, geometry.headerY, {
    color: SOFT_WHITE,
    bold: true,
  })
  if (gamePhase === 'asking') placeButton(canvas, geometry.walkButton, '[ Walk away ]')
}

const answerAppearance = (
  phase: TriviaPhase,
  choice: number,
  selectedAnswer: number | null,
  correctIndex: number,
  hoverChoice: number | null,
  correctFlashOn: boolean,
  lockedFlashOn: boolean,
) => {
  let backgroundColor: string | undefined
  let color: string | undefined
  let borderColor = AMBER

  if (phase === 'locked' && choice === selectedAnswer) {
    backgroundColor = lockedFlashOn ? LOCKED_ONE : LOCKED_TWO
    color = DARK_TEXT
  } else if (phase === 'correct' && choice === correctIndex && correctFlashOn) {
    backgroundColor = GREEN
    color = '#ffffff'
  } else if (phase === 'wrong') {
    if (choice === correctIndex) {
      backgroundColor = GREEN
      color = '#ffffff'
    } else if (choice === selectedAnswer) {
      backgroundColor = RED
      color = '#ffffff'
    }
  } else if (phase === 'won' && choice === correctIndex) {
    backgroundColor = GREEN
    color = '#ffffff'
  }

  if (phase === 'asking' && choice === hoverChoice) borderColor = BRIGHT_AMBER
  return { backgroundColor, color, borderColor }
}

const drawAnswer = (
  canvas: ReturnType<typeof createCanvas>,
  rect: TriviaRect,
  answer: string,
  choice: 0 | 1 | 2 | 3,
  appearance: ReturnType<typeof answerAppearance>,
) => {
  const style = appearance.backgroundColor
    ? { color: appearance.color, backgroundColor: appearance.backgroundColor }
    : {}
  if (appearance.backgroundColor) fillRect(canvas, rect.x, rect.y, rect.width, rect.height, style)

  const borderStyle = {
    color: appearance.borderColor,
    ...(appearance.backgroundColor ? { backgroundColor: appearance.backgroundColor } : {}),
  }
  const label = String.fromCharCode(65 + choice)
  const top = `╭${'─'.repeat(rect.width - 2)}╮`
  const bottom = `╰${'─'.repeat(rect.width - 2)}╯`
  writeText(canvas, top, rect.x, rect.y, borderStyle)
  writeText(canvas, '│', rect.x, rect.y + 1, borderStyle)
  writeText(canvas, '│', rect.x + rect.width - 1, rect.y + 1, borderStyle)
  writeText(canvas, bottom, rect.x, rect.y + 2, borderStyle)

  const contentWidth = rect.width - 2
  const answerWidth = Math.max(0, contentWidth - 3)
  const labelStyle = {
    color: appearance.color ?? AMBER,
    ...(appearance.backgroundColor ? { backgroundColor: appearance.backgroundColor } : {}),
  }
  const answerStyle = {
    ...(appearance.color ? { color: appearance.color } : {}),
    ...(appearance.backgroundColor ? { backgroundColor: appearance.backgroundColor } : {}),
  }
  writeText(canvas, `${label}: `, rect.x + 1, rect.y + 1, labelStyle)
  writeText(canvas, truncate(answer, answerWidth), rect.x + 4, rect.y + 1, answerStyle)
}

const drawStatus = (
  canvas: ReturnType<typeof createCanvas>,
  props: TriviaProps,
  geometry: ReturnType<typeof layout>,
) => {
  const game = props.game
  const round = game ? currentRound(game) : null
  if (!game || game.phase === 'idle') {
    if (props.error) {
      writeText(canvas, truncate(`Error: ${props.error}`, geometry.width), 0, geometry.statusY, {
        color: '#e49a91',
      })
    } else if (!round) {
      writeText(canvas, truncate('No valid questions are available.', geometry.width), 0, geometry.statusY, {
        color: '#e49a91',
      })
    } else {
      placeButton(canvas, geometry.startButton, '[ Start ]')
    }
    return
  }

  const phase = game.phase
  if (phase === 'asking') {
    writeText(canvas, 'Click an answer', 0, geometry.statusY, { color: SOFT_WHITE })
    return
  }
  if (phase === 'locked') {
    writeText(canvas, 'Final answer…', 0, geometry.statusY, { color: AMBER, bold: true })
    return
  }
  if (phase === 'correct') {
    writeText(canvas, 'Correct!', 0, geometry.statusY, { color: '#75d18a', bold: true })
    placeButton(canvas, geometry.nextButton, '[ Next question ]')
    return
  }

  const button = phase === 'wrong' || phase === 'won' || phase === 'walked'
    ? geometry.newButton
    : null
  const available = button ? Math.max(0, button.x - 1) : geometry.width
  let status = ''
  if (phase === 'wrong' && round) {
    const letter = String.fromCharCode(65 + round.correctIndex)
    status = `Wrong — answer: ${letter}: ${round.answers[round.correctIndex]} · ` +
      `take home ${formatMoney(game.takeHome)}`
  } else if (phase === 'won') {
    status = `You won ${formatMoney(game.takeHome)}!`
  } else if (phase === 'walked') {
    status = `You walked away with ${formatMoney(game.takeHome)}`
  }
  writeText(canvas, truncate(status, available), 0, geometry.statusY, {
    color: phase === 'wrong' ? '#efa19a' : SOFT_WHITE,
  })
  placeButton(canvas, button, '[ New game ]')
}

const drawSparks = (
  canvas: ReturnType<typeof createCanvas>,
  tick: number,
  geometry: TriviaLayout,
) => {
  const sparks = ['✦', '*', '·', '+']
  for (let y = geometry.questionY; y < geometry.statusY; y++) {
    for (let x = 0; x < canvas.columns; x++) {
      const cell = canvas.cells[y]?.[x]
      if (!cell || cell.character !== ' ') continue
      const seed = (x * 17 + y * 31 + tick * 13) % 43
      if (seed < 2) {
        writeText(canvas, sparks[(x + y + tick) % sparks.length]!, x, y, {
          color: AMBER,
          bold: seed === 0,
        })
      }
    }
  }
}

const drawStage = (props: TriviaProps, state: StageState) => {
  const geometry = layout(props.width)
  const canvas = createCanvas(geometry.width, geometry.height)
  const game = props.game
  const phase = phaseOf(props)
  const round = game ? currentRound(game) : null
  const currentNumber = game ? game.currentIndex + 1 : 1
  const dueAmount = game?.prizes[game.currentIndex] ?? 0
  const safeAmount = game ? safeWinnings(game) : 0

  drawHeader(
    canvas,
    props,
    phase,
    game?.rounds.length ?? 0,
    currentNumber,
    dueAmount,
    safeAmount,
    geometry,
  )

  if (geometry.narrow) {
    writeCentered(
      canvas,
      truncate('Terminal too narrow (need 40 cols)', geometry.width),
      0,
      geometry.narrowNoticeY,
      geometry.width,
      { color: '#e4c67c', bold: true },
    )
    drawStatus(canvas, props, geometry)
    return canvas
  }

  if (!game || phase === 'idle') {
    writeCentered(canvas, '✦ TRIVIA LADDER ✦', 0, geometry.titleY, geometry.width, {
      color: AMBER,
      bold: true,
    })
    drawStatus(canvas, props, geometry)
    return canvas
  }

  if (round) {
    const question = Array.from(round.question).slice(0, state.questionCharacters).join('')
    const lines = wrapText(question, geometry.width - 4, geometry.questionLines)
    lines.forEach((line, index) => {
      writeCentered(canvas, line, 0, geometry.questionY + index, geometry.width, {
        color: SOFT_WHITE,
        bold: true,
      })
    })

    const correctFlashOn = phase !== 'correct' ||
      state.tick - state.phaseStartedAt >= CORRECT_FLASH_TICKS ||
      Math.floor((state.tick - state.phaseStartedAt) / 2) % 2 === 0
    const lockedFlashOn = Math.floor((state.tick - state.phaseStartedAt) / 3) % 2 === 0

    for (let choice = 0; choice < Math.min(state.answersShown, 4); choice++) {
      const rect = geometry.answerBoxes[choice]
      const answer = round.answers[choice]
      if (!rect || !answer) continue
      const appearance = answerAppearance(
        phase,
        choice,
        game.selectedAnswer,
        round.correctIndex,
        state.hoverChoice,
        correctFlashOn,
        lockedFlashOn,
      )
      drawAnswer(canvas, rect, answer, choice as 0 | 1 | 2 | 3, appearance)
    }
  }

  drawStatus(canvas, props, geometry)
  if (phase === 'won') drawSparks(canvas, state.tick, geometry)
  return canvas
}

const Stage: ClientModule<TriviaProps, StageState> = (props, surface) => {
  const geometry = layout(props.width)
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
  surface.onPointer(event => {
    const current = surface.state ?? displayedState
    const target = geometry.targetAt(event.x, event.y)

    if (event.type !== 'down') {
      const hovered = event.type === 'leave' || current.phaseKey !== 'asking'
        ? null
        : geometry.answerAt(event.x, event.y)
      const visibleHover = hovered !== null && hovered < current.answersShown ? hovered : null
      if (visibleHover !== current.hoverChoice) surface.setState({ ...current, hoverChoice: visibleHover })
      return
    }

    if (current.phaseKey === 'correct') {
      surface.post({ type: 'next' })
      return
    }
    if (current.phaseKey === 'asking' && target?.type === 'walk') {
      surface.post({ type: 'walk' })
      return
    }
    if (
      current.phaseKey === 'asking' &&
      target?.type === 'answer' &&
      target.choice < current.answersShown
    ) {
      surface.post({ type: 'pick', choice: target.choice })
      return
    }
    if (current.phaseKey === 'idle' && target?.type === 'start') {
      surface.post({ type: 'new' })
      return
    }
    if (
      (current.phaseKey === 'wrong' || current.phaseKey === 'won' || current.phaseKey === 'walked') &&
      target?.type === 'new'
    ) {
      surface.post({ type: 'new' })
    }
  })

  return toElement(surface.elements, drawStage(props, displayedState))
}

export default Stage
