import { basename, dirname, fs, HOME, join, normalise, type FsNode } from '../fs';
import { openContextMenu } from '../ContextMenu';
import { notify } from '../Notifications';
import { openApp, openPath, registerOpener, screenRoot } from '../system';
import { askForName, confirmAction, el, formatDate, svg } from '../ui';

const ICONS = {
  dir: svg('<path d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.2l1.9 2.2h9.1A1.4 1.4 0 0 1 21 9.6v8A1.4 1.4 0 0 1 19.6 19H4.4A1.4 1.4 0 0 1 3 17.6z"/>'),
  text: svg('<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V8z"/><path d="M14 3v5h4.8"/><path d="M8.6 13h6.8M8.6 16.5h4.4"/>'),
  app: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m9 10 2.6 2-2.6 2"/>'),
  link: svg('<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.2-1.2"/>'),
  paint: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="9.4" cy="10" r="1.1" fill="currentColor"/><circle cx="14.6" cy="10" r="1.1" fill="currentColor"/>'),
  up: svg('<path d="M12 19V6"/><path d="m6 12 6-6 6 6"/>'),
  back: svg('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>'),
  forward: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
  home: svg('<path d="m4 11 8-6.5 8 6.5"/><path d="M6.5 9.6V19h11V9.6"/>'),
  newFolder: svg('<path d="M3 7.4A1.4 1.4 0 0 1 4.4 6h4.2l1.9 2.2h9.1A1.4 1.4 0 0 1 21 9.6v8A1.4 1.4 0 0 1 19.6 19H4.4A1.4 1.4 0 0 1 3 17.6z"/><path d="M12 11.5v5M9.5 14h5"/>'),
  newFile: svg('<path d="M14 3H7a1.8 1.8 0 0 0-1.8 1.8v14.4A1.8 1.8 0 0 0 7 21h10a1.8 1.8 0 0 0 1.8-1.8V8z"/><path d="M14 3v5h4.8"/><path d="M12 12v5M9.5 14.5h5"/>'),
  trash: svg('<path d="M4.5 7h15"/><path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7"/><path d="M6.5 7v12.1A1.9 1.9 0 0 0 8.4 21h7.2a1.9 1.9 0 0 0 1.9-1.9V7"/>'),
  rename: svg('<path d="M4 20h16"/><path d="M14.5 4.5 19 9 9 19H4.5v-4.5z"/>'),
};

export function fileIcon(node: FsNode) {
  return ICONS[node.kind] ?? ICONS.text;
}

interface Instance {
  navigate: (path: string) => void;
}

let instance: Instance | null = null;

/** Open a directory, launching the file manager first if it is not running. */
export function browse(path: string) {
  if (!instance) {
    openApp('explorer');
    // The window mounts synchronously, so the instance exists by now.
  }
  instance?.navigate(path);
}

export function createExplorer(): HTMLElement {
  const root = el('div', 'explorer');

  let cwd = HOME;
  const history: string[] = [HOME];
  let cursor = 0;
  let selected: string | null = null;

  /* --- chrome ------------------------------------------------------------ */

  const bar = el('div', 'explorer__bar');

  const navButton = (icon: string, label: string, onClick: () => void) => {
    const node = el('button', 'explorer__nav');
    node.type = 'button';
    node.title = label;
    node.setAttribute('aria-label', label);
    node.innerHTML = icon;
    node.addEventListener('click', onClick);
    return node;
  };

  const backButton = navButton(ICONS.back, 'Back', () => {
    if (cursor > 0) {
      cursor -= 1;
      cwd = history[cursor];
      render();
    }
  });

  const forwardButton = navButton(ICONS.forward, 'Forward', () => {
    if (cursor < history.length - 1) {
      cursor += 1;
      cwd = history[cursor];
      render();
    }
  });

  const upButton = navButton(ICONS.up, 'Up one level', () => {
    if (cwd !== '/') navigate(dirname(cwd));
  });

  const homeButton = navButton(ICONS.home, 'Home', () => navigate(HOME));

  const crumbs = el('div', 'explorer__crumbs');

  bar.append(backButton, forwardButton, upButton, homeButton, crumbs);

  const actions = el('div', 'explorer__actions');
  actions.append(
    navButton(ICONS.newFolder, 'New folder', () => createFolder()),
    navButton(ICONS.newFile, 'New file', () => createFile()),
  );
  bar.append(actions);

  const grid = el('div', 'explorer__grid');
  const status = el('div', 'explorer__status');

  root.append(bar, grid, status);

  /* --- navigation -------------------------------------------------------- */

  function navigate(path: string) {
    const target = normalise(path);
    if (!fs.isDir(target)) return;

    cwd = target;
    // Drop any forward history, like a browser.
    history.splice(cursor + 1);
    history.push(target);
    cursor = history.length - 1;
    selected = null;
    render();
  }

  instance = { navigate };

  /* --- actions ----------------------------------------------------------- */

  function createFolder() {
    const name = fs.uniqueName(cwd, 'New folder');
    askForName(screenRoot(), 'New folder', name, (value) => {
      if (fs.mkdir(join(cwd, value))) render();
      else notify('Could not create folder', 'A file with that name already exists.');
    });
  }

  function createFile() {
    const name = fs.uniqueName(cwd, 'Untitled', '.txt');
    askForName(screenRoot(), 'New file', name, (value) => {
      if (fs.write(join(cwd, value), '')) render();
      else notify('Could not create file', 'That name is taken or protected.');
    });
  }

  function renameNode(path: string) {
    askForName(screenRoot(), 'Rename', basename(path), (value) => {
      if (fs.rename(path, value)) render();
      else notify('Could not rename', 'That name is taken, or the item is protected.');
    });
  }

  function deleteNode(path: string) {
    const node = fs.get(path);
    if (!node) return;

    if (node.system) {
      notify('Protected item', basename(path) + ' is part of the system.');
      return;
    }

    confirmAction(screenRoot(), 'Delete', 'Delete "' + basename(path) + '"?', () => {
      if (fs.remove(path)) {
        notify('Deleted', basename(path));
        render();
      }
    });
  }

  function entryMenu(path: string, x: number, y: number) {
    const node = fs.get(path);
    if (!node) return;

    openContextMenu(screenRoot(), x, y, [
      { label: 'Open', icon: ICONS.app, action: () => open(node, path) },
      { separator: true },
      { label: 'Rename', icon: ICONS.rename, action: () => renameNode(path), disabled: node.system },
      { label: 'Delete', icon: ICONS.trash, action: () => deleteNode(path), disabled: node.system },
    ]);
  }

  function open(node: FsNode, path: string) {
    if (node.kind === 'dir') navigate(path);
    else openPath(path);
  }

  /* --- rendering --------------------------------------------------------- */

  function renderCrumbs() {
    crumbs.replaceChildren();
    const parts = cwd === '/' ? [] : cwd.split('/').slice(1);

    const rootCrumb = el('button', 'explorer__crumb', '/');
    rootCrumb.type = 'button';
    rootCrumb.addEventListener('click', () => navigate('/'));
    crumbs.append(rootCrumb);

    let path = '';
    parts.forEach((part, index) => {
      path += '/' + part;
      const target = path;
      const crumb = el('button', 'explorer__crumb', part);
      crumb.type = 'button';
      if (index === parts.length - 1) crumb.classList.add('is-current');
      crumb.addEventListener('click', () => navigate(target));
      crumbs.append(crumb);
    });
  }

  function render() {
    renderCrumbs();
    backButton.disabled = cursor === 0;
    forwardButton.disabled = cursor >= history.length - 1;
    upButton.disabled = cwd === '/';

    grid.replaceChildren();
    const entries = fs.list(cwd);

    if (entries.length === 0) {
      grid.append(el('p', 'explorer__empty', 'This folder is empty.'));
    }

    for (const node of entries) {
      const path = join(cwd, node.name);

      const tile = el('button', 'tile');
      tile.type = 'button';
      tile.classList.toggle('is-selected', selected === path);

      const icon = el('span', 'tile__icon');
      icon.innerHTML = fileIcon(node);
      if (node.system) icon.classList.add('is-system');

      const label = el('span', 'tile__label', node.name);
      tile.append(icon, label);

      tile.addEventListener('click', () => {
        selected = path;
        render();
      });
      tile.addEventListener('dblclick', () => open(node, path));
      tile.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        selected = path;
        render();
        const box = screenRoot().getBoundingClientRect();
        const scale = box.width / (screenRoot().offsetWidth || 1) || 1;
        entryMenu(path, (event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
      });

      grid.append(tile);
    }

    const node = selected ? fs.get(selected) : null;
    status.textContent = node
      ? node.name + ' · ' + node.kind + ' · ' + formatDate(node.modified)
      : entries.length + (entries.length === 1 ? ' item' : ' items');
  }

  /* --- wiring ------------------------------------------------------------ */

  grid.addEventListener('contextmenu', (event) => {
    if (event.target !== grid) return;
    event.preventDefault();
    const box = screenRoot().getBoundingClientRect();
    const scale = box.width / (screenRoot().offsetWidth || 1) || 1;

    openContextMenu(
      screenRoot(),
      (event.clientX - box.left) / scale,
      (event.clientY - box.top) / scale,
      [
        { label: 'New folder', icon: ICONS.newFolder, action: createFolder },
        { label: 'New text file', icon: ICONS.newFile, action: createFile },
        { separator: true },
        { label: 'Refresh', action: render },
      ],
    );
  });

  root.addEventListener('keydown', (event) => {
    if (!selected) return;
    if (event.key === 'Delete') deleteNode(selected);
    if (event.key === 'F2') renameNode(selected);
  });

  // Keep the view live when the shell or another app touches the disk.
  const off = fs.on(() => {
    if (!fs.isDir(cwd)) cwd = HOME;
    render();
  });
  root.addEventListener('app:destroy', () => {
    off();
    instance = null;
  });

  render();
  return root;
}

registerOpener('dir', (path) => browse(path));
