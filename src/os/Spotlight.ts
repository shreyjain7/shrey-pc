import { apps } from './apps';
import type { AppDefinition } from './WindowManager';
import { fileIcon } from './apps/Explorer';
import { basename, fs, HOME } from './fs';
import { el } from './ui';

/**
 * Spotlight: ⌘Space, a field over the middle of the desktop.
 *
 * It searches the two things this machine has — the app registry and the
 * virtual disk — and opens whatever is selected. The list is reconciled rather
 * than rebuilt on every keystroke: this sits inside the CSS3D projection,
 * where replacing a dozen rows per character re-rasters the whole surface.
 */

interface Hit {
  key: string;
  icon: string;
  label: string;
  detail: string;
  open: () => void;
}

const LIMIT = 8;

export class Spotlight {
  readonly element: HTMLElement;

  private readonly field: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly rows: HTMLButtonElement[] = [];
  private hits: Hit[] = [];
  private cursor = 0;

  constructor(
    private onOpenApp: (app: AppDefinition) => void,
    private onOpenPath: (path: string) => void,
  ) {
    this.element = el('div', 'spotlight');

    const panel = el('div', 'spotlight__panel');

    const bar = el('div', 'spotlight__bar');
    bar.append(el('span', 'spotlight__glyph', '⌕'));

    this.field = el('input', 'spotlight__field');
    this.field.type = 'text';
    this.field.spellcheck = false;
    this.field.placeholder = 'Spotlight Search';
    bar.append(this.field);

    this.list = el('div', 'spotlight__list');
    panel.append(bar, this.list);
    this.element.append(panel);

    this.field.addEventListener('input', () => this.search());
    this.field.addEventListener('keydown', (event) => this.onKey(event));

    // Anywhere off the panel dismisses, the way clicking past Spotlight does.
    this.element.addEventListener('pointerdown', (event) => {
      if (!(event.target as HTMLElement).closest('.spotlight__panel')) this.close();
    });
  }

  get isOpen() {
    return this.element.classList.contains('is-open');
  }

  open() {
    if (this.isOpen) return;
    this.element.classList.add('is-open');
    this.field.value = '';
    this.search();
    // The field has to be focused after the layer is displayed, or the caret
    // lands nowhere.
    requestAnimationFrame(() => this.field.focus());
  }

  close() {
    if (!this.isOpen) return;
    this.element.classList.remove('is-open');
    this.field.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private onKey(event: KeyboardEvent) {
    // Everything typed here belongs to Spotlight, not to the shell's shortcuts.
    event.stopPropagation();

    if (event.key === 'Escape' || (event.code === 'Space' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.hits.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.cursor = (this.cursor + step + this.hits.length) % this.hits.length;
      this.mark();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.run(this.cursor);
    }
  }

  private search() {
    const query = this.field.value.trim().toLowerCase();
    this.hits = query ? this.gather(query) : [];
    this.cursor = 0;
    this.render(query);
  }

  private gather(query: string): Hit[] {
    const hits: Hit[] = [];

    for (const app of apps) {
      if (!app.title.toLowerCase().includes(query)) continue;
      hits.push({
        key: 'app:' + app.id,
        icon: app.icon,
        label: app.title,
        detail: 'Application',
        open: () => this.onOpenApp(app),
      });
    }

    for (const path of fs.find(query, HOME).slice(0, LIMIT)) {
      const node = fs.get(path);
      if (!node) continue;
      hits.push({
        key: 'file:' + path,
        icon: fileIcon(node),
        label: basename(path),
        detail: path,
        open: () => this.onOpenPath(path),
      });
    }

    return hits.slice(0, LIMIT);
  }

  /**
   * Reconciles rows in place — grow the pool when it is short, hide the tail
   * when it is long — so a keystroke rewrites text rather than the DOM.
   */
  private render(query: string) {
    while (this.rows.length < this.hits.length) {
      const index = this.rows.length;
      const row = el('button', 'spotlight__row');
      row.type = 'button';
      row.append(
        el('span', 'spotlight__icon'),
        el('span', 'spotlight__label'),
        el('span', 'spotlight__detail'),
      );
      row.addEventListener('click', () => this.run(index));
      row.addEventListener('pointerenter', () => {
        this.cursor = index;
        this.mark();
      });
      this.rows.push(row);
      this.list.append(row);
    }

    this.rows.forEach((row, index) => {
      const hit = this.hits[index];
      row.hidden = !hit;
      if (!hit) return;

      const icon = row.children[0] as HTMLElement;
      const label = row.children[1] as HTMLElement;
      const detail = row.children[2] as HTMLElement;

      if (icon.dataset.key !== hit.key) {
        icon.innerHTML = hit.icon;
        icon.dataset.key = hit.key;
      }
      if (label.textContent !== hit.label) label.textContent = hit.label;
      if (detail.textContent !== hit.detail) detail.textContent = hit.detail;
    });

    this.element.classList.toggle('has-results', this.hits.length > 0);
    this.element.classList.toggle('is-empty', Boolean(query) && !this.hits.length);
    this.mark();
  }

  private mark() {
    this.rows.forEach((row, index) => row.classList.toggle('is-active', index === this.cursor));
  }

  private run(index: number) {
    const hit = this.hits[index];
    if (!hit) return;
    this.close();
    hit.open();
  }
}
