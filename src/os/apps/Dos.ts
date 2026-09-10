import { telemetry } from '../../world/telemetry';
import { el } from '../ui';

/**
 * DOS — a DOSBox window, for running real MS-DOS software in the OS.
 *
 * The emulator itself (js-dos) is fetched from a CDN the first time this app
 * opens rather than bundled, because it carries a WebAssembly DOSBox build
 * that is far larger than the rest of this site put together.
 *
 * No games ship here. Game bundles are somebody else's copyright, so this
 * loads a `.jsdos` bundle you point it at — from disk, or from a URL.
 */

const JSDOS_VERSION = '7.4.7';
const JSDOS_JS = `https://js-dos.com/${JSDOS_VERSION}/current/js-dos.js`;
const JSDOS_CSS = `https://js-dos.com/${JSDOS_VERSION}/current/js-dos.css`;

interface DosInstance {
  run: (bundleUrl: string) => void;
  stop: () => void;
}

type DosFactory = (element: HTMLElement) => DosInstance;

let loader: Promise<DosFactory> | null = null;

/** Loads js-dos once per page, and hands back the same factory after that. */
function loadJsDos(): Promise<DosFactory> {
  if (loader) return loader;

  loader = new Promise<DosFactory>((resolve, reject) => {
    const existing = (window as unknown as { Dos?: DosFactory }).Dos;
    if (existing) {
      resolve(existing);
      return;
    }

    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = JSDOS_CSS;
    document.head.append(style);

    const script = document.createElement('script');
    script.src = JSDOS_JS;
    script.async = true;

    script.addEventListener('load', () => {
      const factory = (window as unknown as { Dos?: DosFactory }).Dos;
      if (factory) resolve(factory);
      else reject(new Error('js-dos loaded but did not register a Dos factory.'));
    });

    script.addEventListener('error', () =>
      reject(new Error('Could not reach the js-dos CDN. Check the network and try again.')),
    );

    document.head.append(script);
  });

  // A failed load must not be cached, or every later attempt reuses the
  // rejection and the app can never recover.
  loader.catch(() => {
    loader = null;
  });

  return loader;
}

export function createDos(): HTMLElement {
  const root = el('div', 'dos');

  let instance: DosInstance | null = null;
  let objectUrl = '';

  const bar = el('div', 'dos__bar');
  bar.append(el('span', 'dos__label', 'DOSBox'));

  const status = el('span', 'dos__status', 'No bundle loaded');
  bar.append(status);

  const pick = el('button', 'dos__button', 'Open bundle…');
  pick.type = 'button';

  const file = el('input', 'dos__file');
  file.type = 'file';
  file.accept = '.jsdos,.zip';

  const stopButton = el('button', 'dos__button', 'Stop');
  stopButton.type = 'button';
  stopButton.disabled = true;

  bar.append(pick, stopButton);
  root.append(bar, file);

  const stage = el('div', 'dos__stage');
  root.append(stage);

  const empty = el('div', 'dos__empty');
  empty.append(el('h2', 'dos__empty-title', 'Bring your own bundle'));
  empty.append(
    el(
      'p',
      'dos__empty-note',
      'This window runs a real DOSBox through js-dos, but it ships without any games — ' +
        'DOS game data is copyrighted and not mine to distribute.',
    ),
  );
  empty.append(
    el(
      'p',
      'dos__empty-note',
      'Point it at a .jsdos bundle to play. You can build one from a DOS game you own at ' +
        'dos.zone/studio, then open it here.',
    ),
  );

  const urlRow = el('div', 'dos__url-row');
  const urlInput = el('input', 'dos__url');
  urlInput.type = 'text';
  urlInput.placeholder = '…or paste a bundle URL';
  urlInput.spellcheck = false;
  const urlGo = el('button', 'dos__button', 'Load');
  urlGo.type = 'button';
  urlRow.append(urlInput, urlGo);
  empty.append(urlRow);
  stage.append(empty);

  /* ---------------------------------------------------------------------- */

  function fail(message: string) {
    status.textContent = 'Failed';
    status.classList.add('is-error');
    empty.replaceChildren();
    empty.append(el('h2', 'dos__empty-title', 'Could not start DOSBox'));
    empty.append(el('p', 'dos__empty-note', message));

    const retry = el('button', 'dos__button', 'Try again');
    retry.type = 'button';
    retry.addEventListener('click', () => window.location.reload());
    empty.append(retry);

    stage.replaceChildren(empty);
  }

  async function run(bundle: string, label: string) {
    status.textContent = 'Loading emulator…';
    status.classList.remove('is-error');

    let factory: DosFactory;
    try {
      factory = await loadJsDos();
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }

    // The window may have been closed while the CDN request was in flight.
    if (!root.isConnected) return;

    instance?.stop();

    const host = el('div', 'dos__screen');
    stage.replaceChildren(host);

    try {
      instance = factory(host);
      instance.run(bundle);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }

    status.textContent = label;
    stopButton.disabled = false;

    // An emulator is genuine CPU work; let the fans know.
    telemetry.setGpuLoad(0.5);
    telemetry.process(0.8);
  }

  pick.addEventListener('click', () => file.click());

  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(chosen);
    void run(objectUrl, chosen.name);
  });

  urlGo.addEventListener('click', () => {
    const value = urlInput.value.trim();
    if (value) void run(value, value.split('/').pop() ?? 'bundle');
  });

  urlInput.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') urlGo.click();
  });

  stopButton.addEventListener('click', () => {
    instance?.stop();
    instance = null;
    stopButton.disabled = true;
    status.textContent = 'Stopped';
    telemetry.setGpuLoad(0);
    stage.replaceChildren(empty);
  });

  root.addEventListener('app:destroy', () => {
    instance?.stop();
    instance = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    telemetry.setGpuLoad(0);
  });

  return root;
}
