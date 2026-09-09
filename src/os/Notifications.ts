import { el } from './ui';

let host: HTMLElement | null = null;

export function mountNotifications(parent: HTMLElement) {
  host = el('div', 'toasts');
  parent.append(host);
  return host;
}

/** A transient toast above the taskbar. Stacks, auto-dismisses, click to close. */
export function notify(title: string, message?: string, timeout = 3600) {
  if (!host) return;

  const toast = el('div', 'toast');
  toast.append(el('span', 'toast__title', title));
  if (message) toast.append(el('span', 'toast__message', message));

  const dismiss = () => {
    toast.classList.remove('is-in');
    // Let the exit transition finish before it leaves the flow.
    window.setTimeout(() => toast.remove(), 220);
  };

  toast.addEventListener('click', dismiss);
  host.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-in'));
  window.setTimeout(dismiss, timeout);

  // Never let a burst of toasts fill the screen.
  while (host.children.length > 4) host.firstElementChild?.remove();
}
