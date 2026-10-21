---
name: yira-panel
description: Add a Yira Mods-tab panel to a mod in this repo, next to its terminal pane or band. Use when creating a new mod, when a mod gets a pane or other UI, or when the user mentions Yira, the Mods tab or yira.ts. Covers the kit, the shared view model, button keys, when to publish, session end and the tests.
---

# Yira panel for a mod

A mod that runs inside a Yira terminal can also publish a panel to Yira's
**Mods** tab. Outside Yira nothing changes. `opencode-delegation/` is the
reference implementation: read its `hooks/view.ts`, `hooks/register.tsx` and
`tests/opencode-delegation.test.ts` before copying the pattern.

When creating a mod with any UI (pane, band, buttons), ask whether it should
also publish to Yira. Mods without UI don't need it.

## The kit

- Copy `hooks/yira.ts` without changes. Source of truth: the Yira repo,
  `C:\Users\saggassa\Desktop\yira\examples\claude-mods\yira-panels-demo\hooks\yira.ts`
  (branch `feat/mod-panels` or `main` once merged). Diff it against
  `opencode-delegation/hooks/yira.ts` and update both if it changed.
- `connectYira($, onPress)` resolves `null` unless `YIRA_MOD_BRIDGE_FILE` and
  `YIRA_AGENT_TILE_ID` are set. It returns `{ show(id, title, tree), close(id), stop() }`.
- Elements (contract: `src/shared/modPanels.ts` in the Yira repo): `Box`
  (`flexDirection`, `gap`, `padding` 0-8, `border`, `wrap`), `Text` (`color`,
  `bold`, `italic`, `dim`, `mono`), `Button` (`key`, `label`,
  `variant: 'primary' | 'secondary'`, `disabled`), `Markdown`, `Code`,
  `Divider`. Colors: `default | muted | accent | success | warning | danger`.
  Limits: 2000 nodes, depth 24, 512 KB body; Yira trims, it doesn't reject.
- No manifest permission is needed for `$.http.fetch` to the loopback bridge.

## Pattern

1. **One view model, two outputs.** Put "what to show" in a pure module
   (`hooks/view.ts`: no `$`, testable like `catalog.ts`) that returns rows or a
   small data model from the values in `$.state`. The terminal `ui.render`
   maps it to `Text`/`Button`; `yiraTree(rows)` maps it to `ui.*`. No display
   logic in `register.tsx`.
2. **Same keys everywhere.** Button keys (`model:<id>`, `refresh`, ...) are
   identical in the pane and in Yira. A pure `actionOf(key)` parses them; one
   `press($, key)` runs the action, called by the pane's `onPress` and by
   `handlePress`.
3. **Mark the current choice with `variant: 'primary'`**, not with a glyph in the
   label. The terminal `Button` has `variant` too (drawn in the accent color).
4. **Connect** in `session.start`: `yira ??= await connectYira($, handlePress($))`,
   with `handlePress = $ => (panelId, key) => { if (panelId === PANEL) void press($, key) }`.
   Repeat the `??=` in the command that opens the UI: `/clear` raises
   `session.end` without another `session.start`.
5. **Publish** with `publish($)` (`yira?.show(PANEL, TITLE, yiraTree(await readView($)))`)
   right after each state change the panel shows: when the command opens it,
   at the start and end of loads, and at the end of each action, whether it
   succeeded or failed. Call it explicitly; don't hook `state.set`.
6. **End** in `session.end`: `await yira?.close(PANEL)`, `yira?.stop()`,
   `yira = null`, then `return next(e)`.
7. Bump the mod's `version`, and add one README line saying it also shows in
   Yira's Mods tab.

## Tests

- Without the Yira variables (and with only one of them), a full run makes no
  `http.fetch` call: stub `http.fetch` and count.
- A pure test of `actionOf`, including unknown and empty keys.
- An end-to-end test with the bridge stubbed:
  - `const clock = mock.clock(on)` before wiring the other stubs: the kit polls
    with `$.clock.after`.
  - `env.get` answers both variables, and `fs.read` answers the discovery file
    `{"url":"http://127.0.0.1:5000","token":"t"}`.
  - `http.fetch`: `POST /panels` records `JSON.parse(e.init.body)`,
    `POST /panels/close` records the close, `GET /events?...` returns queued
    `{ kind: 'press', id, key }` events once, then `{ events: [] }`.
  - After opening, `await clock.settle()` so the unawaited load publishes, then
    check the last panel (`tileId`, `plugin`, `id`, `title`, primary buttons).
  - Queue a press, `await clock.advance(20)`, then check the state and the
    republished tree. A press to another panel id changes nothing.
  - `$.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })`
    needs a test stub `on('session.end', (_, e) => ({ sessionId: e.sessionId }))`;
    then expect a `/panels/close` for the panel.

## Try it in Yira

`npm run dev` in the Yira repo, open an agent terminal, run
`claude --plugin-dir <this repo>\<mod>`, open the mod's UI and check that the
panel shows in the Mods tab and that its buttons act like the pane's.
