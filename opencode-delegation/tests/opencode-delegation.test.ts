import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  formatConfig,
  INSTALL_COMMAND,
  INSTALL_DOCS,
  parseConfig,
  parseModels,
  variantAfterModelChange,
  variantsFor,
} from '../hooks/catalog'

const CONFIG_PATH = 'C:/Users/u/.codex/opencode-model.json'
const MODELS_STDOUT = 'opencode/a-free\r\nopencode/b-free\r\n'
const VERSION = 'opencode v2.0.29'

const API = {
  opencode: {
    models: {
      'a-free': { reasoning_options: [{ type: 'effort', values: ['min', 'max'] }] },
      'b-free': { reasoning_options: [{ type: 'effort', values: ['low', 'high'] }] },
    },
  },
}

const PANE_PROPS = {
  title: 'OpenCode delegation',
  isFocused: true,
  bodyColumns: 60,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

type Stubs = {
  api?: unknown
  stdout?: string
  version?: () => string | null
  throwVersion?: boolean
  onArgv?: (argv: readonly string[]) => void
  onRead?: (path: string) => void
}

const runResult = (exitCode: number, stdout: string, stderr = '') => ({
  value: {
    exitCode,
    stdout,
    stderr,
    isStdoutTruncated: false,
    isStderrTruncated: false,
  },
})

const wire = (on: On, files: Record<string, string>, stubs: Stubs = {}) => {
  // The engine hands paths in the host's spelling (backslashes on Windows).
  const keyOf = (path: string) => path.replaceAll('\\', '/')

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('env.get', (_, e) => ({
    value: e.name === 'USERPROFILE' ? 'C:/Users/u' : e.name === 'OS' ? 'Windows_NT' : undefined,
  }))
  on('fs.read', (_, e) => {
    stubs.onRead?.(e.path)
    const text = files[keyOf(e.path)]
    if (text === undefined) throw new Error(`ENOENT: no such file, open '${e.path}'`)
    return { value: text }
  })
  on('fs.write', (_, e) => {
    files[keyOf(e.path)] = e.text
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    stubs.onArgv?.(e.argv)
    if (e.argv.includes('--version')) {
      if (stubs.throwVersion) throw new Error('spawn opencode ENOENT')
      const version = stubs.version ? stubs.version() : VERSION
      return version === null
        ? runResult(1, '', 'opencode: not found')
        : runResult(0, `${version}\n`)
    }
    return runResult(0, stubs.stdout ?? MODELS_STDOUT)
  })
  on('http.fetch', () => ({
    value: { status: 200, ok: true, headers: {}, text: JSON.stringify(stubs.api ?? API) },
  }))
}

// Opens the pane, then refreshes so the load the command started is settled.
const open = async ($: Engine) => {
  await $.session.start({ cwd: '/work/opencode-delegation', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'opencode-delegation',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  const ui = await $.ui.mount({
    plugin: 'opencode-delegation',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'opencode-delegation',
    props: PANE_PROPS,
  })
  await ui.press({ key: 'refresh' })
  return ui
}

test('parses models, effort variants and the delegation config', () => {
  expect(INSTALL_COMMAND).toBe('npm i -g @opencode/cli')
  expect(INSTALL_DOCS).toBe('https://opencode.ai/docs/cli/')

  expect(parseModels('opencode/a-free\r\n  opencode/b-free  \n\n')).toEqual([
    'opencode/a-free',
    'opencode/b-free',
  ])
  expect(parseModels('')).toEqual([])

  const api = {
    opencode: {
      models: {
        'a-free': { reasoning_options: [{ type: 'effort', values: ['min', 'max'] }] },
        'nested/id': { reasoning_options: [{ type: 'effort', values: ['low'] }] },
        'no-effort': { reasoning_options: [{ type: 'verbosity', values: ['high'] }] },
      },
    },
  }
  expect(variantsFor(api, 'opencode/a-free')).toEqual(['min', 'max'])
  expect(variantsFor(api, 'opencode/nested/id')).toEqual(['low'])
  expect(variantsFor(api, 'opencode/no-effort')).toEqual([])
  expect(variantsFor(api, 'opencode/missing')).toEqual([])
  expect(variantsFor(api, 'a-free')).toEqual([])
  expect(variantsFor(null, 'opencode/a-free')).toEqual([])
  expect(variantsFor('nonsense', 'opencode/a-free')).toEqual([])

  expect(parseConfig('{"model":"opencode/a-free"}'))
    .toEqual({ model: 'opencode/a-free', variant: '' })
  expect(parseConfig('{"model":"opencode/a-free","variant":"max"}'))
    .toEqual({ model: 'opencode/a-free', variant: 'max' })
  expect(parseConfig('{"model":"opencode/a-free","variant":7}'))
    .toEqual({ model: 'opencode/a-free', variant: '' })
  expect(() => parseConfig('not json')).toThrow()
  expect(() => parseConfig('{"variant":"max"}')).toThrow()

  expect(formatConfig({ model: 'opencode/b-free', variant: '' }))
    .toBe('{\n  "model": "opencode/b-free",\n  "variant": ""\n}\n')

  expect(variantAfterModelChange('max', ['min', 'max'])).toBe('max')
  expect(variantAfterModelChange('max', ['low', 'high'])).toBe('high')
  expect(variantAfterModelChange('', ['low', 'max'])).toBe('max')
  expect(variantAfterModelChange('max', [])).toBe('')
})

test('the pane lists the catalog, marks the current model and saves picks', async ($, on) => {
  const files: Record<string, string> = {
    [CONFIG_PATH]: formatConfig({ model: 'opencode/a-free', variant: 'max' }),
  }
  wire(on, files)
  const ui = await open($)

  expect(await ui.find({ type: 'Text', text: /^Current: opencode\/a-free#max$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: VERSION }))?.props.dimColor).toBe(true)
  expect((await ui.find({ key: 'model:opencode/a-free' }))?.props.label).toBe('● opencode/a-free')
  expect((await ui.find({ key: 'model:opencode/b-free' }))?.props.label).toBe('  opencode/b-free')
  expect((await ui.find({ key: 'variant:max' }))?.props.label).toBe('● max')
  expect((await ui.find({ key: 'variant:min' }))?.props.label).toBe('  min')
  expect(await ui.find({ key: 'variant:low' })).toBeUndefined()

  // max is not a b-free variant, so the pick falls back to its last one.
  await ui.press({ key: 'model:opencode/b-free' })
  expect(files[CONFIG_PATH]).toBe('{\n  "model": "opencode/b-free",\n  "variant": "high"\n}\n')
  expect(await ui.find({ type: 'Text', text: /^Current: opencode\/b-free#high$/ })).toBeDefined()
  expect((await ui.find({ key: 'variant:high' }))?.props.label).toBe('● high')

  // Picking the same model again keeps a variant it still offers.
  await ui.press({ key: 'model:opencode/b-free' })
  expect(files[CONFIG_PATH]).toBe('{\n  "model": "opencode/b-free",\n  "variant": "high"\n}\n')

  // back to a-free: high is gone, so it prefers max.
  await ui.press({ key: 'model:opencode/a-free' })
  expect(files[CONFIG_PATH]).toBe('{\n  "model": "opencode/a-free",\n  "variant": "max"\n}\n')

  await ui.press({ key: 'model:opencode/a-free' })
  expect(files[CONFIG_PATH]).toBe('{\n  "model": "opencode/a-free",\n  "variant": "max"\n}\n')
  await ui.unmount()
})

test('the pane saves a variant pick and clears it with none', async ($, on) => {
  const files: Record<string, string> = {
    [CONFIG_PATH]: formatConfig({ model: 'opencode/a-free', variant: 'max' }),
  }
  wire(on, files)
  const ui = await open($)

  await ui.press({ key: 'variant:min' })
  expect(files[CONFIG_PATH]).toBe('{\n  "model": "opencode/a-free",\n  "variant": "min"\n}\n')
  expect((await ui.find({ key: 'variant:min' }))?.props.label).toBe('● min')
  expect((await ui.find({ key: 'variant:max' }))?.props.label).toBe('  max')

  await ui.press({ key: 'variant:none' })
  expect(files[CONFIG_PATH]).toBe('{\n  "model": "opencode/a-free",\n  "variant": ""\n}\n')
  expect(await ui.find({ type: 'Text', text: /^Current: opencode\/a-free$/ })).toBeDefined()
  await ui.unmount()
})

test('the pane warns when the saved model left the catalog', async ($, on) => {
  const files: Record<string, string> = {
    [CONFIG_PATH]: formatConfig({ model: 'opencode/gone-free', variant: '' }),
  }
  wire(on, files)
  const ui = await open($)

  expect(await ui.find({ type: 'Text', text: /no longer in the OpenCode catalog/ })).toBeDefined()
  expect(await ui.find({ key: 'model:opencode/a-free' })).toBeDefined()
  await ui.unmount()
})

test('the pane shows the setup until OpenCode is installed, then checks again', async ($, on) => {
  const files: Record<string, string> = {
    [CONFIG_PATH]: formatConfig({ model: 'opencode/a-free', variant: 'max' }),
  }
  let isInstalled = false
  const argvs: string[][] = []
  let reads = 0
  wire(on, files, {
    version: () => (isInstalled ? VERSION : null),
    onArgv: argv => { argvs.push([...argv]) },
    onRead: () => { reads++ },
  })
  const ui = await open($)

  expect(await ui.find({ type: 'Text', text: 'OpenCode is not installed.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: INSTALL_COMMAND })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: `Docs: ${INSTALL_DOCS}` })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Then press Check again.' })).toBeDefined()
  expect((await ui.find({ key: 'refresh' }))?.props.label).toBe('Check again')
  expect(await ui.find({ key: 'model:opencode/a-free' })).toBeUndefined()
  expect(await ui.find({ key: 'variant:max' })).toBeUndefined()
  expect(argvs.some(argv => argv.includes('models'))).toBe(false)
  expect(reads).toBe(0)

  isInstalled = true
  await ui.press({ key: 'refresh' })

  expect(await ui.find({ key: 'model:opencode/a-free' })).toBeDefined()
  expect(await ui.find({ key: 'model:opencode/b-free' })).toBeDefined()
  expect(await ui.find({ key: 'variant:max' })).toBeDefined()
  expect((await ui.find({ key: 'refresh' }))?.props.label).toBe('Refresh')
  expect((await ui.find({ type: 'Text', text: VERSION }))?.props.dimColor).toBe(true)
  expect(reads).toBeGreaterThan(0)
  await ui.unmount()
})

test('a process that cannot start counts as OpenCode not installed', async ($, on) => {
  const files: Record<string, string> = {
    [CONFIG_PATH]: formatConfig({ model: 'opencode/a-free', variant: 'max' }),
  }
  let modelsCalls = 0
  wire(on, files, {
    throwVersion: true,
    onArgv: argv => { if (argv.includes('models')) modelsCalls++ },
  })
  const ui = await open($)

  expect(await ui.find({ type: 'Text', text: 'OpenCode is not installed.' })).toBeDefined()
  expect(await ui.find({ key: 'model:opencode/a-free' })).toBeUndefined()
  expect(modelsCalls).toBe(0)
  await ui.unmount()
})

test('runs opencode --version and models through cmd.exe on Windows', async ($, on) => {
  const files: Record<string, string> = {
    [CONFIG_PATH]: formatConfig({ model: 'opencode/a-free', variant: 'max' }),
  }
  const argvs: string[][] = []
  wire(on, files, { onArgv: argv => { argvs.push([...argv]) } })
  const ui = await open($)

  expect(argvs).toContainEqual(['cmd', '/c', 'opencode', '--version'])
  expect(argvs).toContainEqual(['cmd', '/c', 'opencode', 'models'])
  expect(argvs.every(argv => argv[0] === 'cmd' && argv[1] === '/c' && argv[2] === 'opencode'))
    .toBe(true)
  await ui.unmount()
})
