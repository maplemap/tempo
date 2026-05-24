import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function SettingsPage({ onLogout }) {
  const [projects, setProjects] = useState([]);
  const [repos, setRepos] = useState([]);
  const [name, setName] = useState('');
  const [syncState, setSyncState] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

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

  async function addProject(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.projects.create(name.trim());
    setName('');
    refresh();
  }

  async function toggleArchive(p) {
    await api.projects.update(p.id, { archived: !p.archived });
    refresh();
  }

  async function remove(p) {
    if (!confirm(`Delete project "${p.name}"? Entries keep their data but lose project link.`)) return;
    await api.projects.remove(p.id);
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
      const r = await api.sync.run();
      setSyncResult({ ok: true, ...r });
    } catch (e) {
      setSyncResult({ ok: false, error: e.message });
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
        <div key={p.id} className="dash-row" style={{ gridTemplateColumns: '1fr auto auto auto', marginBottom: 4 }}>
          <span className={p.archived ? 'muted' : 'name'}>
            {p.name} {!!p.archived && <span className="muted">(archived)</span>}
          </span>
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
          <button className="btn" onClick={() => toggleArchive(p)}>
            [ {p.archived ? 'UNARCHIVE' : 'ARCHIVE'} ]
          </button>
          <button className="btn" onClick={() => remove(p)}>[ DELETE ]</button>
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
              ✓ synced as <b>{syncResult.result.user}</b> · base <b>{syncResult.result.base}</b> · since {syncResult.result.since}
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
        Configure via .env: GITHUB_TOKEN (PAT with `repo` scope), GITHUB_BASE_BRANCH (default `main`),
        SYNC_INTERVAL_MINUTES, BACKFILL_DAYS.
      </div>
    </>
  );
}
