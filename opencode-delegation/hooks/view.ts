import type { Catalog, ModelConfig } from '../types'
import { INSTALL_COMMAND, INSTALL_DOCS } from './catalog'
import { ui, type YiraNode } from './yira'

// muted: secondary text; danger: a problem; code: a command to copy.
export type Tone = 'plain' | 'muted' | 'danger' | 'code'

export type Row =
  | { kind: 'text'; key: string; text: string; tone: Tone }
  | { kind: 'button'; key: string; label: string; isCurrent: boolean }

export type ViewInput = {
  installed: { version: string } | null
  isLoading: boolean
  config: ModelConfig | null
  catalog: Catalog | null
  error: string | null
  home: string | undefined
}

export type Action =
  | { kind: 'model'; id: string }
  | { kind: 'variant'; variant: string }
  | { kind: 'refresh' }

export const CONFIG_FILE = '/.codex/opencode-model.json'
export const HOME_MISSING = 'USERPROFILE and HOME are both unset'

// What the pane and the Yira panel show, row by row, in both the same.
export const viewOf = (input: ViewInput): Row[] => {
  // Until the first check answers, say so instead of claiming OpenCode is missing.
  if (!input.installed && input.isLoading) {
    return [{ kind: 'text', key: 'loading', text: 'Checking OpenCode…', tone: 'muted' }]
  }

  if (!input.installed) {
    return [
      { kind: 'text', key: 'not-installed', text: 'OpenCode is not installed.', tone: 'plain' },
      { kind: 'text', key: 'install-with', text: 'Install it with:', tone: 'plain' },
      { kind: 'text', key: 'install-command', text: INSTALL_COMMAND, tone: 'code' },
      { kind: 'text', key: 'install-docs', text: `Docs: ${INSTALL_DOCS}`, tone: 'plain' },
      { kind: 'text', key: 'check-again', text: 'Then press Check again.', tone: 'plain' },
      { kind: 'button', key: 'refresh', label: 'Check again', isCurrent: false },
    ]
  }

  const { config, catalog } = input
  const variants = config ? catalog?.variants[config.model] ?? [] : []
  const rows: Row[] = [
    {
      kind: 'text',
      key: 'current',
      text: config
        ? `Current: ${config.model}${config.variant ? `#${config.variant}` : ''}`
        : input.home
          ? `No config at ${input.home}${CONFIG_FILE}`
          : `No config: ${HOME_MISSING}`,
      tone: 'plain',
    },
    { kind: 'text', key: 'version', text: input.installed.version, tone: 'muted' },
  ]

  if (config && catalog && !catalog.models.includes(config.model)) {
    rows.push({
      kind: 'text',
      key: 'missing',
      text: `${config.model} is no longer in the OpenCode catalog. Pick another.`,
      tone: 'danger',
    })
  }
  if (input.isLoading) {
    rows.push({ kind: 'text', key: 'loading', text: 'Loading…', tone: 'muted' })
  }
  if (input.error) {
    rows.push({ kind: 'text', key: 'error', text: input.error, tone: 'danger' })
  }

  rows.push({ kind: 'text', key: 'models-heading', text: 'Models', tone: 'plain' })
  for (const id of catalog?.models ?? []) {
    rows.push({ kind: 'button', key: `model:${id}`, label: id, isCurrent: id === config?.model })
  }

  if (config) {
    rows.push({ kind: 'text', key: 'variant-heading', text: 'Variant', tone: 'plain' })
    if (variants.length === 0) {
      rows.push({
        kind: 'text',
        key: 'variants-unavailable',
        text: catalog?.variantsError
          ? `variants unavailable: ${catalog.variantsError}`
          : 'variants unavailable',
        tone: 'muted',
      })
    }
    for (const variant of variants) {
      rows.push({
        kind: 'button',
        key: `variant:${variant}`,
        label: variant,
        isCurrent: variant === config.variant,
      })
    }
    rows.push({ kind: 'button', key: 'variant:none', label: 'none', isCurrent: config.variant === '' })
  }

  rows.push({ kind: 'button', key: 'refresh', label: 'Refresh', isCurrent: false })
  return rows
}

export const actionOf = (key: string): Action | null => {
  if (key === 'refresh') return { kind: 'refresh' }
  if (key === 'variant:none') return { kind: 'variant', variant: '' }

  // Model ids hold slashes, so only the first colon is a separator.
  const colon = key.indexOf(':')
  if (colon === -1) return null
  const rest = key.slice(colon + 1)
  if (rest === '') return null

  if (key.slice(0, colon) === 'model') return { kind: 'model', id: rest }
  if (key.slice(0, colon) === 'variant') return { kind: 'variant', variant: rest }
  return null
}

const rowNode = (row: Row): YiraNode => {
  if (row.kind === 'button') {
    return ui.button(row.key, row.label, row.isCurrent ? { variant: 'primary' } : {})
  }
  if (row.key === 'models-heading' || row.key === 'variant-heading') {
    return ui.text({ bold: true }, row.text)
  }
  if (row.tone === 'code') return ui.code(row.text, 'sh')
  if (row.tone === 'muted') return ui.text({ color: 'muted' }, row.text)
  if (row.tone === 'danger') return ui.text({ color: 'danger' }, row.text)
  return ui.text({}, row.text)
}

export const yiraTree = (rows: Row[]): YiraNode => {
  const children: YiraNode[] = []
  let buttons: YiraNode[] = []

  const flush = (): void => {
    if (buttons.length === 0) return
    children.push(ui.box({ flexDirection: 'row', gap: 1, wrap: true }, ...buttons))
    buttons = []
  }

  for (const row of rows) {
    if (row.kind === 'button') {
      buttons.push(rowNode(row))
      continue
    }
    flush()
    children.push(rowNode(row))
  }
  flush()

  return ui.box({ gap: 2 }, ...children)
}
