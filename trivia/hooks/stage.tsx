import type { ClientModule } from 'claude-code'

import type { TriviaLayout, TriviaPhase, TriviaProps, TriviaRect, TriviaView } from '../types'
import type { ClawdLook } from './clawd'
import { drawClawd } from './clawd'
import {
  layout,
  wrapText,
} from './trivia'
import { createCanvas, fillRect, toElement, writeCentered, writeText } from './canvas'

const TICK_MS = 70
const LOCK_TICKS = 26
const CORRECT_FLASH_TICKS = 12
const QUIET_BLINK_TICKS = 43
const OUTRO_DELAY_TICKS = 36

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
  questionKey: string
  phaseKey: TriviaPhase
  view: TriviaView
  phaseStartedAt: number
  questionCharacters: number
  questionLength: number
  answersShown: number
  answerDelayTicks: number
  hoverChoice: number | null
  hoverNewButton: boolean
  revealSent: boolean
  blinkActive: boolean
  celebrate: boolean
}

type AnimationStep = {
  state: StageState
  reveal: boolean
}

const phaseOf = (props: TriviaProps): TriviaPhase => props.game?.phase ?? 'idle'
const questionKeyOf = (props: TriviaProps): string => props.game?.roundId ?? ''
const questionLengthOf = (props: TriviaProps): number => {
  const round = props.game?.round ?? null
  return round ? Array.from(round.question).length : 0
}

const initialState = (props: TriviaProps): StageState => ({
  tick: 0,
  questionKey: questionKeyOf(props),
  phaseKey: phaseOf(props),
  view: 'reveal',
  phaseStartedAt: 0,
  questionCharacters: 0,
  questionLength: questionLengthOf(props),
  answersShown: 0,
  answerDelayTicks: 0,
  hoverChoice: null,
  hoverNewButton: false,
  revealSent: false,
  blinkActive: false,
  celebrate: props.newBest || phaseOf(props) === 'cleared',
})

const syncState = (state: StageState, props: TriviaProps): StageState => {
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
    hoverChoice: null,
    hoverNewButton: false,
    revealSent: false,
    blinkActive: false,
    celebrate: props.newBest || phaseKey === 'cleared',
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

  if (state.phaseKey === 'wrong' || state.phaseKey === 'cleared') {
    if (state.view === 'reveal') {
      const openOutro = tick - state.phaseStartedAt >= OUTRO_DELAY_TICKS
      return {
        state: {
          ...state,
          tick,
          view: openOutro ? 'outro' : 'reveal',
          hoverNewButton: false,
        },
        reveal: false,
      }
    }
    if (state.phaseKey === 'cleared' || state.celebrate) {
      return { state: { ...state, tick }, reveal: false }
    }
  }
  return null
}

const truncate = (value: string, width: number): string => {
  const characters = Array.from(value)
  if (characters.length <= width) return value
  if (width <= 0) return ''
  return `${characters.slice(0, Math.max(0, width - 1)).join('')}…`
}

const clawdLookFor = (props: TriviaProps, state: StageState): ClawdLook => {
  const phase = phaseOf(props)
  if (phase === 'asking') {
    const speaking = state.questionCharacters < state.questionLength || state.answersShown < 4
    if (speaking) {
      const beat = Math.floor(state.tick / 3)
      return {
        arms: beat % 2 === 0 ? 'up' : 'out',
        eyes: 'open',
        jump: Math.floor(state.tick / 2) % 2 === 0,
        offset: 0,
        step: beat % 2 === 0,
      }
    }
  }

  if (phase === 'locked') {
    const tremble = Math.floor((state.tick - state.phaseStartedAt) / 3) % 2
    return {
      arms: 'down',
      eyes: 'looking',
      jump: false,
      offset: tremble === 0 ? 0 : 1,
      step: false,
    }
  }
  if (phase === 'correct' || phase === 'cleared') {
    const beat = Math.floor((state.tick - state.phaseStartedAt) / 3)
    return {
      arms: 'up',
      eyes: 'open',
      jump: (phase === 'cleared' || state.tick - state.phaseStartedAt < CORRECT_FLASH_TICKS) &&
        beat % 2 === 0,
      offset: 0,
      step: false,
    }
  }
  if (phase === 'wrong') {
    const celebrating = state.view === 'outro' && state.celebrate
    const beat = Math.floor((state.tick - state.phaseStartedAt) / 3)
    return {
      arms: celebrating ? 'up' : 'down',
      eyes: 'closed',
      jump: celebrating && beat % 2 === 0,
      offset: 0,
      step: false,
    }
  }

  return {
    arms: 'down',
    eyes: state.blinkActive ? 'closed' : 'open',
    jump: false,
    offset: 0,
    step: false,
  }
}

const isQuietBlinkPhase = (state: StageState): boolean =>
  state.phaseKey === 'idle' ||
  (state.phaseKey === 'asking' &&
    state.questionCharacters >= state.questionLength &&
    state.answersShown >= 4)

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
  geometry: TriviaLayout,
) => {
  const text = props.game && gamePhase !== 'idle'
    ? `TRIVIA  Streak ${props.game.streak} · Best ${props.best}`
    : 'TRIVIA'
  writeText(canvas, truncate(text, geometry.width), 0, geometry.headerY, {
    color: SOFT_WHITE,
    bold: true,
  })
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
  } else if (phase === 'cleared' && choice === correctIndex) {
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
  geometry: TriviaLayout,
) => {
  const game = props.game
  const round = game?.round ?? null
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
    writeText(canvas, `Correct! Streak ${game.streak}`, 0, geometry.statusY, {
      color: '#75d18a',
      bold: true,
    })
    placeButton(canvas, geometry.nextButton, '[ Next question ]')
    return
  }

  const status = phase === 'wrong' && round
    ? `Wrong — answer: ${String.fromCharCode(65 + round.correctIndex)}: ` +
      `${round.answers[round.correctIndex]}`
    : `You answered all ${game.roundCount} questions!`
  writeText(canvas, truncate(status, geometry.width), 0, geometry.statusY, {
    color: phase === 'wrong' ? '#efa19a' : SOFT_WHITE,
  })
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

const drawCardButton = (
  canvas: ReturnType<typeof createCanvas>,
  rect: TriviaRect,
  label: string,
  hovered: boolean,
) => {
  const color = hovered ? BRIGHT_AMBER : AMBER
  const style = { color, bold: true }
  const top = `\u256d${'\u2500'.repeat(Math.max(0, rect.width - 2))}\u256e`
  const bottom = `\u2570${'\u2500'.repeat(Math.max(0, rect.width - 2))}\u256f`
  writeText(canvas, top, rect.x, rect.y, style)
  writeText(canvas, '\u2502', rect.x, rect.y + 1, style)
  writeText(canvas, '\u2502', rect.x + rect.width - 1, rect.y + 1, style)
  writeText(canvas, bottom, rect.x, rect.y + rect.height - 1, style)
  writeCentered(canvas, label, rect.x + 1, rect.y + 1, rect.width - 2, style)
}

const drawCardHistory = (
  canvas: ReturnType<typeof createCanvas>,
  props: TriviaProps,
  streaks: number[],
  geometry: TriviaLayout,
) => {
  const chart = geometry.outro.chart
  const recent = streaks.slice(0, 10).reverse()
  const plotWidth = Math.max(0, recent.length * 3 - 1)
  const plotX = chart.x + Math.floor((chart.width - plotWidth) / 2)
  const bestLabel = `Best ${props.best}`
  const legend = ' · Last games'
  const headerWidth = Array.from(bestLabel + legend).length
  const headerX = chart.x + Math.floor((chart.width - headerWidth) / 2)

  writeText(canvas, bestLabel, headerX, geometry.outro.historyY, { color: AMBER, bold: true })
  writeText(canvas, legend, headerX + Array.from(bestLabel).length, geometry.outro.historyY, {
    color: SOFT_WHITE,
  })

  const maxStreak = Math.max(0, ...recent)
  const bars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'
  for (let index = 0; index < recent.length; index++) {
    const streak = recent[index] ?? 0
    const barLevel = maxStreak === 0 ? 0 : Math.round((streak / maxStreak) * 7)
    const bar = Array.from(bars)[barLevel] ?? '\u2581'
    const x = plotX + index * 3
    const isLatest = index === recent.length - 1
    const color = streak === 0 && !isLatest ? '#77736a' : isLatest ? BRIGHT_AMBER : AMBER
    writeText(canvas, bar.repeat(2), x, geometry.outro.barsY, { color, bold: true })
    writeCentered(canvas, String(streak), x, geometry.outro.numbersY, 2, {
      color: isLatest ? BRIGHT_AMBER : SOFT_WHITE,
    })
  }
}

type CardLine = { text: string; color: string; bold?: boolean; accent?: string }

type Card = {
  title: string
  lines: CardLine[]
  button: string | null
  streaks: number[]
  footer: string
}

// The intro and the final screen: a title and up to two lines centered on the button,
// the button itself, the history chart and a footer hint.
const drawCard = (
  canvas: ReturnType<typeof createCanvas>,
  props: TriviaProps,
  geometry: TriviaLayout,
  card: Card,
  hovered: boolean,
) => {
  // Each line centers on the button; one too wide for that slides right, never onto Clawd.
  const left = geometry.questionX
  const room = Math.max(1, geometry.width - left)
  const placeX = (length: number) =>
    Math.max(left, Math.min(geometry.width - length, Math.floor((geometry.width - length) / 2)))

  const title = truncate(card.title, room)
  writeText(canvas, title, placeX(Array.from(title).length), geometry.outro.titleY, {
    color: AMBER,
    bold: true,
  })

  const rows = [geometry.outro.streakY, geometry.outro.missedY]
  card.lines.slice(0, rows.length).forEach((line, index) => {
    const y = rows[index]!
    const accent = line.accent ?? ''
    const text = truncate(line.text, Math.max(0, room - Array.from(accent).length))
    const x = placeX(Array.from(text + accent).length)
    writeText(canvas, text, x, y, { color: line.color, bold: line.bold ?? false })
    if (accent) {
      writeText(canvas, accent, x + Array.from(text).length, y, { color: BRIGHT_AMBER, bold: true })
    }
  })

  if (card.button) drawCardButton(canvas, geometry.outro.newButton, card.button, hovered)
  if (card.streaks.length > 0) drawCardHistory(canvas, props, card.streaks, geometry)
  writeCentered(canvas, truncate(card.footer, geometry.width), 0, geometry.statusY, geometry.width, {
    color: '#8f8a80',
  })
}

const outroCard = (props: TriviaProps): Card | null => {
  const game = props.game
  if (!game) return null
  const round = game.round
  const lines: CardLine[] = [{
    text: `Final streak ${game.streak}`,
    color: SOFT_WHITE,
    bold: true,
    accent: props.newBest ? ' · new best!' : '',
  }]
  if (game.phase === 'wrong' && round) {
    lines.push({
      text: `Missed: ${round.question} → ${round.answers[round.correctIndex]}`,
      color: '#b9b2a2',
    })
  }

  return {
    title: game.phase === 'cleared' ? 'ALL CLEARED!' : 'GAME OVER',
    lines,
    button: 'New game',
    streaks: props.recent.length > 0 ? props.recent : [game.streak],
    footer: 'Click New game to play again',
  }
}

const introCard = (props: TriviaProps): Card => {
  const count = props.game?.roundCount ?? 0
  const problem = props.error
    ? `Error: ${props.error}`
    : count === 0 ? 'No valid questions are available.' : null

  return {
    title: '✦ TRIVIA ✦',
    lines: [
      { text: 'Answer until you miss', color: SOFT_WHITE, bold: true },
      problem
        ? { text: problem, color: '#e49a91' }
        : { text: `${count} questions in the pool`, color: '#b9b2a2' },
    ],
    button: problem ? null : 'Start',
    streaks: props.recent,
    footer: problem ? '' : 'Click Start to play',
  }
}

const drawStage = (props: TriviaProps, state: StageState) => {
  const geometry = layout(props.width)
  const canvas = createCanvas(geometry.width, geometry.height)
  const game = props.game
  const phase = phaseOf(props)
  const round = game?.round ?? null
  drawHeader(canvas, props, phase, geometry)

  if (geometry.clawd) drawClawd(canvas, geometry.clawd, clawdLookFor(props, state))

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
    drawCard(canvas, props, geometry, introCard(props), state.hoverNewButton)
    return canvas
  }

  const outro = (phase === 'wrong' || phase === 'cleared') && state.view === 'outro'
    ? outroCard(props)
    : null
  if (outro) {
    drawCard(canvas, props, geometry, outro, state.hoverNewButton)
    return canvas
  }

  if (round) {
    const question = Array.from(round.question).slice(0, state.questionCharacters).join('')
    const lines = wrapText(question, geometry.questionWidth, geometry.questionLines)
    lines.forEach((line, index) => {
      writeCentered(
        canvas,
        line,
        geometry.questionX,
        geometry.questionY + index,
        geometry.questionCenterWidth,
        { color: SOFT_WHITE, bold: true },
      )
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
  if (phase === 'cleared' && state.view === 'reveal') drawSparks(canvas, state.tick, geometry)
  return canvas
}

const Stage: ClientModule<TriviaProps, StageState> = (props, surface) => {
  const geometry = layout(props.width)
  let state = surface.state

  if (!state) {
    state = initialState(props)
    let quietTicks = 0
    surface.every(TICK_MS, () => {
      const current = surface.state
      if (!current) return
      const step = advanceAnimation(current)
      if (step) {
        quietTicks = 0
        surface.setState(step.state)
        if (step.reveal) surface.post({ type: 'reveal' })
        return
      }
      if (current.blinkActive) {
        quietTicks = 0
        surface.setState({ ...current, blinkActive: false })
        return
      }
      if (!isQuietBlinkPhase(current)) {
        quietTicks = 0
        return
      }
      quietTicks += 1
      if (quietTicks >= QUIET_BLINK_TICKS) {
        quietTicks = 0
        surface.setState({
          ...current,
          tick: current.tick + QUIET_BLINK_TICKS,
          blinkActive: true,
        })
      }
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
    const target = geometry.targetAt(event.x, event.y, current.phaseKey, current.view)

    if (event.type !== 'down') {
      const hovered = event.type === 'leave' || current.phaseKey !== 'asking'
        ? null
        : geometry.answerAt(event.x, event.y)
      const visibleHover = hovered !== null && hovered < current.answersShown ? hovered : null
      const hoverNewButton = event.type !== 'leave' && (target?.type === 'new' || target?.type === 'start')
      if (
        visibleHover !== current.hoverChoice ||
        hoverNewButton !== current.hoverNewButton
      ) {
        surface.setState({ ...current, hoverChoice: visibleHover, hoverNewButton })
      }
      return
    }

    if (current.phaseKey === 'wrong' || current.phaseKey === 'cleared') {
      if (current.view === 'reveal') {
        surface.setState({ ...current, view: 'outro', hoverNewButton: false })
      } else if (target?.type === 'new') {
        surface.post({ type: 'new' })
      }
      return
    }

    if (current.phaseKey === 'correct') {
      surface.post({ type: 'next' })
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
    }
  })

  return toElement(surface.elements, drawStage(props, displayedState))
}

export default Stage
