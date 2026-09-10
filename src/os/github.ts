/**
 * Live GitHub data for github.com/shreyjain7.
 *
 * The browser's GitHub page and the desktop's repo widget both read from here.
 * The public REST API needs no key and sends permissive CORS headers, so this
 * works straight from the page — but it is also rate-limited per IP and will
 * simply be unreachable on a locked-down network, so every call falls back to
 * a small bundled snapshot rather than rendering an error state.
 *
 * Results are cached in `sessionStorage` for the length of the session, which
 * keeps a tab switch from spending another request against the hourly budget.
 */

export const GITHUB_USER = 'shreyjain7';

const API = 'https://api.github.com';
const CACHE_KEY = 'shrey-pc:github:v1';
/** Unauthenticated GitHub allows 60 requests an hour, so cache generously. */
const CACHE_TTL = 30 * 60 * 1000;

export interface Repo {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  updated: string;
  url: string;
  topics: string[];
}

export interface Profile {
  login: string;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  url: string;
  location: string | null;
}

export interface GitHubData {
  profile: Profile;
  repos: Repo[];
  /** True when this came off the network rather than out of the fallback. */
  live: boolean;
  fetchedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Fallback                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A snapshot of the account, used when the API cannot be reached. Kept short
 * on purpose: it exists so the page has something honest to show offline, not
 * as a second copy of the truth.
 */
const FALLBACK: GitHubData = {
  live: false,
  fetchedAt: 0,
  profile: {
    login: GITHUB_USER,
    name: 'Shrey Jain',
    bio: 'B.Tech CSE @ Manipal Institute of Technology.',
    avatar: null,
    followers: 0,
    following: 0,
    publicRepos: 15,
    url: `https://github.com/${GITHUB_USER}`,
    location: 'Hyderabad, India',
  },
  repos: [
    {
      name: 'shrey-pc',
      description: 'Interactive 3D portfolio — a CRT computer you boot up to read my CV.',
      language: 'TypeScript',
      stars: 0,
      forks: 0,
      updated: '2026-09-09',
      url: `https://github.com/${GITHUB_USER}/shrey-pc`,
      topics: ['threejs', 'portfolio', 'webgl'],
    },
    {
      name: 'nivesta',
      description: 'A peer-to-peer lending marketplace with the maths in the open.',
      language: 'TypeScript',
      stars: 0,
      forks: 0,
      updated: '2026-09-08',
      url: `https://github.com/${GITHUB_USER}/nivesta`,
      topics: ['fintech', 'nextjs', 'prisma'],
    },
    {
      name: 'attendance-management-system',
      description: 'Django attendance management system with role-based dashboards.',
      language: 'Python',
      stars: 0,
      forks: 0,
      updated: '2026-07-01',
      url: `https://github.com/${GITHUB_USER}/attendance-management-system`,
      topics: ['django', 'attendance'],
    },
    {
      name: 'local-rag-qa',
      description: 'Local RAG question-answering app for document search and generation.',
      language: 'Python',
      stars: 0,
      forks: 0,
      updated: '2026-07-01',
      url: `https://github.com/${GITHUB_USER}/local-rag-qa`,
      topics: ['rag', 'llm'],
    },
    {
      name: 'quantum-algorithm-benchmark-suite',
      description: 'Quantum algorithm benchmark suite with comparative metrics and charts.',
      language: 'Python',
      stars: 0,
      forks: 0,
      updated: '2026-07-01',
      url: `https://github.com/${GITHUB_USER}/quantum-algorithm-benchmark-suite`,
      topics: ['quantum'],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Fetch                                                                       */
/* -------------------------------------------------------------------------- */

interface RawRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  html_url: string;
  topics?: string[];
  fork: boolean;
  archived: boolean;
}

interface RawUser {
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  followers: number;
  following: number;
  public_repos: number;
  html_url: string;
  location: string | null;
}

function readCache(): GitHubData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitHubData;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: GitHubData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // A full or unavailable session store just means we re-fetch next time.
  }
}

/** Aborts rather than leaving a tab spinning on a network that never answers. */
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(API + path, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error('GitHub responded ' + response.status);
  return (await response.json()) as T;
}

let inflight: Promise<GitHubData> | null = null;

/**
 * Profile and repositories, newest push first. Never rejects — a failure
 * resolves to the bundled snapshot with `live: false`.
 */
export function loadGitHub(): Promise<GitHubData> {
  const cached = readCache();
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  inflight = (async () => {
    try {
      const [user, repos] = await Promise.all([
        get<RawUser>(`/users/${GITHUB_USER}`, controller.signal),
        get<RawRepo[]>(`/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`, controller.signal),
      ]);

      const data: GitHubData = {
        live: true,
        fetchedAt: Date.now(),
        profile: {
          login: user.login,
          name: user.name,
          bio: user.bio,
          avatar: user.avatar_url,
          followers: user.followers,
          following: user.following,
          publicRepos: user.public_repos,
          url: user.html_url,
          location: user.location,
        },
        repos: repos
          .filter((repo) => !repo.fork && !repo.archived)
          .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at))
          .map((repo) => ({
            name: repo.name,
            description: repo.description,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            updated: repo.pushed_at.slice(0, 10),
            url: repo.html_url,
            topics: repo.topics ?? [],
          })),
      };

      writeCache(data);
      return data;
    } catch {
      // Offline, rate-limited or blocked — show the snapshot and say so.
      return { ...FALLBACK, fetchedAt: Date.now() };
    } finally {
      window.clearTimeout(timeout);
      inflight = null;
    }
  })();

  return inflight;
}

/** Rough language mix across the account, for the little bar on the profile. */
export function languageMix(repos: Repo[]) {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    if (!repo.language) continue;
    counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({ language, percent: (count / total) * 100 }));
}

/** Stable per-language colour, so the same language reads the same everywhere. */
export function languageColour(language: string) {
  const palette: Record<string, string> = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572a5',
    HTML: '#e34c26',
    CSS: '#563d7c',
    C: '#555555',
    'C++': '#f34b7d',
    Java: '#b07219',
    Shell: '#89e051',
    Jupyter: '#da5b0b',
  };
  if (palette[language]) return palette[language];

  // Anything unlisted gets a deterministic hue from its own name.
  let hash = 0;
  for (let i = 0; i < language.length; i += 1) hash = (hash * 31 + language.charCodeAt(i)) % 360;
  return `hsl(${hash}, 62%, 55%)`;
}
