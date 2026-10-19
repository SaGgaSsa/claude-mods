import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Catalog, ModelConfig } from '../types'
import {
  formatConfig,
  INSTALL_COMMAND,
  INSTALL_DOCS,
  parseConfig,
  parseModels,
  variantAfterModelChange,
  variantsFor,
} from './catalog'

const PANE = 'opencode-delegation'
const CONFIG_FILE = '/.codex/opencode-model.json'
const HOME_MISSING = 'USERPROFILE and HOME are both unset'

const config = atom({ plugin: 'opencode-delegation', key: 'config' } as const, null)
const catalog = atom({ plugin: 'opencode-delegation', key: 'catalog' } as const, null)
const installed = atom({ plugin: 'opencode-delegation', key: 'installed' } as const, null)
const error = atom({ plugin: 'opencode-delegation', key: 'error' } as const, null)
const isLoading = atom({ plugin: 'opencode-delegation', key: 'isLoading' } as const, false)

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const homeDirectory = async ($: EngineInterface): Promise<string | undefined> =>
  (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

// The file the OpenCode delegation script reads.
const configPath = async ($: EngineInterface): Promise<string> => {
  const home = await homeDirectory($)
  if (!home) throw new Error(HOME_MISSING)
  return `${home}${CONFIG_FILE}`
}

// On Windows `opencode` is a .cmd, which needs cmd.exe: there is no shell here.
const opencodeArgv = async ($: EngineInterface, args: string[]): Promise<string[]> =>
  (await $.env.get('OS')) === 'Windows_NT'
    ? ['cmd', '/c', 'opencode', ...args]
    : ['opencode', ...args]

const probeOpenCode = async ($: EngineInterface): Promise<{ version: string } | null> => {
  try {
    const result = await $.process.run(await opencodeArgv($, ['--version']), { timeoutMs: 60000 })
    return result.exitCode === 0 ? { version: result.stdout.trim() } : null
  } catch {
    return null
  }
}

const readConfig = async (
  $: EngineInterface,
): Promise<{ config: ModelConfig | null; error: string | null }> => {
  try {
    return { config: parseConfig(await $.fs.read(await configPath($))), error: null }
  } catch (cause) {
    return { config: null, error: messageOf(cause) }
  }
}

const listModels = async ($: EngineInterface): Promise<string[]> => {
  const result = await $.process.run(await opencodeArgv($, ['models']), { timeoutMs: 60000 })
  if (result.exitCode !== 0) {
    const reason = result.stderr.trim() || `exit code ${result.exitCode}`
    throw new Error(`opencode models failed: ${reason}`)
  }
  return parseModels(result.stdout)
}

// The API only says which variants exist; without it the pane offers none.
const loadVariants = async (
  $: EngineInterface,
  models: string[],
): Promise<Record<string, string[]>> => {
  try {
    const response = await $.http.fetch('https://models.dev/api.json')
    const api: unknown = JSON.parse(response.text)
    const variants: Record<string, string[]> = {}
    for (const model of models) variants[model] = variantsFor(api, model)
    return variants
  } catch {
    return {}
  }
}

const readCatalog = async (
  $: EngineInterface,
): Promise<{ catalog: Catalog | null; error: string | null }> => {
  try {
    const models = await listModels($)
    return { catalog: { models, variants: await loadVariants($, models) }, error: null }
  } catch (cause) {
    return { catalog: null, error: messageOf(cause) }
  }
}

// No OpenCode means no catalog and no config read: the pane shows a setup instead.
const load = async ($: EngineInterface): Promise<void> => {
  await update($, isLoading, () => true)
  await update($, error, () => null)

  const installation = await probeOpenCode($)
  await update($, installed, () => installation)

  if (!installation) {
    await update($, config, () => null)
    await update($, catalog, () => null)
    await update($, isLoading, () => false)
    return
  }

  const [configuration, catalogue] = await Promise.all([readConfig($), readCatalog($)])

  await update($, config, () => configuration.config)
  await update($, catalog, () => catalogue.catalog)
  await update($, error, () => configuration.error ?? catalogue.error)
  await update($, isLoading, () => false)
}

const saveConfig = async ($: EngineInterface, next: ModelConfig): Promise<boolean> => {
  try {
    await $.fs.write(await configPath($), formatConfig(next))
  } catch (cause) {
    await update($, error, () => messageOf(cause))
    return false
  }
  await update($, config, () => next)
  return true
}

const chooseModel = async ($: EngineInterface, id: string): Promise<void> => {
  if (!(await read($, installed))) return
  const previous = (await read($, config))?.variant ?? ''
  const variants = (await read($, catalog))?.variants[id] ?? []
  const saved = await saveConfig($, {
    model: id,
    variant: variantAfterModelChange(previous, variants),
  })
  if (saved) $.ui.toast(`OpenCode: ${id}`)
}

const chooseVariant = async ($: EngineInterface, variant: string): Promise<void> => {
  if (!(await read($, installed))) return
  const current = await read($, config)
  if (!current) return
  const saved = await saveConfig($, { ...current, variant })
  if (saved) $.ui.toast(variant === '' ? 'OpenCode: none' : `OpenCode: ${variant}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'opencode-delegation',
      description: 'Pick the OpenCode delegation model and variant',
    })
    return next(e)
  })

  on('command.run', { command: 'opencode-delegation' }, async $ => {
    await $.ui.open({ id: PANE, title: 'OpenCode delegation' })
    void load($)
    return { text: 'OpenCode delegation pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const installation = await read($, installed)
    const loading = await read($, isLoading)

    // Until the first check answers, say so instead of claiming OpenCode is missing.
    if (!installation && loading) {
      return <Text key="loading" dimColor>Checking OpenCode…</Text>
    }

    if (!installation) {
      return (
        <Box flexDirection="column">
          <Text key="not-installed">OpenCode is not installed.</Text>
          <Text key="install-with">Install it with:</Text>
          <Text key="install-command">{INSTALL_COMMAND}</Text>
          <Text key="install-docs">{`Docs: ${INSTALL_DOCS}`}</Text>
          <Text key="check-again">Then press Check again.</Text>
          <Button key="refresh" label="Check again" onPress={() => load($)} />
        </Box>
      )
    }

    const current = await read($, config)
    const known = await read($, catalog)
    const failure = await read($, error)
    const variants = current ? known?.variants[current.model] ?? [] : []
    const home = current ? null : await homeDirectory($)

    return (
      <Box flexDirection="column">
        <Text key="current">
          {current
            ? `Current: ${current.model}${current.variant ? `#${current.variant}` : ''}`
            : home ? `No config at ${home}${CONFIG_FILE}` : `No config: ${HOME_MISSING}`}
        </Text>
        <Text key="version" dimColor>{installation.version}</Text>
        {current && known && !known.models.includes(current.model) ? (
          <Text key="missing" color="red">
            {`${current.model} is no longer in the OpenCode catalog. Pick another.`}
          </Text>
        ) : null}
        {loading ? <Text key="loading" dimColor>Loading…</Text> : null}
        {failure ? <Text key="error" color="red">{failure}</Text> : null}

        <Text key="models-heading">Models</Text>
        {(known?.models ?? []).map(id => (
          <Button
            key={`model:${id}`}
            label={`${id === current?.model ? '● ' : '  '}${id}`}
            onPress={() => chooseModel($, id)}
          />
        ))}

        {current ? <Text key="variant-heading">Variant</Text> : null}
        {current && variants.length === 0 ? (
          <Text key="variants-unavailable" dimColor>variants unavailable</Text>
        ) : null}
        {variants.map(variant => (
          <Button
            key={`variant:${variant}`}
            label={`${variant === current?.variant ? '● ' : '  '}${variant}`}
            onPress={() => chooseVariant($, variant)}
          />
        ))}
        {current ? (
          <Button
            key="variant:none"
            label={`${current.variant === '' ? '● ' : '  '}none`}
            onPress={() => chooseVariant($, '')}
          />
        ) : null}

        <Button key="refresh" label="Refresh" onPress={() => load($)} />
      </Box>
    )
  })
}
