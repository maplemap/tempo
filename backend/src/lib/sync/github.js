import { request } from 'undici';
import { db } from '../../db/index.js';
import { env } from '../env.js';

const API = 'https://api.github.com';

const upsert = db.prepare(`
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

async function gh(path) {
  const res = await request(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${env.github.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tempo-tracker'
    }
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`GitHub ${res.statusCode}: ${path} — ${body.slice(0, 200)}`);
  }
  return res.body.json();
}

async function whoami() {
  const me = await gh('/user');
  return me.login;
}

function repoFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/repos\/([^/]+\/[^/]+)/);
  return m ? m[1] : null;
}

function fromSearch(item, eventType, occurredField) {
  const pr = item.pull_request || {};
  const occurred =
    (occurredField === 'merged_at' ? pr.merged_at : null) ||
    item[occurredField] ||
    item.updated_at ||
    item.created_at;
  return {
    source: 'github',
    event_type: eventType,
    ref_id: String(item.number),
    ref_url: item.html_url,
    title: item.title || '',
    repo_or_board: repoFromUrl(item.repository_url || item.url),
    occurred_at: occurred,
    raw_json: JSON.stringify(item)
  };
}

async function searchAll(query) {
  const all = [];
  let page = 1;
  while (page <= 10) {
    const data = await gh(`/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}&sort=updated&order=desc`);
    const items = data.items || [];
    all.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return all;
}

const listProjectBranches = db.prepare(
  `SELECT DISTINCT COALESCE(github_base_branch, 'main') as branch FROM projects WHERE github_repo IS NOT NULL`
);

export async function syncGitHub({ days } = {}) {
  if (!env.github.token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  const window = days || env.backfillDays;
  const since = new Date(Date.now() - window * 86400 * 1000).toISOString().slice(0, 10);
  const user = await whoami();

  const writeBatch = db.transaction((items) => {
    for (const item of items) upsert.run(item);
  });

  const created  = await searchAll(`author:${user} type:pr created:>=${since}`);
  writeBatch(created.map((i) => fromSearch(i, 'pr_created', 'created_at')));

  const reviewed = await searchAll(`reviewed-by:${user} type:pr updated:>=${since} -author:${user}`);
  writeBatch(reviewed.map((i) => fromSearch(i, 'pr_reviewed', 'updated_at')));

  const branches = listProjectBranches.all().map((r) => r.branch);
  if (branches.length === 0) branches.push('main');

  const allMerged = [];
  for (const branch of branches) {
    const items = await searchAll(`author:${user} type:pr is:merged base:${branch} merged:>=${since}`);
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
