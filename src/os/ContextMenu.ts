import { el } from './ui';

export interface MenuItem {
  label?: string;
  icon?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

let open: HTMLElement | null = null;

export function closeContextMenu() {
  open?.remove();
  open = null;
}

/**
 * Right-click menu, positioned in the host's coordinate space and nudged back
 * inside its bounds when it would otherwise run off an edge.
 */
export function openContextMenu(
  host: HTMLElement,
  x: number,
  y: number,
  items: MenuItem[],
) {
  closeContextMenu();

  const menu = el('div', 'menu');

  for (const item of items) {
    if (item.separator) {
      menu.append(el('div', 'menu__separator'));
      continue;
    }

    const entry = el('button', 'menu__item');
    entry.type = 'button';
    entry.disabled = Boolean(item.disabled);

    const icon = el('span', 'menu__icon');
    if (item.icon) icon.innerHTML = item.icon;
    entry.append(icon, document.createTextNode(item.label ?? ''));

    entry.addEventListener('click', (event) => {
      event.stopPropagation();
      closeContextMenu();
      item.action?.();
    });

    menu.append(entry);
  }

  // Measure off-screen before deciding which way to open.
  menu.style.visibility = 'hidden';
  menu.style.left = '0px';
  menu.style.top = '0px';
  host.append(menu);

  const hostBox = host.getBoundingClientRect();
  const scale = hostBox.width / (host.offsetWidth || 1) || 1;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;

  const maxX = host.offsetWidth - width - 6;
  const maxY = host.offsetHeight - height - 6;

  menu.style.left = Math.max(6, Math.min(x, maxX)) + 'px';
  menu.style.top = Math.max(6, Math.min(y, maxY)) + 'px';
  menu.style.visibility = 'visible';
  void scale;

  open = menu;

  // Any click elsewhere dismisses it; capture so it beats other handlers.
  const dismiss = (event: Event) => {
    if (!menu.contains(event.target as Node)) {
      closeContextMenu();
      document.removeEventListener('pointerdown', dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);

  return menu;
}
