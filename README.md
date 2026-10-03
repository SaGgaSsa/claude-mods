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
/plugin install trivia@claude-mods
/reload-plugins
```

Or from a shell:

```
claude plugin marketplace add SaGgaSsa/claude-mods
claude plugin install sudoku@claude-mods
claude plugin install trivia@claude-mods
```

### From a local clone

```
git clone git@github.com:SaGgaSsa/claude-mods.git
/plugin marketplace add ./claude-mods
/plugin install sudoku@claude-mods
/plugin install trivia@claude-mods
/reload-plugins
```

### Update and remove

```
/plugin marketplace update claude-mods
/plugin uninstall sudoku@claude-mods
/plugin uninstall trivia@claude-mods
```

`/plugin` opens the plugin manager, where you can also enable, disable or update each mod.

### Try a mod without installing it

```
claude --plugin-dir ./sudoku
claude --plugin-dir ./trivia
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

- Questions come until the first wrong answer; each right answer adds one to the
  streak. The difficulty climbs with the streak, with some randomness: mostly easy
  at first (with the odd hard one), mostly hard past 20. No more than 3 hard or 4
  easy questions come in a row, and the draw also leans away from a difficulty
  whose questions are running out, so easy, medium and hard run out together.
  The weights live in `TRIVIA_CONFIG` in `trivia/hooks/trivia.ts`.
- No question comes back until you have seen every other one: answered
  questions are remembered across games and sessions, and the cycle starts over
  once the whole pool has been seen.
- When a game ends, the right answer is revealed, then a final screen shows the
  streak, the question you missed, a bar chart of the last games and a centered
  `New game` button. The last 10 games and the best streak are kept across
  sessions.
- Click an answer box to lock it in. After a short suspense the right answer
  turns green and a wrong pick red.
- Clawd hosts: it bounces and waves while the question types itself out, then
  reacts to your answer. The answers appear one by one; the board
  keeps the terminal's own background.
- It ships with 1000 questions from [The Trivia API](https://the-trivia-api.com/)
  (CC BY-NC 4.0): 100 per category across ten categories (general knowledge,
  geography, history, science, sport, music, film & TV, arts & literature,
  society & culture, food & drink), each split 35% easy, 40% medium, 25% hard.
  Only universal questions are kept: none tied to a region, none marked niche,
  and none about US or UK states, presidents, leagues or TV. Answers are at most
  40 characters and questions at most 200, so they fit the boxes.

### Changing the questions

`trivia/questions.json` uses the format the Open Trivia DB API returns, so it can
be edited by hand. To top it up from The Trivia API (Windows, from the repo root):

```
powershell -ExecutionPolicy Bypass -File trivia/scripts/fetch-trivia-api.ps1
```

It keeps the questions that still pass the rules above and fetches only what each
category and difficulty is missing; `-Fresh` rebuilds the bank from scratch.
`-PerCategory <n>` changes how many questions each category gets (the bank is
capped at 1000). `trivia/scripts/fetch-questions.ps1` adds questions from
[Open Trivia DB](https://opentdb.com/) instead; it skips duplicates, refuses to
run on a full bank, and its questions lean on US topics and niche fandoms.
Restart Claude Code or run `/reload-plugins` to load the changes.

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
