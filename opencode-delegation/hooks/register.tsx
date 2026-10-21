import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Catalog, ModelConfig } from '../types'
import {
  formatConfig,
  parseConfig,
  parseModels,
  variantAfterModelChange,
  variantsFor,
} from './catalog'
import { actionOf, CONFIG_FILE, HOME_MISSING, viewOf, yiraTree, type Row } from './view'
import { connectYira, type YiraPanels } from './yira'

const PANE = 'opencode-delegation'
const TITLE = 'OpenCode delegation'
const YIRA_PANEL = 'delegation'

let yira: YiraPanels | null = null

const config = atom({ plugin: 'opencode-delegation', key: 'config' } as const, null)
const catalog = atom({ plugin: 'opencode-delegation', key: 'catalog' } as const, null)
const installed = atom({ plugin: 'opencode-delegation', key: 'installed' } as const, null)
const error = atom({ plugin: 'opencode-delegation', key: 'error' } as const, null)
const isLoading = atom({ plugin: 'opencode-delegation', key: 'isLoading' } as const, false)

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const homeDirectory = async ($: EngineInterface): Promise<string | undefined> =>
  (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

const readView = async ($: EngineInterface): Promise<Row[]> =>
  viewOf({
    installed: await read($, installed),
    isLoading: await read($, isLoading),
    config: await read($, config),
    catalog: await read($, catalog),
    error: await read($, error),
    home: await homeDirectory($),
  })

const publish = async ($: EngineInterface): Promise<void> => {
  if (!yira) return
  await yira.show(YIRA_PANEL, TITLE, yiraTree(await readView($)))
}

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

// models.dev says which variants exist. Its API is too big for one call into the
// mod, so scripts/variants.mjs fetches it with node and prints only these models.
// Without it the pane offers none and says why.
const loadVariants = async (
  $: EngineInterface,
  models: string[],
): Promise<Pick<Catalog, 'variants' | 'variantsError'>> => {
  try {
    const script = `${$.plugin.root}/scripts/variants.mjs`
    const result = await $.process.run(['node', script, ...models], { timeoutMs: 60000 })
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `node exited with ${result.exitCode}`)
    }
    const api: unknown = JSON.parse(result.stdout)
    const variants: Record<string, string[]> = {}
    for (const model of models) variants[model] = variantsFor(api, model)
    return { variants, variantsError: null }
  } catch (cause) {
    return { variants: {}, variantsError: messageOf(cause) }
  }
}

const readCatalog = async (
  $: EngineInterface,
): Promise<{ catalog: Catalog | null; error: string | null }> => {
  try {
    const models = await listModels($)
    return { catalog: { models, ...(await loadVariants($, models)) }, error: null }
  } catch (cause) {
    return { catalog: null, error: messageOf(cause) }
  }
}

// No OpenCode means no catalog and no config read: the pane shows a setup instead.
const load = async ($: EngineInterface): Promise<void> => {
  await update($, isLoading, () => true)
  await update($, error, () => null)
  await publish($)

  const installation = await probeOpenCode($)
  await update($, installed, () => installation)

  if (!installation) {
    await update($, config, () => null)
    await update($, catalog, () => null)
    await update($, isLoading, () => false)
    await publish($)
    return
  }

  const [configuration, catalogue] = await Promise.all([readConfig($), readCatalog($)])

  await update($, config, () => configuration.config)
  await update($, catalog, () => catalogue.catalog)
  await update($, error, () => configuration.error ?? catalogue.error)
  await update($, isLoading, () => false)
  await publish($)
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
  await publish($)
}

const chooseVariant = async ($: EngineInterface, variant: string): Promise<void> => {
  if (!(await read($, installed))) return
  const current = await read($, config)
  if (!current) return
  const saved = await saveConfig($, { ...current, variant })
  if (saved) $.ui.toast(variant === '' ? 'OpenCode: none' : `OpenCode: ${variant}`)
  await publish($)
}

const press = async ($: EngineInterface, key: string): Promise<void> => {
  const action = actionOf(key)
  if (!action) return
  if (action.kind === 'model') await chooseModel($, action.id)
  else if (action.kind === 'variant') await chooseVariant($, action.variant)
  else await load($)
}

const handlePress =
  ($: EngineInterface) =>
  (panelId: string, key: string): void => {
    if (panelId === YIRA_PANEL) void press($, key)
  }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'opencode-delegation',
      description: 'Pick the OpenCode delegation model and variant',
    })
    yira ??= await connectYira($, handlePress($))
    return next(e)
  })

  on('command.run', { command: 'opencode-delegation' }, async $ => {
    // /clear ends the session without another start, so reconnect to restore the panel.
    yira ??= await connectYira($, handlePress($))
    await $.ui.open({ id: PANE, title: TITLE })
    void load($)
    return { text: 'OpenCode delegation pane opened.' }
  })

  on('session.end', async ($, e, next) => {
    await yira?.close(YIRA_PANEL)
    yira?.stop()
    yira = null
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = await readView($)

    return (
      <Box flexDirection="column">
        {rows.map(row =>
          row.kind === 'text' ? (
            <Text
              key={row.key}
              dimColor={row.tone === 'muted'}
              color={row.tone === 'danger' ? 'red' : undefined}
            >
              {row.text}
            </Text>
          ) : (
            <Button
              key={row.key}
              label={row.label}
              variant={row.isCurrent ? 'primary' : undefined}
              onPress={() => press($, row.key)}
            />
          ),
        )}
      </Box>
    )
  })
}
