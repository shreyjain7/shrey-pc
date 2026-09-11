import { telemetry } from '../../world/telemetry';
import { el } from '../ui';

/**
 * Search — the web, inside the machine.
 *
 * Google itself cannot be embedded: it sends `X-Frame-Options` and a CSP
 * `frame-ancestors` that make every browser refuse to render it inside another
 * page, and there is no client-side way around that. So rather than a dead
 * iframe or a link that dumps you into a new tab, this queries APIs that *do*
 * allow cross-origin reads and renders the results here.
 *
 * Wikipedia's MediaWiki API is the backbone — `origin=*` opts into CORS, and
 * it returns titles, snippets, thumbnails and extracts. DuckDuckGo's Instant
 * Answer endpoint is tried alongside it for definitions and quick facts, but
 * it does not reliably send CORS headers, so it is treated as a bonus: when it
 * fails, the page simply shows Wikipedia's results.
 *
 * Opening a result stays in the window too — the article is fetched and laid
 * out as a reader, so nothing about this app ever leaves the OS.
 */

const WIKI = 'https://en.wikipedia.org';
const SUGGESTIONS = ['Manipal Institute of Technology', 'Retrieval augmented generation', 'Django', 'Punjabi music'];

interface Result {
  title: string;
  snippet: string;
}

/** MediaWiki returns snippets with <span class="searchmatch"> highlights. */
function stripHtml(value: string) {
  const host = document.createElement('div');
  host.innerHTML = value;
  return host.textContent ?? '';
}

export function createSearch(): HTMLElement {
  const root = el('div', 'websearch');

  let inFlight: AbortController | null = null;
  let query = '';

  /* --- Chrome ----------------------------------------------------------- */

  const bar = el('form', 'websearch__bar');
  const brand = el('span', 'websearch__brand');
  brand.innerHTML =
    '<b style="color:#4285f4">G</b><b style="color:#ea4335">o</b>' +
    '<b style="color:#fbbc05">o</b><b style="color:#4285f4">g</b>' +
    '<b style="color:#34a853">l</b><b style="color:#ea4335">e</b>';

  const field = el('input', 'websearch__input');
  field.type = 'text';
  field.placeholder = 'Search the web';
  field.spellcheck = false;
  field.autocomplete = 'off';

  const go = el('button', 'websearch__go', 'Search');
  go.type = 'submit';

  bar.append(brand, field, go);
  root.append(bar);

  const body = el('div', 'websearch__body');
  root.append(body);

  /* --- Landing ---------------------------------------------------------- */

  function renderHome() {
    root.classList.remove('is-results');
    body.replaceChildren();

    const home = el('div', 'websearch__home');
    const logo = el('div', 'websearch__logo');
    logo.innerHTML = brand.innerHTML;
    home.append(logo);
    home.append(
      el('p', 'websearch__tagline', 'Wikipedia and DuckDuckGo, read inside the machine.'),
    );

    const chips = el('div', 'websearch__chips');
    for (const text of SUGGESTIONS) {
      const chip = el('button', 'websearch__chip', text);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        field.value = text;
        void search(text);
      });
      chips.append(chip);
    }
    home.append(chips);
    body.append(home);
  }

  function renderMessage(title: string, note: string) {
    body.replaceChildren();
    const block = el('div', 'websearch__empty');
    block.append(el('h2', 'websearch__empty-title', title));
    block.append(el('p', 'websearch__empty-note', note));
    body.append(block);
  }

  /* --- Fetching --------------------------------------------------------- */

  async function fetchWikipedia(term: string, signal: AbortSignal): Promise<Result[]> {
    const url =
      `${WIKI}/w/api.php?action=query&list=search&format=json&origin=*` +
      `&srlimit=8&srsearch=${encodeURIComponent(term)}`;

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Wikipedia returned ' + response.status);

    const payload = (await response.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };

    return (payload.query?.search ?? []).map((hit) => ({
      title: hit.title,
      snippet: stripHtml(hit.snippet),
    }));
  }

  interface Instant {
    heading: string;
    text: string;
    image: string;
    source: string;
  }

  async function fetchInstant(term: string, signal: AbortSignal): Promise<Instant | null> {
    try {
      const url =
        `https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1` +
        `&q=${encodeURIComponent(term)}`;
      const response = await fetch(url, { signal });
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        Heading?: string;
        AbstractText?: string;
        Image?: string;
        AbstractSource?: string;
      };

      if (!payload.AbstractText) return null;
      return {
        heading: payload.Heading ?? term,
        text: payload.AbstractText,
        image: payload.Image ? 'https://duckduckgo.com' + payload.Image : '',
        source: payload.AbstractSource ?? 'DuckDuckGo',
      };
    } catch {
      // No CORS headers, offline, or aborted — the Wikipedia column still stands.
      return null;
    }
  }

  /** The reader: an article laid out in-window instead of in a new tab. */
  async function openArticle(title: string) {
    renderMessage('Loading…', title);
    telemetry.process(0.4);

    try {
      const response = await fetch(
        `${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      );
      if (!response.ok) throw new Error('Article returned ' + response.status);

      const page = (await response.json()) as {
        title?: string;
        description?: string;
        extract?: string;
        thumbnail?: { source: string };
        content_urls?: { desktop?: { page: string } };
      };

      body.replaceChildren();
      const article = el('article', 'websearch__article');

      const back = el('button', 'websearch__back', '← Back to results');
      back.type = 'button';
      back.addEventListener('click', () => void search(query));
      article.append(back);

      article.append(el('h1', 'websearch__article-title', page.title ?? title));
      if (page.description) {
        article.append(el('p', 'websearch__article-kicker', page.description));
      }

      if (page.thumbnail?.source) {
        const image = el('img', 'websearch__article-image');
        image.src = page.thumbnail.source;
        image.alt = page.title ?? title;
        image.decoding = 'async';
        article.append(image);
      }

      article.append(el('p', 'websearch__article-body', page.extract ?? ''));

      const original = page.content_urls?.desktop?.page;
      if (original) {
        const link = el('a', 'websearch__article-link', 'Read the full article on Wikipedia ↗');
        link.href = original;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        article.append(link);
      }

      body.append(article);
    } catch {
      renderMessage(
        'Could not load that article',
        'The network refused the request. Try another result, or search again.',
      );
    }
  }

  /* --- Results ---------------------------------------------------------- */

  async function search(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      renderHome();
      return;
    }

    query = trimmed;
    root.classList.add('is-results');
    renderMessage('Searching…', trimmed);

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    telemetry.process(0.5);

    let results: Result[];
    try {
      results = await fetchWikipedia(trimmed, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      renderMessage(
        'No connection',
        'Search needs the network, and the request did not get through. ' +
          (error instanceof Error ? error.message : ''),
      );
      return;
    }

    if (controller.signal.aborted) return;

    const instant = await fetchInstant(trimmed, controller.signal);
    if (controller.signal.aborted) return;

    body.replaceChildren();

    if (!results.length && !instant) {
      renderMessage('No results', 'Nothing matched “' + trimmed + '”.');
      return;
    }

    const layout = el('div', 'websearch__layout');
    const column = el('div', 'websearch__results');
    column.append(
      el('p', 'websearch__count', results.length + ' results · via Wikipedia'),
    );

    for (const result of results) {
      const item = el('article', 'websearch__result');

      const heading = el('button', 'websearch__result-title', result.title);
      heading.type = 'button';
      heading.addEventListener('click', () => void openArticle(result.title));
      item.append(heading);

      item.append(
        el(
          'span',
          'websearch__result-url',
          'en.wikipedia.org › ' + result.title.replace(/\s+/g, '_'),
        ),
      );
      item.append(el('p', 'websearch__result-snippet', result.snippet));
      column.append(item);
    }

    layout.append(column);

    if (instant) {
      const panel = el('aside', 'websearch__panel');
      panel.append(el('h2', 'websearch__panel-title', instant.heading));
      if (instant.image) {
        const image = el('img', 'websearch__panel-image');
        image.src = instant.image;
        image.alt = instant.heading;
        image.decoding = 'async';
        panel.append(image);
      }
      panel.append(el('p', 'websearch__panel-text', instant.text));
      panel.append(el('span', 'websearch__panel-source', instant.source));
      layout.append(panel);
    }

    body.append(layout);
  }

  /* --- Wiring ----------------------------------------------------------- */

  bar.addEventListener('submit', (event) => {
    event.preventDefault();
    void search(field.value);
  });

  field.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      field.value = '';
      renderHome();
    }
  });

  root.addEventListener('app:destroy', () => inFlight?.abort());

  renderHome();
  requestAnimationFrame(() => field.focus());

  return root;
}
