import { WORDS, WORD_SET } from '../../data/words';
import { telemetry } from '../../world/telemetry';
import { el } from '../ui';

/**
 * Wordle.
 *
 * Six guesses at a five-letter word. The only part worth being careful about
 * is duplicate letters: scoring each position independently marks both L's in
 * "SPELL" yellow when the answer holds only one, so the pass below spends a
 * letter budget — exact matches claim their letter first, and only what
 * survives that pass can come back yellow.
 */

const ROWS = 6;
const COLS = 5;
const STATS_KEY = 'shrey-pc:wordle:v1';

type Mark = 'correct' | 'present' | 'absent';

interface Stats {
  played: number;
  wins: number;
  streak: number;
  best: number;
  distribution: number[];
}

function loadStats(): Stats {
  const empty: Stats = { played: 0, wins: 0, streak: 0, best: 0, distribution: Array(ROWS).fill(0) };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return {
      played: parsed.played ?? 0,
      wins: parsed.wins ?? 0,
      streak: parsed.streak ?? 0,
      best: parsed.best ?? 0,
      distribution: parsed.distribution?.length === ROWS ? parsed.distribution : empty.distribution,
    };
  } catch {
    return empty;
  }
}

function saveStats(stats: Stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Private browsing; the game still plays, the record just doesn't survive.
  }
}

/** Scores one guess against the answer, spending each answer letter once. */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(COLS).fill('absent');
  const budget = new Map<string, number>();

  for (let i = 0; i < COLS; i += 1) {
    if (guess[i] === answer[i]) marks[i] = 'correct';
    else budget.set(answer[i], (budget.get(answer[i]) ?? 0) + 1);
  }

  for (let i = 0; i < COLS; i += 1) {
    if (marks[i] === 'correct') continue;
    const left = budget.get(guess[i]) ?? 0;
    if (left > 0) {
      marks[i] = 'present';
      budget.set(guess[i], left - 1);
    }
  }

  return marks;
}

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function createWordle(): HTMLElement {
  const root = el('div', 'wordle');
  root.tabIndex = 0;

  let answer = '';
  let guesses: string[] = [];
  let current = '';
  let over = false;
  const keyState = new Map<string, Mark>();
  let stats = loadStats();

  const head = el('div', 'wordle__head');
  head.append(el('h2', 'wordle__title', 'Wordle'));
  const newGame = el('button', 'wordle__new', 'New game');
  newGame.type = 'button';
  head.append(newGame);
  root.append(head);

  const board = el('div', 'wordle__board');
  root.append(board);

  const message = el('div', 'wordle__message', '');
  root.append(message);

  const keyboard = el('div', 'wordle__keyboard');
  root.append(keyboard);

  const statsRow = el('div', 'wordle__stats');
  root.append(statsRow);

  /* ---------------------------------------------------------------------- */

  function reset() {
    answer = WORDS[Math.floor(Math.random() * WORDS.length)].toUpperCase();
    guesses = [];
    current = '';
    over = false;
    keyState.clear();
    message.textContent = '';
    message.className = 'wordle__message';
    render();
  }

  function say(text: string, kind?: 'win' | 'lose') {
    message.textContent = text;
    message.className = 'wordle__message' + (kind ? ' is-' + kind : '');
  }

  /** A letter's keyboard colour only ever improves: absent → present → correct. */
  function promote(letter: string, mark: Mark) {
    const rank = { absent: 0, present: 1, correct: 2 };
    const existing = keyState.get(letter);
    if (!existing || rank[mark] > rank[existing]) keyState.set(letter, mark);
  }

  function submit() {
    if (over) return;

    if (current.length < COLS) {
      say('Not enough letters');
      return;
    }

    if (!WORD_SET.has(current.toLowerCase())) {
      say('Not in word list');
      return;
    }

    const marks = scoreGuess(current, answer);
    for (let i = 0; i < COLS; i += 1) promote(current[i], marks[i]);

    guesses.push(current);
    const won = current === answer;
    current = '';

    // A guess is real work: spin the fans a little.
    telemetry.process(0.3);

    if (won || guesses.length === ROWS) {
      over = true;
      stats = { ...stats, played: stats.played + 1 };

      if (won) {
        stats.wins += 1;
        stats.streak += 1;
        stats.best = Math.max(stats.best, stats.streak);
        stats.distribution = stats.distribution.map((count, i) =>
          i === guesses.length - 1 ? count + 1 : count,
        );
        say(['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'][guesses.length - 1], 'win');
      } else {
        stats.streak = 0;
        say('The word was ' + answer, 'lose');
      }

      saveStats(stats);
    } else {
      say('');
    }

    render();
  }

  function type(letter: string) {
    if (over || current.length >= COLS) return;
    current += letter;
    say('');
    render();
  }

  function backspace() {
    if (over || !current.length) return;
    current = current.slice(0, -1);
    say('');
    render();
  }

  /* ---------------------------------------------------------------------- */

  function render() {
    board.replaceChildren();

    for (let row = 0; row < ROWS; row += 1) {
      const line = el('div', 'wordle__row');
      const guess = guesses[row];
      const marks = guess ? scoreGuess(guess, answer) : null;
      const pending = row === guesses.length ? current : '';

      for (let col = 0; col < COLS; col += 1) {
        const tile = el('div', 'wordle__tile');
        const letter = guess ? guess[col] : pending[col];

        if (letter) {
          tile.textContent = letter;
          tile.classList.add('is-filled');
        }

        if (marks) {
          tile.classList.add('is-' + marks[col]);
          // Stagger the reveal across the row, but only for the row that was
          // just submitted — replaying it on every render would re-run the
          // animation for the whole board on each keystroke.
          if (row === guesses.length - 1 && !over) {
            tile.style.animationDelay = col * 0.09 + 's';
            tile.classList.add('is-revealing');
          }
        }

        line.append(tile);
      }

      board.append(line);
    }

    keyboard.replaceChildren();

    for (const [index, letters] of KEY_ROWS.entries()) {
      const line = el('div', 'wordle__key-row');

      if (index === 2) {
        const enter = el('button', 'wordle__key wordle__key--wide', 'Enter');
        enter.type = 'button';
        enter.addEventListener('click', submit);
        line.append(enter);
      }

      for (const letter of letters) {
        const key = el('button', 'wordle__key', letter);
        key.type = 'button';
        const mark = keyState.get(letter);
        if (mark) key.classList.add('is-' + mark);
        key.addEventListener('click', () => type(letter));
        line.append(key);
      }

      if (index === 2) {
        const del = el('button', 'wordle__key wordle__key--wide', 'Del');
        del.type = 'button';
        del.addEventListener('click', backspace);
        line.append(del);
      }

      keyboard.append(line);
    }

    statsRow.replaceChildren();
    const rate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    for (const [label, value] of [
      ['Played', stats.played],
      ['Win %', rate],
      ['Streak', stats.streak],
      ['Best', stats.best],
    ] as Array<[string, number]>) {
      const cell = el('div', 'wordle__stat');
      cell.append(el('span', 'wordle__stat-value', String(value)));
      cell.append(el('span', 'wordle__stat-label', label));
      statsRow.append(cell);
    }
  }

  /* ---------------------------------------------------------------------- */

  root.addEventListener('keydown', (event) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      submit();
      return;
    }

    if (event.key === 'Backspace') {
      backspace();
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key)) type(event.key.toUpperCase());
  });

  // Clicking anywhere in the game takes keyboard focus back off the desktop.
  root.addEventListener('pointerdown', () => root.focus());

  newGame.addEventListener('click', () => {
    reset();
    root.focus();
  });

  reset();
  requestAnimationFrame(() => root.focus());

  return root;
}
