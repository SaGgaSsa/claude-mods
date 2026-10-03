# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A Claude Code plugin marketplace of "mods": plugins of TypeScript function hooks that run inside Claude Code.
`.claude-plugin/marketplace.json` lists each mod; every mod is a top-level folder (today only `sudoku/`).
There is no package.json, build step or bundler: Claude Code loads the `.ts`/`.tsx` sources directly.

## Commands

```
claude plugin validate .                 # marketplace manifest
claude plugin validate ./sudoku          # a mod: manifest, hooks, $.state keys vs its types contract
claude plugin test ./sudoku              # runs every *.test.ts(x) under the folder (no per-test filter)
claude --plugin-dir ./sudoku             # load the mod from disk for one session; it hot-reloads on save
tsc -p ./sudoku                          # type-check, after the mod has been loaded once (see below)
```

Loading a mod (`--plugin-dir` or hot reload) makes the engine write `<mod>/.claude-plugin/types/`
(the `claude-code` API declarations) and a `tsconfig.json`; both are gitignored. The declaration file
`.claude-plugin/types/claude-code/index.d.ts` is the authority on the API: grep it for an event or element
name (`'ui.message'`, `ClientSurface`, `RasterProps`) rather than guessing.

Install for users: see README.md (`/plugin marketplace add SaGgaSsa/claude-mods`, then
`/plugin install <mod>@claude-mods`).

## Anatomy of a mod

- `.claude-plugin/plugin.json`: name, version, `"types": "./types/index.d.ts"`. Bump `version` on each change.
- `hooks/hooks.json`: `{ "modules": ["./register.tsx"] }`, the one hooks module.
- `hooks/register.tsx`: `export const register: Register = on => { on(event, matcher?, ($, e, next) => ...) }`.
- `types/index.d.ts`: the contract. Every `$.state` key the module uses must be declared in
  `interface PluginState { <mod>: { ... } }`, or `claude plugin validate` fails.
- The runtime has no DOM and no Node. JSX compiles against the global `h`; elements come from
  `$.ui.resolve(e)` (hooks) or `surface.elements` (Client modules), never from imports.
- Adding a mod: new folder with the files above, an entry in `marketplace.json`, a README section.

## sudoku architecture

- `/sudoku` (registered in `session.start`, answered in `command.run`) opens one `Pane` with id `sudoku`.
- Persistence: one game per workspace folder in `$.store` under `game:<cwd>`. The live copy is in `$.state`
  (`game`, `selectingDifficulty`, `keyboardActive`), via `atom`/`read`/`update` from `claude-code`.
  Saves written before `difficulty` existed load as `medium`.
- `hooks/sudoku.ts`: pure logic: generation with a unique solution per difficulty, `setDigit`,
  `moveCursor`, `conflicts`. Boards are 81-character strings, `'0'` = empty.
- The pane's `ui.render` hook draws three `Client`s in the terminal: `board.tsx`, `picker.tsx`
  (difficulty) and `controls.tsx` (status and New game). Each Client draws its own pixels and
  handles keys and clicks itself, then `surface.post`s a message. `register.tsx` answers it in a
  `ui.message` hook keyed by the Client's `element` and updates state. Other surfaces (no `Client`) get
  plain `Button` fallbacks.
- Drawing: each Client builds an exact character grid with `canvas.ts` (glyph, fg, bg per cell) and
  emits one fixed-size row of `Text` per line. Don't build the grid from nested `Box`es: flex layout
  shifts cells. `Raster` would be the natural element but is not available inside a `Client`.
- `geometry.ts` is the single source of sizes and hit-testing: scale from the pane's `bodyColumns` and
  `scroll.bodyRows`, odd cell heights only (`cellWidth = 2h + 1`, so cells look square and digits sit in the
  middle row), board/picker/controls dimensions, and click-to-cell mapping. The `<Client width height>`
  reserved in `register.tsx` must equal the grid each module draws.
- `palette.ts`: shared colors (paper tones A/B for the 3x3 checkerboard, wood frame, given/player digits,
  cursor, match, clash). Every grid cell sets an explicit background so it reads the same on light and
  dark terminals.
- Keyboard: a Client receives keys only after the person clicks it (`$.ui.focus` moves the focus ring
  but doesn't hand keys over). `ui.focus` and `ui.scroll` hooks keep arrows inside the pane; keys
  typed at the Claude Code prompt can't be intercepted.
- Tests (`tests/sudoku.test.ts`) mount the Pane with `$.ui.mount`, drive Clients with `ui.pointer` /
  `ui.key` (`in: 'board'`), decode the drawn grid and stub engine events (`session.cwd`,
  `command.register`, `ui.open`) and `mock.store`.
