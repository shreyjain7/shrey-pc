import { fs } from './fs';

interface Handlers {
  openApp: (id: string) => void;
  closeApp: (id: string) => void;
  screen: () => HTMLElement;
}

let handlers: Handlers | null = null;

/** Wired once by the OS so apps can talk to the shell without importing it. */
export function registerSystem(next: Handlers) {
  handlers = next;
}

export function openApp(id: string) {
  handlers?.openApp(id);
}

export function closeApp(id: string) {
  handlers?.closeApp(id);
}

/** The screen root — dialogs and menus mount here so they centre correctly. */
export function screenRoot(): HTMLElement {
  return handlers?.screen() ?? document.body;
}

type PathOpener = (path: string) => void;

const openers = new Map<string, PathOpener>();

/** Apps register how they handle a path once their window exists. */
export function registerOpener(kind: string, opener: PathOpener) {
  openers.set(kind, opener);
}

/**
 * The single "double-click a thing" entry point. Directories go to the file
 * manager, text to the editor, launchers to their app, links to the browser.
 */
export function openPath(path: string) {
  const node = fs.get(path);
  if (!node) return;

  if (node.kind === 'app' && node.appId) {
    openApp(node.appId);
    return;
  }

  if (node.kind === 'link' && node.href) {
    window.open(node.href, '_blank', 'noreferrer,noopener');
    return;
  }

  const kind = node.kind === 'dir' ? 'dir' : node.kind;
  const opener = openers.get(kind);
  if (opener) {
    opener(path);
    return;
  }

  // Anything unrecognised still opens as text rather than doing nothing.
  openers.get('text')?.(path);
}
