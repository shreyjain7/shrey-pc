import { basename, fs, HOME, join } from '../fs';
import { notify } from '../Notifications';
import { openApp, registerOpener, screenRoot } from '../system';
import { askForName, el } from '../ui';

interface Instance {
  load: (path: string) => void;
}

let instance: Instance | null = null;

/** Open a file in the editor, starting it first if it is not running. */
export function edit(path: string) {
  if (!instance) openApp('notepad');
  instance?.load(path);
}

export function createNotepad(): HTMLElement {
  const root = el('div', 'notepad');

  let path: string | null = null;
  let saved = '';

  const bar = el('div', 'notepad__bar');
  const name = el('span', 'notepad__name', 'Untitled');
  const dirty = el('span', 'notepad__dirty', '●');

  const spacer = el('div', 'notepad__spacer');

  const saveButton = el('button', 'notepad__button', 'Save');
  saveButton.type = 'button';
  const saveAsButton = el('button', 'notepad__button', 'Save as…');
  saveAsButton.type = 'button';

  bar.append(name, dirty, spacer, saveAsButton, saveButton);

  const area = el('textarea', 'notepad__area');
  area.spellcheck = false;
  area.setAttribute('aria-label', 'Text editor');

  const status = el('div', 'notepad__status');

  root.append(bar, area, status);

  /* ---------------------------------------------------------------------- */

  function isDirty() {
    return area.value !== saved;
  }

  function refresh() {
    const readonly = path ? Boolean(fs.get(path)?.system) : false;
    area.readOnly = readonly;

    name.textContent = path ? basename(path) : 'Untitled';
    dirty.style.visibility = isDirty() && !readonly ? 'visible' : 'hidden';
    saveButton.disabled = readonly || !isDirty();

    const lines = area.value ? area.value.split('\n').length : 0;
    const words = area.value.trim() ? area.value.trim().split(/\s+/).length : 0;
    status.textContent =
      (readonly ? 'Read-only · ' : '') +
      lines +
      (lines === 1 ? ' line · ' : ' lines · ') +
      words +
      (words === 1 ? ' word · ' : ' words · ') +
      area.value.length +
      ' chars';
  }

  function load(next: string) {
    const content = fs.read(next);
    if (content === null) {
      notify('Cannot open', basename(next) + ' is not a text file.');
      return;
    }
    path = next;
    saved = content;
    area.value = content;
    refresh();
    area.focus();
  }

  function save() {
    if (!path) {
      saveAs();
      return;
    }
    if (fs.get(path)?.system) {
      notify('Read-only file', 'System files cannot be overwritten. Try Save as…');
      return;
    }
    if (fs.write(path, area.value)) {
      saved = area.value;
      refresh();
      notify('Saved', basename(path));
    } else {
      notify('Could not save', basename(path));
    }
  }

  function saveAs() {
    const suggestion = path ? basename(path) : fs.uniqueName(join(HOME, 'Documents'), 'Untitled', '.txt');
    askForName(screenRoot(), 'Save as', suggestion, (value) => {
      const target = join(HOME, 'Documents', value);
      if (fs.get(target)?.system) {
        notify('Name in use', 'That is a system file. Pick another name.');
        return;
      }
      if (fs.write(target, area.value)) {
        path = target;
        saved = area.value;
        refresh();
        notify('Saved', target);
      } else {
        notify('Could not save', value);
      }
    });
  }

  instance = { load };

  /* ---------------------------------------------------------------------- */

  area.addEventListener('input', refresh);
  saveButton.addEventListener('click', save);
  saveAsButton.addEventListener('click', saveAs);

  area.addEventListener('keydown', (event) => {
    // Keep the desktop's shortcuts out of the text area.
    event.stopPropagation();

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
      return;
    }

    // A real editor indents with Tab rather than leaving the field.
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = area.selectionStart;
      const end = area.selectionEnd;
      area.value = area.value.slice(0, start) + '  ' + area.value.slice(end);
      area.selectionStart = area.selectionEnd = start + 2;
      refresh();
    }
  });

  root.addEventListener('app:destroy', () => {
    instance = null;
  });

  refresh();
  return root;
}

registerOpener('text', (path) => edit(path));
