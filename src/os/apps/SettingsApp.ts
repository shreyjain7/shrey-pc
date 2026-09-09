import { profile } from '../../data/cv';
import { fs } from '../fs';
import { notify } from '../Notifications';
import { ACCENTS, settings, WALLPAPERS, type SettingsState } from '../settings';
import { screenRoot } from '../system';
import { confirmAction, el } from '../ui';

/** Control panel: appearance, effects and storage. Changes apply immediately. */
export function createSettings(): HTMLElement {
  const root = el('div', 'settings');

  // Declared up front: the toggle() calls below run before the end of this
  // function body, and would otherwise hit the temporal dead zone.
  const toggles: Array<{ key: keyof SettingsState; input: HTMLInputElement }> = [];

  /* --- appearance -------------------------------------------------------- */

  const appearance = section('Appearance');

  const wallpaperRow = el('div', 'settings__wallpapers');
  for (const wallpaper of WALLPAPERS) {
    const option = el('button', 'settings__wallpaper');
    option.type = 'button';
    option.title = wallpaper.label;
    option.style.background = wallpaper.css;
    option.classList.toggle('is-active', settings.state.wallpaper === wallpaper.id);
    option.addEventListener('click', () => {
      settings.set('wallpaper', wallpaper.id);
      syncWallpapers();
    });
    option.append(el('span', 'settings__wallpaper-label', wallpaper.label));
    wallpaperRow.append(option);
  }
  appearance.append(field('Wallpaper', wallpaperRow));

  const accentRow = el('div', 'settings__accents');
  for (const accent of ACCENTS) {
    const option = el('button', 'settings__accent');
    option.type = 'button';
    option.title = accent.label;
    option.style.background = accent.value;
    option.classList.toggle('is-active', settings.state.accent === accent.id);
    option.addEventListener('click', () => {
      settings.set('accent', accent.id);
      syncAccents();
    });
    accentRow.append(option);
  }
  appearance.append(field('Accent', accentRow));

  function syncWallpapers() {
    [...wallpaperRow.children].forEach((node, index) => {
      node.classList.toggle('is-active', WALLPAPERS[index].id === settings.state.wallpaper);
    });
  }

  function syncAccents() {
    [...accentRow.children].forEach((node, index) => {
      node.classList.toggle('is-active', ACCENTS[index].id === settings.state.accent);
    });
  }

  /* --- effects ----------------------------------------------------------- */

  const effects = section('Display & sound');
  effects.append(
    toggle('Scanlines', 'scanlines'),
    toggle('Screen flicker', 'flicker'),
    toggle('Key click sounds', 'keySounds'),
    toggle('24-hour clock', 'clock24'),
  );

  /* --- storage ----------------------------------------------------------- */

  const storage = section('Storage');
  const usage = el('p', 'settings__note');

  const refreshUsage = () => {
    let bytes = 0;
    try {
      bytes = (localStorage.getItem('shrey-pc:fs:v1') ?? '').length;
    } catch {
      bytes = 0;
    }
    usage.textContent =
      bytes > 0
        ? 'Your files use about ' + (bytes / 1024).toFixed(1) + ' KB in this browser.'
        : 'Nothing saved yet. Files you create are stored in this browser only.';
  };
  refreshUsage();

  const resetFiles = el('button', 'settings__button', 'Reset filesystem');
  resetFiles.type = 'button';
  resetFiles.addEventListener('click', () => {
    confirmAction(
      screenRoot(),
      'Reset filesystem',
      'This deletes every file you have created and restores the shipped disk. Continue?',
      () => {
        fs.reset();
        refreshUsage();
        notify('Filesystem reset', 'The disk is back to its shipped state.');
      },
    );
  });

  const resetPrefs = el('button', 'settings__button', 'Reset preferences');
  resetPrefs.type = 'button';
  resetPrefs.addEventListener('click', () => {
    settings.reset();
    syncWallpapers();
    syncAccents();
    syncToggles();
    notify('Preferences reset');
  });

  const buttons = el('div', 'settings__buttons');
  buttons.append(resetFiles, resetPrefs);
  storage.append(usage, buttons);

  /* --- about ------------------------------------------------------------- */

  const about = section('About');
  const table = el('dl', 'settings__about');
  const rows: Array<[string, string]> = [
    ['System', 'shrey-os 1.0'],
    ['Machine', 'shrey-pc (CRT 4:3)'],
    ['User', profile.name],
    ['Role', profile.role],
    ['Renderer', 'three.js + CSS3DRenderer'],
  ];
  for (const [key, value] of rows) {
    table.append(el('dt', undefined, key), el('dd', undefined, value));
  }
  about.append(table);

  root.append(appearance, effects, storage, about);

  /* ---------------------------------------------------------------------- */

  function toggle(label: string, key: keyof SettingsState) {
    const row = el('label', 'settings__toggle');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = Boolean(settings.state[key]);
    input.addEventListener('change', () => settings.set(key, input.checked as never));

    row.append(input, el('span', undefined, label));
    toggles.push({ key, input });
    return row;
  }

  function syncToggles() {
    for (const entry of toggles) entry.input.checked = Boolean(settings.state[entry.key]);
  }

  function section(title: string) {
    const node = el('section', 'settings__section');
    node.append(el('h2', 'settings__heading', title));
    return node;
  }

  function field(label: string, control: HTMLElement) {
    const row = el('div', 'settings__field');
    row.append(el('span', 'settings__label', label), control);
    return row;
  }

  const off = fs.on(refreshUsage);
  root.addEventListener('app:destroy', () => off());

  return root;
}
