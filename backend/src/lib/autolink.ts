import { request } from 'undici';
// @ts-ignore — db/index.js is not yet migrated to TS
import { db } from '../db/index.js';
import { env } from './env.js';

const API = 'https://api.github.com';

function extractPRRefs(description: string): string[] {
  const out = new Set<string>();
  for (const m of description.matchAll(/(?:PR\s*#?|#)(\d+)/gi)) out.add(m[1]);
  return [...out];
}

const getAutoLinks = db.prepare<[number], { id: number; url: string }>(
  `SELECT id, url FROM entry_links WHERE entry_id = ? AND url LIKE '%/pull/%'`
);
const deleteLinkById = db.prepare<[number]>(`DELETE FROM entry_links WHERE id = ?`);
const insertLink = db.prepare<[number, string, string | null]>(
  `INSERT INTO entry_links (entry_id, url, label) VALUES (?, ?, ?)`
);

interface GHPRData {
  title: string;
}

async function fetchPR(repo: string, number: string, token: string): Promise<GHPRData | null> {
  try {
    const res = await request(`${API}/repos/${repo}/pulls/${number}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tempo-tracker'
      }
    });
    if (res.statusCode !== 200) { await res.body.dump(); return null; }
    return res.body.json() as Promise<GHPRData>;
  } catch {
    return null;
  }
}

export async function autoLinkPRs(
  entryId: number,
  description: string | null | undefined,
  githubRepo: string | null | undefined
): Promise<void> {
  const token = env.github.token;
  if (!token || !githubRepo || !description) return;

  const refs = extractPRRefs(description);
  const existingAutoLinks = getAutoLinks.all(entryId);

  const wantedUrls = new Set(refs.map((r) => `https://github.com/${githubRepo}/pull/${r}`));

  for (const link of existingAutoLinks) {
    if (!wantedUrls.has(link.url)) deleteLinkById.run(link.id);
  }

  const existingUrls = new Set(existingAutoLinks.map((l: { id: number; url: string }) => l.url));
  for (const ref of refs) {
    const url = `https://github.com/${githubRepo}/pull/${ref}`;
    if (existingUrls.has(url)) continue;
    const pr = await fetchPR(githubRepo, ref, token);
    if (!pr) continue;
    insertLink.run(entryId, url, `PR #${ref}: ${pr.title}`);
  }
}
