import { el } from '../ui';

type Op = '+' | '−' | '×' | '÷';

const KEYS: Array<{ label: string; kind: string; span?: number }> = [
  { label: 'C', kind: 'fn' },
  { label: '±', kind: 'fn' },
  { label: '%', kind: 'fn' },
  { label: '÷', kind: 'op' },
  { label: '7', kind: 'num' },
  { label: '8', kind: 'num' },
  { label: '9', kind: 'num' },
  { label: '×', kind: 'op' },
  { label: '4', kind: 'num' },
  { label: '5', kind: 'num' },
  { label: '6', kind: 'num' },
  { label: '−', kind: 'op' },
  { label: '1', kind: 'num' },
  { label: '2', kind: 'num' },
  { label: '3', kind: 'num' },
  { label: '+', kind: 'op' },
  { label: '0', kind: 'num', span: 2 },
  { label: '.', kind: 'num' },
  { label: '=', kind: 'eq' },
];

/** A plain four-function calculator, keyboard included. */
export function createCalculator(): HTMLElement {
  const root = el('div', 'calc');

  let current = '0';
  let stored: number | null = null;
  let operator: Op | null = null;
  /** After = or an operator, the next digit starts a fresh number. */
  let replace = true;

  const history = el('div', 'calc__history');
  const display = el('div', 'calc__display', '0');
  const pad = el('div', 'calc__pad');
  root.append(history, display, pad);

  const show = () => {
    // Long results get exponent form rather than overflowing the display.
    display.textContent = current.length > 12 ? Number(current).toExponential(6) : current;
    history.textContent =
      stored !== null && operator ? trim(stored) + ' ' + operator : '';
  };

  const trim = (value: number) =>
    Number.isFinite(value) ? String(Number(value.toFixed(10))) : 'Error';

  const apply = (a: number, b: number, op: Op) => {
    if (op === '+') return a + b;
    if (op === '−') return a - b;
    if (op === '×') return a * b;
    return b === 0 ? NaN : a / b;
  };

  const digit = (key: string) => {
    if (key === '.' && current.includes('.')) return;
    if (replace) {
      current = key === '.' ? '0.' : key;
      replace = false;
    } else {
      current = current === '0' && key !== '.' ? key : current + key;
    }
    show();
  };

  const setOperator = (op: Op) => {
    const value = Number(current);
    if (stored !== null && operator && !replace) {
      const result = apply(stored, value, operator);
      stored = result;
      current = trim(result);
    } else {
      stored = value;
    }
    operator = op;
    replace = true;
    show();
  };

  const equals = () => {
    if (stored === null || !operator) return;
    const result = apply(stored, Number(current), operator);
    current = trim(result);
    stored = null;
    operator = null;
    replace = true;
    show();
  };

  const press = (label: string) => {
    if (/^[0-9.]$/.test(label)) return digit(label);
    if (label === '+' || label === '−' || label === '×' || label === '÷') return setOperator(label);
    if (label === '=') return equals();

    if (label === 'C') {
      current = '0';
      stored = null;
      operator = null;
      replace = true;
      return show();
    }
    if (label === '±') {
      current = current.startsWith('-') ? current.slice(1) : '-' + current;
      return show();
    }
    if (label === '%') {
      current = trim(Number(current) / 100);
      return show();
    }
  };

  for (const key of KEYS) {
    const node = el('button', 'calc__key calc__key--' + key.kind, key.label);
    node.type = 'button';
    if (key.span) node.style.gridColumn = 'span ' + key.span;
    node.addEventListener('click', () => press(key.label));
    pad.append(node);
  }

  root.tabIndex = 0;
  root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const map: Record<string, string> = {
      '*': '×',
      x: '×',
      '/': '÷',
      '-': '−',
      Enter: '=',
      '=': '=',
      Escape: 'C',
      c: 'C',
    };

    if (event.key === 'Backspace') {
      current = current.length > 1 ? current.slice(0, -1) : '0';
      show();
      return;
    }

    const label = map[event.key] ?? event.key;
    if (/^[0-9.]$/.test(label) || ['+', '−', '×', '÷', '=', 'C'].includes(label)) {
      event.preventDefault();
      press(label);
    }
  });

  // Focus so the keyboard works the moment the window opens.
  window.setTimeout(() => root.focus(), 240);

  show();
  return root;
}
