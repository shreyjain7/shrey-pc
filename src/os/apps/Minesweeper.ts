import { el } from '../ui';

interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  around: number;
}

const LEVELS = {
  beginner: { cols: 9, rows: 9, mines: 10 },
  intermediate: { cols: 14, rows: 12, mines: 26 },
  expert: { cols: 20, rows: 14, mines: 52 },
};

type LevelName = keyof typeof LEVELS;

/** The classic. First click is always safe, chording included. */
export function createMinesweeper(): HTMLElement {
  const root = el('div', 'mines');

  let level: LevelName = 'beginner';
  let cols = 0;
  let rows = 0;
  let mineCount = 0;
  let grid: Cell[] = [];
  let started = false;
  let over = false;
  let won = false;
  let elapsed = 0;
  let timer = 0;

  const bar = el('div', 'mines__bar');
  const flagsLabel = el('span', 'mines__counter', '000');
  const face = el('button', 'mines__face', '🙂');
  face.type = 'button';
  const timeLabel = el('span', 'mines__counter', '000');

  const select = el('select', 'mines__level');
  for (const name of Object.keys(LEVELS) as LevelName[]) {
    const option = el('option', undefined, name[0].toUpperCase() + name.slice(1));
    option.value = name;
    select.append(option);
  }

  bar.append(flagsLabel, face, timeLabel, select);

  const board = el('div', 'mines__board');
  const status = el('div', 'mines__status', 'Left click to reveal · right click to flag');

  root.append(bar, board, status);

  /* ---------------------------------------------------------------------- */

  const index = (x: number, y: number) => y * cols + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;

  function neighbours(x: number, y: number) {
    const result: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        if (inside(x + dx, y + dy)) result.push(index(x + dx, y + dy));
      }
    }
    return result;
  }

  function reset() {
    const config = LEVELS[level];
    cols = config.cols;
    rows = config.rows;
    mineCount = config.mines;

    grid = Array.from({ length: cols * rows }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      around: 0,
    }));

    started = false;
    over = false;
    won = false;
    elapsed = 0;
    window.clearInterval(timer);

    face.textContent = '🙂';
    status.textContent = 'Left click to reveal · right click to flag';
    board.style.setProperty('--cols', String(cols));
    render();
  }

  /** Mines are laid after the first click so it can never lose immediately. */
  function layMines(safe: number) {
    const forbidden = new Set([safe, ...neighboursOf(safe)]);
    let placed = 0;

    while (placed < mineCount) {
      const spot = Math.floor(Math.random() * grid.length);
      if (grid[spot].mine || forbidden.has(spot)) continue;
      grid[spot].mine = true;
      placed += 1;
    }

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cell = grid[index(x, y)];
        cell.around = neighbours(x, y).filter((i) => grid[i].mine).length;
      }
    }
  }

  function neighboursOf(i: number) {
    return neighbours(i % cols, Math.floor(i / cols));
  }

  function startTimer() {
    timer = window.setInterval(() => {
      elapsed = Math.min(elapsed + 1, 999);
      render();
    }, 1000);
  }

  function reveal(i: number) {
    const cell = grid[i];
    if (cell.revealed || cell.flagged) return;

    cell.revealed = true;

    if (cell.mine) {
      lose();
      return;
    }

    // Flood-fill outward from any cell with no mines touching it.
    if (cell.around === 0) {
      const queue = neighboursOf(i);
      while (queue.length) {
        const next = queue.pop()!;
        const target = grid[next];
        if (target.revealed || target.flagged || target.mine) continue;
        target.revealed = true;
        if (target.around === 0) queue.push(...neighboursOf(next));
      }
    }
  }

  /** Click a satisfied number to open its remaining neighbours. */
  function chord(i: number) {
    const cell = grid[i];
    if (!cell.revealed || cell.around === 0) return;

    const around = neighboursOf(i);
    const flags = around.filter((n) => grid[n].flagged).length;
    if (flags !== cell.around) return;

    for (const n of around) if (!grid[n].flagged) reveal(n);
  }

  function lose() {
    over = true;
    face.textContent = '💀';
    status.textContent = 'Boom. Click the face to try again.';
    window.clearInterval(timer);
    for (const cell of grid) if (cell.mine) cell.revealed = true;
  }

  function checkWin() {
    if (over) return;
    const hidden = grid.filter((cell) => !cell.revealed).length;
    if (hidden !== mineCount) return;

    over = true;
    won = true;
    face.textContent = '😎';
    status.textContent = 'Cleared in ' + elapsed + 's.';
    window.clearInterval(timer);
    for (const cell of grid) if (cell.mine) cell.flagged = true;
  }

  function pad(value: number) {
    return String(Math.max(0, Math.min(999, value))).padStart(3, '0');
  }

  function render() {
    const flags = grid.filter((cell) => cell.flagged).length;
    flagsLabel.textContent = pad(mineCount - flags);
    timeLabel.textContent = pad(elapsed);

    board.replaceChildren();
    board.classList.toggle('is-over', over);

    grid.forEach((cell, i) => {
      const node = el('button', 'mines__cell');
      node.type = 'button';

      if (cell.revealed) {
        node.classList.add('is-open');
        if (cell.mine) {
          node.classList.add('is-mine');
          node.textContent = '✳';
        } else if (cell.around > 0) {
          node.textContent = String(cell.around);
          node.dataset.n = String(cell.around);
        }
      } else if (cell.flagged) {
        node.classList.add('is-flag');
        node.textContent = '⚑';
      }

      node.addEventListener('click', () => {
        if (over) return;
        if (!started) {
          started = true;
          layMines(i);
          startTimer();
        }
        if (grid[i].revealed) chord(i);
        else reveal(i);
        checkWin();
        render();
      });

      node.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (over || cell.revealed) return;
        cell.flagged = !cell.flagged;
        render();
      });

      board.append(node);
    });

    void won;
  }

  face.addEventListener('click', reset);
  select.addEventListener('change', () => {
    level = select.value as LevelName;
    reset();
  });

  root.addEventListener('app:destroy', () => window.clearInterval(timer));

  reset();
  return root;
}
