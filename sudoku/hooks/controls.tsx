import type { ClientModule } from 'claude-code'

import type { ControlsMessage, ControlsProps } from '../types'
import { controlsGeometry } from './geometry'
import { CLASH, CURSOR, FINE_LINE, GIVEN, PAPER, PLAYER, WOOD } from './palette'

type ControlsState = { selected: string | null }

type Pixel = {
  character: string
  color: string
  backgroundColor: string
  bold: boolean
}

type Segment = { text: string; color: string; bold?: boolean }

const Controls: ClientModule<ControlsProps, ControlsState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const layout = controlsGeometry(props.geometry)
  const selected = surface.state?.selected ?? null
  const pixels: Pixel[][] = Array.from({ length: layout.innerHeight }, () =>
    Array.from({ length: layout.innerWidth }, () => ({
      character: ' ',
      color: PAPER,
      backgroundColor: PAPER,
      bold: false,
    })),
  )

  const put = (x: number, y: number, pixel: Pixel) => {
    if (x >= 0 && y >= 0 && x < layout.innerWidth && y < layout.innerHeight) {
      pixels[y]![x] = pixel
    }
  }

  const paintLine = (x: number, y: number, width: number, character: string) => {
    for (let dx = 0; dx < width; dx++) {
      put(x + dx, y, {
        character,
        color: FINE_LINE,
        backgroundColor: PAPER,
        bold: false,
      })
    }
  }

  const paintTile = (
    x: number,
    y: number,
    width: number,
    label: string,
    key: string,
  ) => {
    const backgroundColor = selected === key ? CURSOR : PAPER
    const textX = Math.max(0, Math.floor((width - label.length) / 2))
    const textY = Math.floor(layout.tileHeight / 2)

    for (let dy = 0; dy < layout.tileHeight; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const textIndex = dx - textX
        const character = dy === textY && textIndex >= 0 && textIndex < label.length
          ? label[textIndex]!
          : ' '
        put(x + dx, y + dy, {
          character,
          color: selected === key ? GIVEN : PLAYER,
          backgroundColor,
          bold: true,
        })
      }
    }
  }

  const statusSegments: Segment[] = props.isSolved
    ? [{ text: 'Solved!', color: '#245a2c', bold: true }]
    : [
        { text: props.difficulty[0]!.toUpperCase() + props.difficulty.slice(1), color: WOOD },
        { text: ` \u00b7 ${props.filled}/81 filled`, color: PLAYER },
        ...(props.clashes > 0
          ? [{ text: ` \u00b7 ${props.clashes} in conflict`, color: CLASH }]
          : []),
      ]
  const statusWidth = statusSegments.reduce((total, segment) => total + segment.text.length, 0)
  let statusX = Math.floor((layout.innerWidth - statusWidth) / 2)
  for (const segment of statusSegments) {
    for (let index = 0; index < segment.text.length; index++) {
      put(statusX + index, 0, {
        character: segment.text[index]!,
        color: segment.color,
        backgroundColor: PAPER,
        bold: segment.bold ?? false,
      })
    }
    statusX += segment.text.length
  }

  paintLine(0, 1, layout.innerWidth, '\u2500')

  const keypadX = layout.keypadX - 1
  const keypadY = layout.keypadY - 1
  const keypadDigits = [
    [7, 8, 9],
    [4, 5, 6],
    [1, 2, 3],
  ]

  for (let row = 0; row < keypadDigits.length; row++) {
    const y = keypadY + row * (layout.tileHeight + 1)
    for (let col = 0; col < 3; col++) {
      const digit = keypadDigits[row]![col]!
      const x = keypadX + col * (layout.tileWidth + 1)
      paintTile(x, y, layout.tileWidth, String(digit), `digit:${digit}`)
      if (col < 2) {
        for (let dy = 0; dy < layout.tileHeight; dy++) {
          put(x + layout.tileWidth, y + dy, {
            character: '\u2502',
            color: FINE_LINE,
            backgroundColor: PAPER,
            bold: false,
          })
        }
      }
    }
    paintLine(keypadX, y + layout.tileHeight, layout.keypadWidth, '\u2500')
  }

  const clearY = keypadY + 3 * (layout.tileHeight + 1)
  paintTile(keypadX, clearY, layout.keypadWidth, '0 Clear', 'digit:0')
  paintLine(0, clearY + layout.tileHeight, layout.innerWidth, '\u2500')

  paintTile(0, layout.newY - 1, layout.innerWidth, 'New game', 'new')

  surface.onPointer(event => {
    if (event.type !== 'down') return
    const action = layout.actionAt(event.x, event.y)
    if (!action) {
      surface.post({ type: 'focus' })
      return
    }

    surface.setState({ selected: action.key })
    const message: ControlsMessage = action.type === 'new'
      ? { type: 'new', geometry: props.geometry }
      : { type: 'digit', digit: action.digit, geometry: props.geometry }
    surface.post(message)
  })

  const rows = pixels.map((line, y) => {
    const runs: { pixel: Pixel; text: string }[] = []
    for (const pixel of line) {
      const previous = runs[runs.length - 1]
      if (previous && previous.pixel.color === pixel.color &&
        previous.pixel.backgroundColor === pixel.backgroundColor &&
        previous.pixel.bold === pixel.bold) {
        previous.text += pixel.character
      } else {
        runs.push({ pixel, text: pixel.character })
      }
    }

    return (
      <Box key={`row:${y}`} flexDirection="row" backgroundColor={PAPER}>
        {runs.map((run, index) => (
          <Text
            key={`run:${y}:${index}`}
            color={run.pixel.color}
            backgroundColor={run.pixel.backgroundColor}
            bold={run.pixel.bold || undefined}
          >
            {run.text}
          </Text>
        ))}
      </Box>
    )
  })

  const frameRow = (key: string) => (
    <Text key={key} color={WOOD} backgroundColor={WOOD}>
      {' '.repeat(layout.width)}
    </Text>
  )

  const framedRows = rows.map((row, y) => (
    <Box key={`framed:${y}`} flexDirection="row" backgroundColor={WOOD}>
      <Text color={WOOD} backgroundColor={WOOD}> </Text>
      {row}
      <Text color={WOOD} backgroundColor={WOOD}> </Text>
    </Box>
  ))

  return (
    <Box
      flexDirection="column"
      width={layout.width}
      height={layout.height}
      backgroundColor={WOOD}
    >
      {frameRow('frame:top')}
      {framedRows}
      {frameRow('frame:bottom')}
    </Box>
  )
}

export default Controls
