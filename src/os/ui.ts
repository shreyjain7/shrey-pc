/** Small DOM helpers shared by every app, so none of them re-invent this. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, className: string, onClick: () => void) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export const svg = (paths: string) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  paths +
  '</svg>';

/** A modal prompt that works inside the CRT, where window.prompt cannot. */
export function askForName(
  host: HTMLElement,
  title: string,
  initial: string,
  onConfirm: (value: string) => void,
) {
  const backdrop = el('div', 'dialog-backdrop');
  const dialog = el('div', 'dialog');

  dialog.append(el('h2', 'dialog__title', title));

  const input = el('input', 'dialog__input');
  input.type = 'text';
  input.value = initial;
  input.spellcheck = false;
  dialog.append(input);

  const row = el('div', 'dialog__row');
  const close = () => backdrop.remove();

  const confirm = () => {
    const value = input.value.trim();
    if (value) onConfirm(value);
    close();
  };

  row.append(
    button('Cancel', 'dialog__button', close),
    button('OK', 'dialog__button dialog__button--primary', confirm),
  );
  dialog.append(row);

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') confirm();
    if (event.key === 'Escape') close();
  });

  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) close();
  });

  backdrop.append(dialog);
  host.append(backdrop);

  requestAnimationFrame(() => {
    input.focus();
    // Select the stem, not the extension, like a real rename box.
    const dot = input.value.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  });

  return backdrop;
}

/** Confirmation dialog, same shell as askForName. */
export function confirmAction(
  host: HTMLElement,
  title: string,
  message: string,
  onConfirm: () => void,
) {
  const backdrop = el('div', 'dialog-backdrop');
  const dialog = el('div', 'dialog');

  dialog.append(el('h2', 'dialog__title', title));
  dialog.append(el('p', 'dialog__message', message));

  const row = el('div', 'dialog__row');
  const close = () => backdrop.remove();

  row.append(
    button('Cancel', 'dialog__button', close),
    button('OK', 'dialog__button dialog__button--primary', () => {
      onConfirm();
      close();
    }),
  );
  dialog.append(row);

  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) close();
  });

  backdrop.append(dialog);
  host.append(backdrop);
  return backdrop;
}

export function formatBytes(value: number) {
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
  return (value / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
