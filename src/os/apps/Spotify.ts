import { telemetry } from '../../world/telemetry';
import { el } from '../ui';
import { toSpotifyEmbed } from './Music';

/**
 * Spotify — their embed, filling a window.
 *
 * The embed is the only way to play Spotify's catalogue from a static site:
 * no key, no backend, no login. An anonymous listener gets 30-second previews,
 * and anyone signed into Spotify in that browser gets whole tracks. (The Web
 * Playback SDK plays full tracks outright, but every visitor would need
 * Premium and an OAuth round trip.)
 *
 * Everything inside the frame belongs to Spotify — the artwork, the track
 * list, the transport. It is a sealed cross-origin document, so this app
 * cannot drive it or read what is playing; it only decides what to load.
 */

const STORE_KEY = 'shrey-pc:spotify:uri';

export function createSpotify(): HTMLElement {
  const root = el('div', 'spotify');

  const frame = el('iframe', 'spotify__frame');
  frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  frame.loading = 'lazy';
  frame.title = 'Spotify';

  // Held transparent until it paints, so the stage's black shows through
  // rather than the browser's white page while the embed is on its way.
  frame.addEventListener('load', () => frame.classList.add('is-ready'));

  const empty = el('div', 'spotify__empty');
  empty.append(el('h2', 'spotify__empty-title', 'Choose something to play'));
  empty.append(
    el(
      'p',
      'spotify__empty-note',
      'Open a playlist, album or track in Spotify, copy its link, and paste it below. ' +
        'It is remembered on this device, so the window opens straight into it next time.',
    ),
  );

  const stage = el('div', 'spotify__stage');
  stage.append(empty);
  root.append(stage);

  /* --- The link bar ----------------------------------------------------- */

  const bar = el('form', 'spotify__bar');
  const input = el('input', 'spotify__input');
  input.type = 'text';
  input.spellcheck = false;
  input.placeholder = 'https://open.spotify.com/playlist/…';

  const go = el('button', 'spotify__go', 'Load');
  go.type = 'submit';
  bar.append(input, go);

  const status = el('p', 'spotify__status', '');
  root.append(bar, status);

  function load(value: string, remember = true) {
    const embed = toSpotifyEmbed(value);
    if (!embed) {
      status.textContent = 'That is not a Spotify link.';
      status.classList.add('is-error');
      return;
    }

    frame.classList.remove('is-ready');
    frame.src = embed;
    stage.replaceChildren(frame);
    status.textContent = '';
    status.classList.remove('is-error');
    root.classList.add('is-loaded');
    telemetry.process(0.3);

    if (!remember) return;
    try {
      localStorage.setItem(STORE_KEY, value);
    } catch {
      // Private browsing; it plays now, it just will not be remembered.
    }
  }

  bar.addEventListener('submit', (event) => {
    event.preventDefault();
    load(input.value);
  });

  input.addEventListener('keydown', (event) => event.stopPropagation());

  let saved = '';
  try {
    saved = localStorage.getItem(STORE_KEY) ?? '';
  } catch {
    // Nothing saved; the empty state explains what to do.
  }

  if (saved) {
    input.value = saved;
    load(saved, false);
  }

  return root;
}
