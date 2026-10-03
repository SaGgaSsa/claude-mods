import type { TriviaPhase } from '../types'
import type { ClawdLook } from './clawd'
import { makePixels } from './clawd'

type ClawdSprite = {
  source: string
  alt: string
}

const lookFor = (phase: TriviaPhase): ClawdLook => {
  if (phase === 'asking') {
    return { arms: 'out', eyes: 'open', jump: false, offset: 0, step: false }
  }
  if (phase === 'locked') {
    return { arms: 'down', eyes: 'looking', jump: false, offset: 0, step: false }
  }
  if (phase === 'correct' || phase === 'cleared') {
    return { arms: 'up', eyes: 'open', jump: true, offset: 0, step: false }
  }
  if (phase === 'wrong') {
    return { arms: 'down', eyes: 'closed', jump: false, offset: 0, step: false }
  }
  return { arms: 'up', eyes: 'open', jump: false, offset: 0, step: false }
}

const altFor = (phase: TriviaPhase): string => {
  if (phase === 'asking') return 'Clawd bounces while asking a trivia question.'
  if (phase === 'locked') return 'Clawd bounces while the answer is locked.'
  if (phase === 'correct') return 'Clawd jumps with both arms raised after a correct answer.'
  if (phase === 'cleared') return 'Clawd jumps with both arms raised after clearing the trivia.'
  if (phase === 'wrong') return 'Clawd lowers both arms and closes its eyes after a wrong answer.'
  return 'Clawd waves hello before the trivia game starts.'
}

const sourceFor = (phase: TriviaPhase): string => {
  const pixels = makePixels(lookFor(phase))
  const rects: string[] = []

  pixels.forEach((row, y) => {
    row.forEach((color, x) => {
      if (color) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`)
    })
  })

  const animation = phase === 'asking' || phase === 'locked'
    ? '<animateTransform attributeName="transform" type="translate" ' +
      'values="0 0; 0 -1; 0 0" dur="560ms" repeatCount="indefinite"/>'
    : ''

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 16 9" ' +
    'shape-rendering="crispEdges" style="background-color:transparent"><g>' +
    animation + rects.join('') + '</g></svg>'
}

export const clawdSvgForPhase = (phase: TriviaPhase): ClawdSprite => ({
  source: sourceFor(phase),
  alt: altFor(phase),
})
