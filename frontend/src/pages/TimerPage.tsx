import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { Entry, Project, Task, TimerEntry } from '../lib/api';
import { fmtClock, fmtDate, fmtDuration, fmtDayHeader, fmtTimeHM, isoDateKey, rangeLastNDays, normalizeTimeInput } from '../lib/time';
import EntryItem from '../components/EntryItem';
import { renderDescription } from '../lib/renderDescription';

const FAVICON_SIZE        = 64;
const FAVICON_RADIUS      = 30;
const FAVICON_FONT_SM     = 24;
const FAVICON_FONT_LG     = 34;

function drawFavicon(minutes: number | null, color: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const ctx = canvas.getContext('2d')!;
  const center = FAVICON_SIZE / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center, center, FAVICON_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (minutes !== null) {
    const label = minutes < 100 ? String(minutes) : '99+';
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${label.length > 2 ? FAVICON_FONT_SM : FAVICON_FONT_LG}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center, center + 2);
  }

  let link = document.getElementById('tempo-favicon') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = 'tempo-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL('image/png');
}

function clearFavicon(): void {
  const link = document.getElementById('tempo-favicon');
  if (link) link.remove();
}

const LAST_PROJECT_KEY = 'tempo:lastProjectId';

interface PastDaySectionProps {
  entries: Entry[];
  collapsed: boolean;
  onToggle: () => void;
  onRestart: () => void;
}

function PastDaySection({ entries, collapsed, onToggle, onRestart }: PastDaySectionProps) {
  if (entries.length === 0) return null;

  const totalSec = entries.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);

  async function restart(entry: Entry) {
    await api.timer.start({ projectId: entry.project_id, description: entry.description ?? '' });
    onRestart();
  }

  return (
    <>
      <hr className="rule" />
      <div
        className="spread"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <span>
          <span className="muted" style={{ marginRight: 6 }}>{collapsed ? '▶' : '▼'}</span>
          <span className="section-title" style={{ margin: 0 }}>{fmtDayHeader(entries[0].started_at)}</span>
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {fmtDuration(totalSec)}{' · '}{entries.length} entries
        </span>
      </div>
      {!collapsed && (
        <div className="entries">
          {entries.map((e) => (
            <div key={e.id} className="entry-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="proj">{e.project_name ?? '—'}</span>
              <span className="desc" style={{ flex: 1 }}>{e.description ?? ''}</span>
              <span className="entry-actions">
                <button
                  className="btn icon-btn"
                  onClick={() => restart(e)}
                  title="Restart this task"
                >[ ▶ ]</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function TimerPage() {
  const location = useLocation();
  const [current, setCurrent] = useState<TimerEntry | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projectId, setProjectId] = useState<string>(localStorage.getItem(LAST_PROJECT_KEY) || '');
  const [taskText, setTaskText] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [tick, setTick] = useState(0);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const startedAtRef = useRef<number | null>(null);

  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const elapsedSec = current && startedAtRef.current
    ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
    : 0;

  async function refresh() {
    const [{ current: timerCurrent }, { projects: prjs }, { tasks: tks }, { entries: ents }] = await Promise.all([
      api.timer.current(),
      api.projects.list(),
      api.tasks.list(),
      api.entries.list(rangeLastNDays(8)),
    ]);
    setCurrent(timerCurrent);
    setProjects(prjs);
    setTasks(tks);
    setEntries(ents);
    if (timerCurrent) {
      startedAtRef.current = new Date(timerCurrent.started_at).getTime();
      setProjectId(String(timerCurrent.project_id ?? ''));
      if (timerCurrent.task_id) {
        const t = tks.find((t) => t.id === timerCurrent.task_id) ?? null;
        setSelectedTask(t);
      }
    }
  }

  useEffect(() => { refresh(); }, [location.key]);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [current]);

  // Suppress unused variable warning for tick
  void tick;

  useEffect(() => {
    if (!current) {
      document.title = 'Tempo';
      return;
    }
    const mins = Math.floor(elapsedSec / 60);
    const parts = [current.project_name, current.description].filter(Boolean).join(' - ');
    document.title = `${String(mins).padStart(2, '0')}m — Tempo${parts ? ` | ${parts}` : ''}`;
  }, [current, elapsedSec]);

  useEffect(() => {
    if (!current) {
      drawFavicon(null, '#878787');
      return () => clearFavicon();
    }

    function tick() {
      const elapsed = startedAtRef.current
        ? (Date.now() - startedAtRef.current) / 1000
        : 0;
      drawFavicon(Math.floor(elapsed / 60), '#000');
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => { clearInterval(id); clearFavicon(); };
  }, [current]);

  useEffect(() => {
    return () => {
      document.title = 'Tempo';
      clearFavicon();
    };
  }, []);

  function toTimeInput(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function applyTimeInput(hhmm: string, originalIso: string): string {
    const d = new Date(originalIso);
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  function openStartEdit() {
    if (!current) return;
    setStartDraft(toTimeInput(current.started_at));
    setStartError(null);
    setEditingStart(true);
  }

  async function saveStartTime() {
    if (!current) return;
    const norm = normalizeTimeInput(startDraft);
    if (!norm) {
      setStartError('! invalid time');
      return;
    }
    if (norm !== startDraft) setStartDraft(norm);
    const newStartedAt = applyTimeInput(norm, current.started_at);
    if (new Date(newStartedAt).getTime() > Date.now()) {
      setStartError('! start time cannot be in the future');
      return;
    }
    try {
      await api.entries.update(current.id, { started_at: newStartedAt });
      startedAtRef.current = new Date(newStartedAt).getTime();
      setCurrent({ ...current, started_at: newStartedAt });
      setEditingStart(false);
    } catch (e) {
      setStartError(`! ${(e as Error).message}`);
    }
  }

  async function start() {
    const trimmed = taskText.trim();
    if (!trimmed) return;
    const pid = projectId ? Number(projectId) : null;

    let task = selectedTask ?? tasks.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase() &&
        (t.project_id === pid || (t.project_id === null && pid === null))
    ) ?? null;

    if (!task) {
      const { task: created } = await api.tasks.create({ name: trimmed, project_id: pid });
      setTasks((prev) => [...prev, created]);
      task = created;
    }

    const res = await api.timer.start({ projectId: pid, taskId: task.id });
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
      setTaskText('');
      setSelectedTask(null);
      await refresh();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        current ? stop() : start();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, projectId, selectedTask]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((e) => isoDateKey(e.started_at) === todayKey);

  const pastDayMap = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = isoDateKey(e.started_at);
    if (key === todayKey) continue;
    if (!pastDayMap.has(key)) pastDayMap.set(key, []);
    pastDayMap.get(key)!.push(e);
  }
  const pastDayKeys = [...pastDayMap.keys()].sort((a, b) => b.localeCompare(a));

  if (current) {
    return (
      <div className="running">
        <div className="timer-display">{fmtClock(elapsedSec)}</div>
        <div className="running-desc">
          {renderDescription(current.description, { githubRepo: current.github_repo })}
        </div>
        <div className="running-proj">{current.project_name || 'no project'}</div>

        <div className="start-wrap">
          {editingStart ? (
            <>
              <div className="start-edit-row">
                <input
                  type="text"
                  className="input start-edit-input"
                  placeholder="HH:MM"
                  value={startDraft}
                  autoFocus
                  onChange={(e) => { setStartDraft(e.target.value); setStartError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveStartTime(); }
                    if (e.key === 'Escape') setEditingStart(false);
                  }}
                />
                <button className="btn" onClick={saveStartTime}>[ SAVE ]</button>
                <button className="btn" onClick={() => setEditingStart(false)}>[ CANCEL ]</button>
              </div>
              {startError && <div className="start-error">{startError}</div>}
            </>
          ) : (
            <div className="running-started" onClick={openStartEdit}>
              started {fmtTimeHM(current.started_at)}
            </div>
          )}
        </div>

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
            value={projectId}
            onChange={(e) => {
              const v = e.target.value;
              setProjectId(v);
              if (v) localStorage.setItem(LAST_PROJECT_KEY, v);
              else localStorage.removeItem(LAST_PROJECT_KEY);
            }}
          >
            <option value="">—</option>
            {projects.filter((p) => !p.archived).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <span className="label">Task</span>
          <input
            className="input"
            placeholder="e.g. review PR #1301"
            value={taskText}
            onChange={(e) => { setTaskText(e.target.value); setSelectedTask(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void start(); }}
          />
        </div>

        <hr className="rule" />

        <div className="spread">
          <span className="section-title">Today</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {fmtDuration(todayEntries.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
            {' · '}{todayEntries.length} entries
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div className="entries">
          {todayEntries.length === 0 && (
            <div className="muted" style={{ padding: '12px 0' }}>no entries yet</div>
          )}
          {todayEntries.map((e) => (
            <EntryItem
              key={e.id}
              entry={e}
              projects={projects}
              onChange={refresh}
              onRestart={refresh}
            />
          ))}
        </div>
        {pastDayKeys.map((key) => (
          <PastDaySection
            key={key}
            entries={pastDayMap.get(key)!}
            collapsed={!expandedDays.has(key)}
            onToggle={() => toggleDay(key)}
            onRestart={refresh}
          />
        ))}
      </div>
    </div>
  );
}
