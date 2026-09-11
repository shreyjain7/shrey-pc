import { el } from './ui';

/**
 * The menu bar's drop-down menus.
 *
 * Two things make these feel like the real thing rather than a row of
 * buttons. Once one menu is open, sliding along the bar switches between them
 * without another click. And the whole menu refuses to take focus — every
 * pointerdown inside it is defaulted away — so the text field you were typing
 * in is still the focused element when Edit ▸ Copy finally runs.
 *
 * Items are asked for at the moment of opening, never cached, so a menu always
 * describes the window that is actually in front.
 */

export interface BarItem {
  label?: string;
  /** Right-aligned hint, e.g. '⌘W'. Purely a label — the keys are bound elsewhere. */
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
}

export interface BarMenu {
  /** Read at every refresh, so the app menu can follow the focused window. */
  title: () => string;
  /** The app menu is set in bold, the way macOS sets the frontmost app. */
  bold?: boolean;
  items: () => BarItem[];
}

export class MenuBar {
  /** The row of titles, for the caller to place in its bar. */
  readonly element: HTMLElement;

  private readonly titles: HTMLButtonElement[] = [];
  private readonly panel: HTMLElement;
  private openIndex = -1;

  /**
   * @param layer  where the drop-down is positioned — the menus are absolutely
   *               placed in this element's coordinate space, not the bar's.
   * @param onOpen called before a menu opens, so the shell can shut whatever
   *               else it has hanging open.
   */
  constructor(
    private layer: HTMLElement,
    private menus: BarMenu[],
    private onOpen: () => void = () => {},
    private onSound: () => void = () => {},
  ) {
    this.element = el('div', 'menubar__menus');
    this.panel = el('div', 'mbmenu');
    this.layer.append(this.panel);

    this.menus.forEach((menu, index) => {
      const title = el('button', 'menubar__menu');
      title.type = 'button';
      if (menu.bold) title.classList.add('menubar__menu--app');
      title.textContent = menu.title();

      // Keep the caret where it was: this is what lets Edit ▸ Copy act on the
      // field the pointer just left.
      title.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.openIndex === index) this.close();
        else this.open(index);
      });

      // Already open? Then sliding along the bar walks the menus.
      title.addEventListener('pointerenter', () => {
        if (this.openIndex !== -1 && this.openIndex !== index) this.open(index);
      });

      this.titles.push(title);
      this.element.append(title);
    });

    this.panel.addEventListener('pointerdown', (event) => event.preventDefault());
  }

  /** Re-read the titles — the app menu is named after the frontmost window. */
  refresh() {
    this.menus.forEach((menu, index) => {
      const next = menu.title();
      if (this.titles[index].textContent !== next) this.titles[index].textContent = next;
    });
  }

  get isOpen() {
    return this.openIndex !== -1;
  }

  close() {
    if (this.openIndex === -1) return;
    this.titles[this.openIndex].classList.remove('is-open');
    this.openIndex = -1;
    this.panel.classList.remove('is-open');
    this.panel.replaceChildren();
  }

  private open(index: number) {
    const wasOpen = this.openIndex !== -1;
    if (!wasOpen) this.onOpen();
    if (this.openIndex !== -1) this.titles[this.openIndex].classList.remove('is-open');

    this.openIndex = index;
    this.titles[index].classList.add('is-open');
    this.onSound();

    this.panel.replaceChildren();
    for (const item of this.menus[index].items()) this.panel.append(this.render(item));

    // Anchor under its own title, pulled back inside the layer at the far end.
    const title = this.titles[index];
    const bar = title.offsetParent as HTMLElement | null;
    const left = title.offsetLeft + (bar?.offsetLeft ?? 0);
    const top = (bar?.offsetHeight ?? 30) + (bar?.offsetTop ?? 0);

    this.panel.style.visibility = 'hidden';
    this.panel.style.left = '0px';
    this.panel.style.top = top + 'px';
    this.panel.classList.add('is-open');

    const maxLeft = this.layer.offsetWidth - this.panel.offsetWidth - 6;
    this.panel.style.left = Math.max(6, Math.min(left, maxLeft)) + 'px';
    this.panel.style.visibility = '';
  }

  private render(item: BarItem) {
    if (item.separator) return el('div', 'mbmenu__separator');

    const node = el('button', 'mbmenu__item');
    node.type = 'button';
    node.disabled = Boolean(item.disabled);

    node.append(
      el('span', 'mbmenu__tick', item.checked ? '✓' : ''),
      el('span', 'mbmenu__label', item.label ?? ''),
      el('span', 'mbmenu__key', item.shortcut ?? ''),
    );

    node.addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
      item.action?.();
    });

    return node;
  }
}
