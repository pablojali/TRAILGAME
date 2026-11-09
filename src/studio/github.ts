/**
 * Trail Studio's link to the game's repository (owner request, 9 November 2026). The tables are
 * read from `main`; a save is one commit on a new `studio/…` branch and a pull request, which the
 * game's checks validate and Cloudflare previews; publishing merges it. The token is the owner's
 * fine-grained GitHub token for this repository only, kept in this browser.
 */
export const REPO = 'pablojali/TRAILGAME'
const API = 'https://api.github.com'
const TOKEN_KEY = 'trailgame.studio.token'

export function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode: the token lasts for this visit only.
  }
}

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!response.ok) {
    let message = response.statusText
    try {
      message = ((await response.json()) as { message?: string }).message ?? message
    } catch {
      // Not JSON.
    }
    throw new GitHubError(response.status, message)
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

function decodeBase64(text: string): string {
  const bytes = Uint8Array.from(atob(text.replace(/\n/g, '')), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** A file's text on `main`. */
export async function readFile(token: string, path: string): Promise<string> {
  const file = await call<{ content: string }>(token, `/repos/${REPO}/contents/${path}?ref=main`)
  return decodeBase64(file.content)
}

/** Checks the token: it must reach the repository. */
export async function checkToken(token: string): Promise<void> {
  await call(token, `/repos/${REPO}`)
}

export interface Proposal {
  number: number
  title: string
  url: string
  branch: string
  headSha: string
  /** GitHub's view of the checks: clean (all passed), unstable (failed or running), dirty (conflict)… */
  state: 'ready' | 'checking' | 'failed' | 'conflict'
  /** The game with these changes, as Cloudflare previews the branch. */
  previewUrl: string
}

/** Cloudflare Pages' address for a branch of the game (its branch alias). */
export function previewUrl(branch: string): string {
  const alias = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28).replace(/-+$/, '')
  return `https://${alias}.trailgame-f01.pages.dev`
}

interface PullJson {
  number: number
  title: string
  html_url: string
  head: { ref: string; sha: string }
  mergeable_state?: string
}

interface CheckRunsJson {
  check_runs: { status: string; conclusion: string | null }[]
}

async function proposalOf(token: string, pull: PullJson): Promise<Proposal> {
  const full = await call<PullJson>(token, `/repos/${REPO}/pulls/${pull.number}`)
  let state: Proposal['state'] = full.mergeable_state === 'dirty' ? 'conflict' : 'checking'
  if (state !== 'conflict') {
    try {
      const checks = await call<CheckRunsJson>(token, `/repos/${REPO}/commits/${full.head.sha}/check-runs`)
      const runs = checks.check_runs.filter((run) => run.conclusion !== 'skipped')
      if (runs.some((run) => run.conclusion === 'failure' || run.conclusion === 'cancelled' || run.conclusion === 'timed_out')) state = 'failed'
      else if (runs.length > 0 && runs.every((run) => run.status === 'completed')) state = 'ready'
    } catch {
      // A token without the Checks permission: GitHub's merge state tells enough.
      state = full.mergeable_state === 'clean' ? 'ready' : 'checking'
    }
  }
  return {
    number: full.number,
    title: full.title,
    url: full.html_url,
    branch: full.head.ref,
    headSha: full.head.sha,
    state,
    previewUrl: previewUrl(full.head.ref),
  }
}

/** Open proposals made by the Studio. */
export async function listProposals(token: string): Promise<Proposal[]> {
  const pulls = await call<PullJson[]>(token, `/repos/${REPO}/pulls?state=open&per_page=50`)
  return Promise.all(pulls.filter((pull) => pull.head.ref.startsWith('studio/')).map((pull) => proposalOf(token, pull)))
}

/** One commit with every file on a new branch from main, and its pull request. */
export async function createProposal(
  token: string,
  files: { path: string; text: string }[],
  title: string,
  body: string,
  now = new Date(),
  media: { path: string; base64: string | null }[] = [],
): Promise<Proposal> {
  const main = await call<{ object: { sha: string } }>(token, `/repos/${REPO}/git/ref/heads/main`)
  const base = await call<{ tree: { sha: string } }>(token, `/repos/${REPO}/git/commits/${main.object.sha}`)
  // Pictures and videos go up as blobs first (base64); a null deletes the file.
  const mediaEntries = await Promise.all(
    media.map(async (file) => {
      if (file.base64 === null) return { path: file.path, mode: '100644', type: 'blob', sha: null }
      const blob = await call<{ sha: string }>(token, `/repos/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: file.base64, encoding: 'base64' }),
      })
      return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha }
    }),
  )
  const tree = await call<{ sha: string }>(token, `/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: base.tree.sha,
      tree: [...files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.text })), ...mediaEntries],
    }),
  })
  const commit = await call<{ sha: string }>(token, `/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: `${title}\n\n${body}`, tree: tree.sha, parents: [main.object.sha] }),
  })
  const p = (n: number) => String(n).padStart(2, '0')
  const branch = `studio/${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  await call(token, `/repos/${REPO}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) })
  const pull = await call<PullJson>(token, `/repos/${REPO}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, body, head: branch, base: 'main' }),
  })
  return proposalOf(token, pull)
}

export interface RepoFile {
  name: string
  path: string
  /** A temporary address to show it (works for a private repository). */
  url: string
}

/** The files of a folder on main (none when it does not exist). */
export async function listFolder(token: string, path: string): Promise<RepoFile[]> {
  try {
    const entries = await call<{ name: string; path: string; type: string; download_url: string | null }[]>(token, `/repos/${REPO}/contents/${path}?ref=main`)
    return entries.filter((e) => e.type === 'file' && e.download_url).map((e) => ({ name: e.name, path: e.path, url: e.download_url! }))
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return []
    throw error
  }
}

/** Publishes a proposal: merges it into main (the game then deploys it). */
export async function publishProposal(token: string, proposal: Proposal): Promise<void> {
  await call(token, `/repos/${REPO}/pulls/${proposal.number}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'merge', sha: proposal.headSha }),
  })
  await call(token, `/repos/${REPO}/git/refs/heads/${proposal.branch}`, { method: 'DELETE' }).catch(() => undefined)
}

/** Drops a proposal: closes it and deletes its branch. */
export async function discardProposal(token: string, proposal: Proposal): Promise<void> {
  await call(token, `/repos/${REPO}/pulls/${proposal.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) })
  await call(token, `/repos/${REPO}/git/refs/heads/${proposal.branch}`, { method: 'DELETE' }).catch(() => undefined)
}
