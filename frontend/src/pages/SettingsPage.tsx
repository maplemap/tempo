import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Project, SyncStateRow } from '../lib/api';
import ConfirmInline from '../components/ConfirmInline';

interface SettingsPageProps { onLogout: () => void; }

interface SyncRunResult {
  user: string;
  bases: string[];
  since: string;
  counts: { pr_created: number; pr_reviewed: number; pr_merged: number };
}

type SyncResultState =
  | { ok: true; result: SyncRunResult }
  | { ok: false; error: string };

export default function SettingsPage({ onLogout }: SettingsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [repos, setRepos] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [syncState, setSyncState] = useState<SyncStateRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResultState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  async function refresh() {
    const [p, s] = await Promise.all([api.projects.list(), api.sync.state()]);
    setProjects(p.projects);
    setSyncState(s.state);
  }

  async function loadRepos() {
    try {
      const r = await api.github.repos();
      setRepos(r.repos);
    } catch {}
  }

  useEffect(() => { refresh(); loadRepos(); }, []);

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.projects.create(name.trim());
    setName('');
    refresh();
  }

  async function toggleArchive(p: Project) {
    await api.projects.update(p.id, { archived: !p.archived });
    refresh();
  }

  async function remove(p: Project) {
    await api.projects.remove(p.id);
    setConfirmDeleteId(null);
    refresh();
  }

  async function logout() {
    await api.auth.logout();
    onLogout?.();
  }

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await api.sync.run() as unknown as { ok: boolean; result: SyncRunResult };
      setSyncResult({ ok: true, result: r.result });
    } catch (e) {
      setSyncResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  const github = syncState.find((s) => s.source === 'github');

  return (
    <>
      <div className="hd">
        <div className="brand">TEMPO / SETTINGS</div>
        <button className="btn" onClick={logout}>[ LOGOUT ]</button>
      </div>
      <hr className="rule" />

      <div className="section-title">Projects</div>
      <form className="flex" onSubmit={addProject} style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="new project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit">[ ADD ]</button>
      </form>

      {projects.length === 0 && <div className="muted">no projects yet</div>}
      {projects.map((p) => (
        <div key={p.id} style={{ marginBottom: 8 }}>
          <div className="dash-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <span className={p.archived ? 'muted' : 'name'}>
              {p.name} {!!p.archived && <span className="muted">(archived)</span>}
            </span>
            <button className="btn" onClick={() => toggleArchive(p)}>
              [ {p.archived ? 'UNARCHIVE' : 'ARCHIVE'} ]
            </button>
            {confirmDeleteId === p.id
              ? <ConfirmInline message={`delete "${p.name}"?`} onConfirm={() => remove(p)} onCancel={() => setConfirmDeleteId(null)} />
              : <button className="btn" onClick={() => setConfirmDeleteId(p.id)}>[ DELETE ]</button>
            }
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>GitHub repo</label>
              <select
                className="input"
                style={{ fontSize: 12, width: 220 }}
                value={p.github_repo || ''}
                onChange={(e) => {
                  api.projects.update(p.id, { github_repo: e.target.value || null }).then(refresh);
                }}
              >
                <option value="">— no repo —</option>
                {repos.map((r) => <option key={r} value={r}>{r}</option>)}
                {p.github_repo && !repos.includes(p.github_repo) && (
                  <option value={p.github_repo}>{p.github_repo}</option>
                )}
              </select>
            </div>
            {p.github_repo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)' }}>Base branch</label>
                <input
                  className="input"
                  style={{ fontSize: 12, width: 140 }}
                  placeholder="main"
                  value={p.github_base_branch || ''}
                  onChange={(e) => {
                    api.projects.update(p.id, { github_base_branch: e.target.value || null }).then(refresh);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ))}

      <hr className="rule" />

      <div className="spread">
        <div className="section-title">GitHub sync</div>
        <button className="btn" onClick={syncNow} disabled={syncing}>
          [ {syncing ? 'SYNCING...' : 'SYNC NOW'} ]
        </button>
      </div>

      <div style={{ fontSize: 13, marginTop: 8 }}>
        {github ? (
          <>
            <div>last sync: <span className="muted">{github.last_synced_at}</span></div>
            {github.last_error && (
              <div className="err" style={{ marginTop: 4 }}>! {github.last_error}</div>
            )}
          </>
        ) : (
          <div className="muted">no sync runs yet</div>
        )}
      </div>

      {syncResult && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {syncResult.ok ? (
            <div>
              ✓ synced as <b>{syncResult.result.user}</b> · bases <b>{syncResult.result.bases.join(', ')}</b> · since {syncResult.result.since}
              <div className="muted" style={{ marginTop: 4 }}>
                created: {syncResult.result.counts.pr_created} ·
                reviewed: {syncResult.result.counts.pr_reviewed} ·
                merged: {syncResult.result.counts.pr_merged}
              </div>
            </div>
          ) : (
            <div className="err">! {syncResult.error}</div>
          )}
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Configure via .env: GITHUB_TOKEN (PAT with `repo` scope), SYNC_INTERVAL_MINUTES, BACKFILL_DAYS.
        Base branch per project defaults to `main`.
      </div>
    </>
  );
}
