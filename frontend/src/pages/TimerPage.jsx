import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtClock, fmtDate, fmtDuration, rangeForPeriod } from '../lib/time.js';
import EntryItem from '../components/EntryItem.jsx';

const LAST_PROJECT_KEY = 'tempo:lastProjectId';

export default function TimerPage() {
  const [current, setCurrent] = useState(null);
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(() => ({
    projectId: localStorage.getItem(LAST_PROJECT_KEY) || '',
    description: ''
  }));
  const [tick, setTick] = useState(0);
  const startedAtRef = useRef(null);

  async function refresh() {
    const [{ current }, { projects }, { entries }] = await Promise.all([
      api.timer.current(),
      api.projects.list(),
      api.entries.list(rangeForPeriod('day'))
    ]);
    setCurrent(current);
    setProjects(projects);
    setEntries(entries);
    if (current) {
      startedAtRef.current = new Date(current.started_at).getTime();
      setDraft({ projectId: current.project_id || '', description: current.description || '' });
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [current]);

  async function start() {
    const res = await api.timer.start({
      projectId: draft.projectId ? Number(draft.projectId) : null,
      description: draft.description
    });
    setCurrent(res.current);
    startedAtRef.current = new Date(res.current.started_at).getTime();
  }

  async function stop() {
    try {
      await api.timer.stop();
    } catch (e) {
      console.warn('stop failed, will resync', e);
    } finally {
      setCurrent(null);
      setTick(0);
      setDraft((d) => ({ ...d, description: '' }));
      await refresh();
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.repeat) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        current ? stop() : start();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, draft.projectId, draft.description]);

  const elapsedSec = current && startedAtRef.current
    ? Math.floor((Date.now() - startedAtRef.current) / 1000)
    : 0;

  if (current) {
    return (
      <div className="running">
        <div className="timer-display">{fmtClock(elapsedSec)}</div>
        <div className="running-desc">
          {current.description || <span style={{ opacity: 0.5 }}>(no description)</span>}
        </div>
        <div className="running-proj">{current.project_name || 'no project'}</div>
        <button className="btn" onClick={stop}>[ STOP ]</button>
        <div className="hint">press space to stop</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div>
        <div className="hd">
          <div className="brand">TEMPO</div>
          <div className="meta">{fmtDate()}</div>
        </div>
        <hr className="rule" />

        <div className="timer-display">00:00:00</div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <button className="btn solid" onClick={start}>[ START ]</button>
        </div>

        <div className="timer-form">
          <span className="label">Project</span>
          <select
            className="input"
            value={draft.projectId}
            onChange={(e) => {
              const v = e.target.value;
              setDraft({ ...draft, projectId: v });
              if (v) localStorage.setItem(LAST_PROJECT_KEY, v);
              else localStorage.removeItem(LAST_PROJECT_KEY);
            }}
          >
            <option value="">—</option>
            {projects.filter((p) => !p.archived).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <span className="label">What</span>
          <input
            className="input"
            placeholder="e.g. review PR #1301"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>

        <hr className="rule" />

        <div className="spread">
          <span className="section-title">Today</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {fmtDuration(entries.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
            {' · '}{entries.length} entries
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div className="entries">
          {entries.length === 0 && (
            <div className="muted" style={{ padding: '12px 0' }}>no entries yet</div>
          )}
          {entries.map((e) => (
            <EntryItem
              key={e.id}
              entry={e}
              projects={projects}
              onChange={refresh}
              onRestart={refresh}
              editingId={editingId}
              setEditingId={setEditingId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
