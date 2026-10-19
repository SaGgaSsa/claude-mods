import type { ModelConfig } from '../types'

export const INSTALL_COMMAND = 'npm i -g @opencode/cli'
export const INSTALL_DOCS = 'https://opencode.ai/docs/cli/'

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

// One model per line, as `opencode models` prints them.
export const parseModels = (stdout: string): string[] =>
  stdout.split('\n').map(line => line.trim()).filter(line => line.length > 0)

// Effort variants of one "<provider>/<id>" model, from the models.dev API.
// The id may hold more slashes, so only the first one splits. Anything
// missing or malformed answers no variants instead of throwing.
export const variantsFor = (api: unknown, model: string): string[] => {
  const slash = model.indexOf('/')
  if (slash === -1) return []

  const provider = asObject(asObject(api)?.[model.slice(0, slash)])
  const entry = asObject(asObject(provider?.models)?.[model.slice(slash + 1)])
  const options = entry?.reasoning_options
  if (!Array.isArray(options)) return []

  for (const option of options) {
    const reasoning = asObject(option)
    if (reasoning?.type !== 'effort') continue
    const values = reasoning.values
    if (Array.isArray(values)) {
      return values.filter((value): value is string => typeof value === 'string')
    }
  }
  return []
}

export const parseConfig = (text: string): ModelConfig => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('The OpenCode model config is not valid JSON.')
  }

  const record = asObject(parsed)
  if (!record || typeof record.model !== 'string') {
    throw new Error('The OpenCode model config needs a string "model".')
  }
  return {
    model: record.model,
    variant: typeof record.variant === 'string' ? record.variant : '',
  }
}

export const formatConfig = (config: ModelConfig): string =>
  JSON.stringify({ model: config.model, variant: config.variant }, null, 2) + '\n'

// Keep the variant the new model also offers, else prefer max, else the last, else none.
export const variantAfterModelChange = (variant: string, variants: string[]): string => {
  if (variants.includes(variant)) return variant
  if (variants.includes('max')) return 'max'
  return variants.length > 0 ? variants[variants.length - 1]! : ''
}
