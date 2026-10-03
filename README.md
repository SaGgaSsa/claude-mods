# claude-mods

[Claude Code mods](https://claude.com/blog/claude-code-mods) by SaGgaSsa.

Mods are plugins of function hooks that run inside Claude Code. This repository is a
plugin marketplace: add it once, then install the mods you want.

## Install

### From GitHub

Inside Claude Code:

```
/plugin marketplace add SaGgaSsa/claude-mods
/plugin install sudoku@claude-mods
/reload-plugins
```

Or from a shell:

```
claude plugin marketplace add SaGgaSsa/claude-mods
claude plugin install sudoku@claude-mods
```

### From a local clone

```
git clone git@github.com:SaGgaSsa/claude-mods.git
/plugin marketplace add ./claude-mods
/plugin install sudoku@claude-mods
/reload-plugins
```

### Update and remove

```
/plugin marketplace update claude-mods
/plugin uninstall sudoku@claude-mods
```

`/plugin` opens the plugin manager, where you can also enable, disable or update each mod.

### Try a mod without installing it

```
claude --plugin-dir ./sudoku
```

The mod loads for that session only and reloads when its files change.

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
- Givens can't be changed; digits that repeat in a row, column or box turn red.
- The board uses a cream background, a brown frame, and warm colors for givens,
  entries, the selected cell and matching digits.

## trivia

A multiple-choice streak game in the band above the prompt, played only with clicks.

```
/trivia            # show or hide the band (also /trivia on, /trivia off)
```

- Questions come at random from the whole pool, without repeats, until the first
  wrong answer. Each right answer adds one to the streak.
- When a game ends, the right answer is revealed, then a final screen shows the
  streak, the question you missed, a bar chart of the last games and a centered
  `New game` button. The last 10 games and the best streak are kept across
  sessions.
- Click an answer box to lock it in. After a short suspense the right answer
  turns green and a wrong pick red.
- Clawd hosts: it bounces and waves while the question types itself out, then
  reacts to your answer. The answers appear one by one; the board
  keeps the terminal's own background.
- Questions come from `trivia/questions.json`, in the format the
  [Open Trivia DB](https://opentdb.com/) API returns. HTML entities are decoded
  and true/false questions are skipped.
- To add questions from the API (up to 50 per batch, duplicates skipped), from
  the repo root on Windows:

  ```
  powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-questions.ps1 -Batches 4
  ```

  `-Category <id>` and `-Difficulty easy|medium|hard` filter them. The bank is
  capped at 1000 questions: the script stops there and refuses to run on a
  full bank. Restart
  Claude Code or run `/reload-plugins` to load the new questions.

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
