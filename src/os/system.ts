import { fs } from './fs';

interface Handlers {
  openApp: (id: string) => void;
  closeApp: (id: string) => void;
  screen: () => HTMLElement;
  screensaver: (mode?: string) => void;
  party: () => void;
  barrelRoll: () => void;
}

export type RoomView = 'room' | 'workstation' | 'screen';

/**
 * The 3D layer's side of the bridge, registered separately from the shell's.
 *
 * This is the only place the operating system reaches into the scene, and it
 * does so without importing a line of three.js: it hands over a canvas and
 * gets back a teardown function.
 */
interface SceneHandlers {
  /** Draw the live tower into `canvas`; returns the unmount. */
  caseCam: (canvas: HTMLCanvasElement) => () => void;
  /** Move the room camera. */
  setView: (view: RoomView) => void;
  /** Return the room camera to its resting pose. */
  resetView: () => void;
  /** Toggle browser fullscreen. */
  toggleFullscreen: () => void;
  /** Light the room for an hour (0-24), or the visitor's own with null. */
  setTimeOfDay: (hour: number | null) => void;
  /** The terminal's weather and lamp commands; each says what it did. */
  weather: (arg: string) => Promise<string>;
  lamp: (arg: string) => string;
}

let handlers: Handlers | null = null;
let scene: SceneHandlers | null = null;

/** Wired once by the OS so apps can talk to the shell without importing it. */
export function registerSystem(next: Handlers) {
  handlers = next;
}

/** Wired once by the experience, after the scene exists. */
export function registerScene(next: SceneHandlers) {
  scene = next;
}

export function openApp(id: string) {
  handlers?.openApp(id);
}

export function closeApp(id: string) {
  handlers?.closeApp(id);
}

/** Start the screen saver: warp, matrix or bounce, or any one of them. */
export function startScreensaver(mode?: string) {
  handlers?.screensaver(mode);
}

/** Confetti, a fanfare and a barrel roll. */
export function party() {
  handlers?.party();
}

export function barrelRoll() {
  handlers?.barrelRoll();
}

/** The screen root — dialogs and menus mount here so they centre correctly. */
export function screenRoot(): HTMLElement {
  return handlers?.screen() ?? document.body;
}

/**
 * Ask the 3D layer to draw the live machine into `canvas`. Returns an unmount
 * function; when the scene is unavailable that is a harmless no-op, so the
 * caller never has to branch on it.
 */
export function mountCaseCam(canvas: HTMLCanvasElement): () => void {
  return scene?.caseCam(canvas) ?? (() => {});
}

export function setRoomView(view: RoomView) {
  scene?.setView(view);
}

/*
 * At the screen view the glass fills the viewport, so the page's own floating
 * controls would sit on top of the menu bar. They are hidden there and these
 * two stand in for them from inside the menu bar instead — which is where a
 * Mac keeps its controls anyway.
 */
export function resetCameraView() {
  scene?.resetView();
}

export function toggleFullscreen() {
  scene?.toggleFullscreen();
}

export function setTimeOfDay(hour: number | null) {
  scene?.setTimeOfDay(hour);
}

export function weatherCommand(arg: string) {
  return scene?.weather(arg) ?? Promise.resolve('weather: unavailable');
}

export function lampCommand(arg: string) {
  return scene?.lamp(arg) ?? 'lamp: unavailable';
}

export function hasCaseCam() {
  return Boolean(scene);
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
