# claude-mods

[Claude Code mods](https://claude.com/blog/claude-code-mods) by SaGgaSsa.

Install the marketplace once, then any mod from it:

```
/plugin marketplace add SaGgaSsa/claude-mods
/plugin install <mod>@claude-mods
/reload-plugins
```

## sudoku

A sudoku in a pane. Each workspace folder keeps its own game, so you can leave and
pick it up the next time you open Claude Code there.

```
/sudoku
```

- Medium difficulty (about 32 givens), always with a unique solution.
- Click the board to give it the keyboard: arrows (or `w` `a` `s` `d`) move,
  `1`–`9` write a digit, `0`/Backspace/Delete clear it, Esc hands the keys back.
  While the board has them, no key reaches the prompt.
- The keypad and arrow buttons under the board work with the mouse too.
- Givens can't be changed; repeated digits turn red.
- `n` starts a new game (replaces the current one).

## Adding a mod

1. Create `<mod>/` with `.claude-plugin/plugin.json`, `hooks/hooks.json` and
   `hooks/register.ts(x)` (plus `types/index.d.ts` if it keeps `$.state`).
2. Add it to `plugins` in `.claude-plugin/marketplace.json`.
3. Add a section to this README.

## Develop

```
claude plugin validate ./<mod>
claude plugin test ./<mod>
claude --plugin-dir ./<mod>
```
