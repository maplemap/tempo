import { request } from 'undici';
import { db } from '../../db/index.js';
import { env } from '../env.js';

const API = 'https://api.github.com';

interface UpsertParams {
  source: string;
  event_type: string;
  ref_id: string;
  ref_url: string;
  title: string;
  repo_or_board: string | null;
  occurred_at: string;
  raw_json: string;
}

const upsert = db.prepare<UpsertParams>(`
  INSERT INTO external_events (source, event_type, ref_id, ref_url, title, repo_or_board, occurred_at, raw_json, fetched_at)
  VALUES (@source, @event_type, @ref_id, @ref_url, @title, @repo_or_board, @occurred_at, @raw_json, datetime('now'))
  ON CONFLICT(source, event_type, ref_id) DO UPDATE SET
    ref_url       = excluded.ref_url,
    title         = excluded.title,
    repo_or_board = excluded.repo_or_board,
    occurred_at   = excluded.occurred_at,
    raw_json      = excluded.raw_json,
    fetched_at    = datetime('now')
`);

interface BranchRow { branch: string; }

const listProjectBranches = db.prepare<[], BranchRow>(
  `SELECT DISTINCT COALESCE(github_base_branch, 'main') as branch FROM projects WHERE github_repo IS NOT NULL`
);

async function gh(urlPath: string, token: string): Promise<unknown> {
  const res = await request(`${API}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tempo-tracker'
    }
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`GitHub ${res.statusCode}: ${urlPath} — ${body.slice(0, 200)}`);
  }
  return res.body.json();
}

async function whoami(token: string): Promise<string> {
  const me = await gh('/user', token) as { login: string };
  return me.login;
}

function repoFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/repos\/([^/]+\/[^/]+)/);
  return m ? m[1] : null;
}

interface GHSearchItem {
  number: number;
  html_url: string;
  title: string;
  repository_url?: string;
  url?: string;
  pull_request?: { merged_at?: string | null };
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface GHSearchResult {
  items?: GHSearchItem[];
}

function fromSearch(item: GHSearchItem, eventType: string, occurredField: string): UpsertParams {
  const pr = item.pull_request ?? {};
  const occurred =
    (occurredField === 'merged_at' ? pr.merged_at : null) ||
    (item[occurredField] as string | undefined) ||
    item.updated_at ||
    item.created_at ||
    new Date().toISOString();
  return {
    source: 'github',
    event_type: eventType,
    ref_id: String(item.number),
    ref_url: item.html_url,
    title: item.title ?? '',
    repo_or_board: repoFromUrl(item.repository_url ?? item.url),
    occurred_at: occurred,
    raw_json: JSON.stringify(item)
  };
}

async function searchAll(query: string, token: string): Promise<GHSearchItem[]> {
  const all: GHSearchItem[] = [];
  let page = 1;
  while (page <= 10) {
    const data = await gh(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}&sort=updated&order=desc`,
      token
    ) as GHSearchResult;
    const items = data.items ?? [];
    all.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return all;
}

interface SyncGitHubOptions { days?: number; }

export async function syncGitHub({ days }: SyncGitHubOptions = {}): Promise<{
  user: string;
  bases: string[];
  since: string;
  counts: { pr_created: number; pr_reviewed: number; pr_merged: number };
}> {
  const token = env.github.token;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const window = days ?? env.backfillDays;
  const since = new Date(Date.now() - window * 86400 * 1000).toISOString().slice(0, 10);
  const user = await whoami(token);

  const writeBatch = db.transaction((items: UpsertParams[]) => {
    for (const item of items) upsert.run(item);
  });

  const created  = await searchAll(`author:${user} type:pr created:>=${since}`, token);
  writeBatch(created.map((i) => fromSearch(i, 'pr_created', 'created_at')));

  const reviewed = await searchAll(`reviewed-by:${user} type:pr updated:>=${since} -author:${user}`, token);
  writeBatch(reviewed.map((i) => fromSearch(i, 'pr_reviewed', 'updated_at')));

  const branches = listProjectBranches.all().map((r) => r.branch);
  if (branches.length === 0) branches.push('main');

  const allMerged: GHSearchItem[] = [];
  for (const branch of branches) {
    const items = await searchAll(`author:${user} type:pr is:merged base:${branch} merged:>=${since}`, token);
    allMerged.push(...items);
  }
  writeBatch(allMerged.map((i) => fromSearch(i, 'pr_merged', 'merged_at')));

  return {
    user,
    bases: branches,
    since,
    counts: {
      pr_created:  created.length,
      pr_reviewed: reviewed.length,
      pr_merged:   allMerged.length
    }
  };
}
