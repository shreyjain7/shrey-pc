import { el } from './ui';

/**
 * The web, for the apps that want it.
 *
 * Google's own pages cannot be embedded — `X-Frame-Options` and a
 * `frame-ancestors` CSP make every browser refuse to render google.com inside
 * another page, and there is no client-side way around that. What Google does
 * offer is the Custom Search JSON API: the same index, returned as JSON, which
 * can be laid out here instead. That needs two free credentials, so:
 *
 *   • With them, results are Google's, ranked by Google, from the whole web.
 *   • Without them, the same shape is filled from Wikipedia's API, which opts
 *     into CORS and needs nothing at all.
 *
 * Both paths return the same rows, so the callers do not care which ran.
 */

const KEY = 'shrey-pc:google:key';
const CX = 'shrey-pc:google:cx';

const ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const WIKI = 'https://en.wikipedia.org';

export interface WebResult {
  title: string;
  url: string;
  host: string;
  snippet: string;
}

export interface WebSearch {
  engine: 'google' | 'wikipedia';
  results: WebResult[];
  /** Google's own count and timing, when it was Google that answered. */
  total?: string;
  seconds?: string;
  /** Why it is not Google, when it is not. */
  note?: string;
}

function read(name: string) {
  try {
    return localStorage.getItem(name) ?? '';
  } catch {
    return '';
  }
}

function write(name: string, value: string) {
  try {
    if (value) localStorage.setItem(name, value);
    else localStorage.removeItem(name);
  } catch {
    // Private browsing: it searches this session, it just will not be kept.
  }
}

/** MediaWiki snippets arrive with <span class="searchmatch"> highlights. */
function stripHtml(value: string) {
  const host = document.createElement('div');
  host.innerHTML = value;
  return host.textContent ?? '';
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/* -------------------------------------------------------------------------- */
/* The engines                                                                 */
/* -------------------------------------------------------------------------- */

/** Google's Custom Search JSON API — the real index, as rows. */
async function askGoogle(query: string, signal?: AbortSignal): Promise<WebSearch> {
  const url =
    `${ENDPOINT}?key=${encodeURIComponent(google.key)}&cx=${encodeURIComponent(google.cx)}` +
    `&num=10&safe=active&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, { signal });
  const payload = (await response.json().catch(() => null)) as {
    items?: Array<{ title?: string; link?: string; displayLink?: string; snippet?: string }>;
    searchInformation?: { formattedTotalResults?: string; formattedSearchTime?: string };
    error?: { message?: string };
  } | null;

  // Google explains its own refusals — a bad key, a spent quota, a search
  // engine that is not set to search the whole web — so pass its words on
  // rather than inventing a friendlier lie.
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message ?? 'Google returned ' + response.status);
  }

  const results: WebResult[] = (payload?.items ?? [])
    .filter((item) => typeof item.link === 'string' && item.link)
    .map((item) => ({
      title: item.title || item.link || '',
      url: item.link as string,
      host: item.displayLink || hostOf(item.link as string),
      snippet: item.snippet || '',
    }));

  return {
    engine: 'google',
    results,
    total: payload?.searchInformation?.formattedTotalResults,
    seconds: payload?.searchInformation?.formattedSearchTime,
  };
}

/** The no-credentials path: Wikipedia's API, which opts into CORS. */
async function askWikipedia(query: string, signal?: AbortSignal): Promise<WebResult[]> {
  const url =
    `${WIKI}/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=10&srsearch=${encodeURIComponent(query)}`;

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Wikipedia returned ' + response.status);

  const payload = (await response.json()) as {
    query?: { search?: Array<{ title?: string; snippet?: string }> };
  };

  return (payload.query?.search ?? [])
    .filter((hit) => typeof hit.title === 'string' && hit.title)
    .map((hit) => ({
      title: hit.title as string,
      url: `${WIKI}/wiki/` + encodeURIComponent((hit.title as string).replace(/ /g, '_')),
      host: 'en.wikipedia.org',
      snippet: stripHtml(hit.snippet ?? ''),
    }));
}

/* -------------------------------------------------------------------------- */
/* The front door                                                              */
/* -------------------------------------------------------------------------- */

export const google = {
  get key() {
    return read(KEY);
  },

  get cx() {
    return read(CX);
  },

  get connected() {
    return Boolean(this.key && this.cx);
  },

  connect(key: string, cx: string) {
    write(KEY, key.trim());
    write(CX, cx.trim());
  },

  disconnect() {
    write(KEY, '');
    write(CX, '');
  },

  /**
   * Google when it can, Wikipedia when it cannot.
   *
   * A Google call that fails still falls back rather than ending in an error
   * page — a spent daily quota should cost the ranking, not the search — but
   * the reason travels with the results so the page can say what happened.
   */
  async search(query: string, signal?: AbortSignal): Promise<WebSearch> {
    const term = query.trim();
    if (!term) return { engine: 'wikipedia', results: [] };

    if (this.connected) {
      try {
        return await askGoogle(term, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        const reason = (error as Error).message;

        try {
          return {
            engine: 'wikipedia',
            results: await askWikipedia(term, signal),
            note: 'Google said: ' + reason,
          };
        } catch {
          // The fallback is down too, so there is nothing to show and no
          // reason to report the substitute's failure over the real one.
          throw new Error(reason);
        }
      }
    }

    return {
      engine: 'wikipedia',
      results: await askWikipedia(term, signal),
      note: 'Not connected to Google — showing Wikipedia.',
    };
  },
};

/* -------------------------------------------------------------------------- */
/* The connect form                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Two fields and the two places to get them. Shared by the browser's Google
 * page and the Search app, so connecting in either one connects both.
 */
export function createGoogleConnect(onChange: () => void): HTMLElement {
  const root = el('form', 'gconnect');

  root.append(el('h3', 'gconnect__title', 'Use real Google results'));

  const note = el('p', 'gconnect__note');
  note.innerHTML =
    'Google will not let any site embed google.com, but it will hand over the same index as JSON. ' +
    'Two free credentials switch this over — both take a minute:<br>' +
    '<b>1.</b> An API key from <code>console.cloud.google.com</code>, with the ' +
    '“Custom Search API” enabled.<br>' +
    '<b>2.</b> A search engine ID from <code>programmablesearchengine.google.com</code>, ' +
    'set to <b>Search the entire web</b>.<br>' +
    'They are kept on this device only. The free tier is 100 searches a day.';
  root.append(note);

  const key = el('input', 'gconnect__field');
  key.type = 'text';
  key.spellcheck = false;
  key.placeholder = 'API key';
  key.value = google.key;

  const cx = el('input', 'gconnect__field');
  cx.type = 'text';
  cx.spellcheck = false;
  cx.placeholder = 'Search engine ID (cx)';
  cx.value = google.cx;

  const row = el('div', 'gconnect__row');
  const save = el('button', 'gconnect__save', google.connected ? 'Update' : 'Connect');
  save.type = 'submit';
  row.append(key, cx, save);
  root.append(row);

  if (google.connected) {
    const drop = el('button', 'gconnect__drop', 'Disconnect');
    drop.type = 'button';
    drop.addEventListener('click', () => {
      google.disconnect();
      onChange();
    });
    root.append(drop);
  }

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!key.value.trim() || !cx.value.trim()) return;
    google.connect(key.value, cx.value);
    onChange();
  });

  for (const field of [key, cx]) {
    field.addEventListener('keydown', (event) => event.stopPropagation());
  }

  return root;
}
