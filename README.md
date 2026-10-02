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

- Easy, medium and hard difficulty aim for 40, 32 and 26 given numbers; every
  puzzle has a unique solution.
- Opening `/sudoku` without a saved game, or clicking `New game`, shows the
  difficulty picker (`e`, `m`, `h`). Press `c` to cancel and keep the current
  game.
- The board scales with the pane. Its controls card shows the difficulty, filled
  cells and conflicts on the same warm paper and wood colors as the board.
- Click the board to give it the keyboard: arrows (or `w` `a` `s` `d`) move,
  `1`–`9` write a digit, `0`/Backspace/Delete clear it, Esc hands the keys back.
  While the board has them, no key reaches the prompt.
- Click a number tile under the board to enter that digit; click `0 Clear` to
  erase the selected cell, or `New game` to open the difficulty picker.
- Givens can't be changed; repeated digits turn red.
- The board uses a cream background, a brown frame, and warm colors for givens,
  entries, the selected cell and matching digits.

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
