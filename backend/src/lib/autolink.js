import { request } from 'undici';
import { db } from '../db/index.js';
import { env } from './env.js';

const API = 'https://api.github.com';

function extractPRRefs(description) {
  if (!description) return [];
  const out = new Set();
  for (const m of description.matchAll(/(?:PR\s*#?|#)(\d+)/gi)) out.add(m[1]);
  return [...out];
}

const getAutoLinks   = db.prepare(`SELECT id, url FROM entry_links WHERE entry_id = ? AND url LIKE '%/pull/%'`);
const deleteLinkById = db.prepare(`DELETE FROM entry_links WHERE id = ?`);
const insertLink     = db.prepare(`INSERT INTO entry_links (entry_id, url, label) VALUES (?, ?, ?)`);

async function fetchPR(repo, number) {
  try {
    const res = await request(`${API}/repos/${repo}/pulls/${number}`, {
      headers: {
        Authorization: `Bearer ${env.github.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tempo-tracker'
      }
    });
    if (res.statusCode !== 200) { await res.body.dump(); return null; }
    return res.body.json();
  } catch {
    return null;
  }
}

export async function autoLinkPRs(entryId, description, githubRepo) {
  if (!env.github.token || !githubRepo || !description) return;

  const refs = extractPRRefs(description);
  const existingAutoLinks = getAutoLinks.all(entryId);

  const wantedUrls = new Set(refs.map((r) => `https://github.com/${githubRepo}/pull/${r}`));

  for (const link of existingAutoLinks) {
    if (!wantedUrls.has(link.url)) deleteLinkById.run(link.id);
  }

  const existingUrls = new Set(existingAutoLinks.map((l) => l.url));
  for (const ref of refs) {
    const url = `https://github.com/${githubRepo}/pull/${ref}`;
    if (existingUrls.has(url)) continue;
    const pr = await fetchPR(githubRepo, ref);
    if (!pr) continue;
    insertLink.run(entryId, url, `PR #${ref}: ${pr.title}`);
  }
}
