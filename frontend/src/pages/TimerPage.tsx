import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { Entry, Project } from '../lib/api';
import { fmtClock, fmtDate, fmtDuration, fmtDayHeader, isoDateKey, rangeLastNDays, normalizeTimeInput, toTimeInput, applyTimeInput } from '../lib/time';
import { useMidnightRefresh } from '../lib/hooks';
import { useTimer } from '../lib/TimerContext';
import EntryItem from '../components/EntryItem';
import TaskAutocomplete from '../components/TaskAutocomplete';

const LAST_PROJECT_KEY = 'tempo:lastProjectId';

interface PastDaySectionProps {
  entries: Entry[];
  projects: Project[];
  collapsed: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}

function PastDaySection({ entries, projects, collapsed, onToggle, onRefresh }: PastDaySectionProps) {
  if (entries.length === 0) return null;

  const totalSec = entries.reduce((s, e) => s + (e.duration_seconds ?? 0), 0);

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
            <EntryItem
              key={e.id}
              entry={e}
              projects={projects}
              onChange={onRefresh}
              onRestart={onRefresh}
              timeOnly
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function TimerPage() {
  const location = useLocation();
  const { current, elapsedSec, start: startTimer, stop: stopTimer, updateStartedAt, refresh: refreshTimer } = useTimer();
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string>(localStorage.getItem(LAST_PROJECT_KEY) || '');
  const [taskText, setTaskText] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [today, setToday] = useState(() => new Date());
  const [startDraft, setStartDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const skipBlurSave = useRef(false);
  const startInputFocused = useRef(false);

  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function refresh() {
    const [{ projects: prjs }, { entries: ents }, { descriptions }] = await Promise.all([
      api.projects.list(),
      api.entries.list(rangeLastNDays(8)),
      api.entries.suggestions(),
    ]);
    setProjects(prjs);
    setEntries(ents);
    setSuggestions(descriptions);
    await refreshTimer();
  }

  useEffect(() => { refresh(); }, [location.key]);

  // When the running entry switches to a different task (e.g. Start from Plans),
  // the previous entry was just closed on the backend — refetch so it appears in
  // the day list (open entries aren't returned by /api/entries).
  const prevCurrentId = useRef<number | null>(null);
  useEffect(() => {
    const id = current?.id ?? null;
    if (id !== null && prevCurrentId.current !== null && id !== prevCurrentId.current) {
      void refresh();
    }
    prevCurrentId.current = id;
  }, [current?.id]);

  useEffect(() => {
    if (current) setProjectId(String(current.project_id ?? ''));
  }, [current]);

  useEffect(() => {
    if (!current || startInputFocused.current) return;
    setStartDraft(toTimeInput(current.started_at));
  }, [current]);

  useMidnightRefresh(() => {
    setToday(new Date());
    void refresh();
  });

  async function start(overrideText?: string) {
    const trimmed = (overrideText ?? taskText).trim();
    if (!trimmed) return;
    const pid = projectId ? Number(projectId) : null;
    await startTimer({ projectId: pid, description: trimmed });
  }

  async function stop() {
    await stopTimer();
    setTaskText('');
    await refresh();
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
      await updateStartedAt(newStartedAt);
      setStartError(null);
    } catch (e) {
      setStartError(`! ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        current ? void stop() : void start();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, projectId]);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayCompletedSec = entries
    .filter((e) => isoDateKey(e.started_at) === todayKey)
    .reduce((s, e) => s + (e.duration_seconds || 0), 0);
  const currentTodaySec = current && isoDateKey(current.started_at) === todayKey ? elapsedSec : 0;
  const todayTotalSec = todayCompletedSec + currentTodaySec;

  const runningEntry: Entry | null = current ? {
    id: current.id,
    project_id: current.project_id,
    project_name: current.project_name,
    github_repo: current.github_repo,
    description: current.description,
    started_at: current.started_at,
    ended_at: null,
    duration_seconds: null,
    category: current.category,
    category_manual: current.category_manual,
    links: [],
  } : null;

  const todayEntries = runningEntry && isoDateKey(runningEntry.started_at) === todayKey
    ? [runningEntry, ...entries.filter((e) => isoDateKey(e.started_at) === todayKey)]
    : entries.filter((e) => isoDateKey(e.started_at) === todayKey);

  const pastDayMap = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = isoDateKey(e.started_at);
    if (key === todayKey) continue;
    if (!pastDayMap.has(key)) pastDayMap.set(key, []);
    pastDayMap.get(key)!.push(e);
  }
  const pastDayKeys = [...pastDayMap.keys()].sort((a, b) => b.localeCompare(a));

  // The most recent past day (yesterday) starts expanded; the user can still
  // collapse it. Tracked by key so it re-applies to the newest day after midnight.
  const autoExpandedKey = useRef<string | null>(null);
  const newestPastKey = pastDayKeys[0] ?? null;
  useEffect(() => {
    if (newestPastKey && autoExpandedKey.current !== newestPastKey) {
      autoExpandedKey.current = newestPastKey;
      setExpandedDays((prev) => new Set(prev).add(newestPastKey));
    }
  }, [newestPastKey]);

  const runningInfoText = current
    ? [current.project_name, current.description].filter(Boolean).join(' · ')
    : ' ';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div>
        <div className="hd">
          <div className="brand">TEMPO</div>
          <div className="meta">{fmtDate(today)}</div>
        </div>
        <hr className="rule" />

        <div className="running-started" style={{ visibility: current ? 'visible' : 'hidden' }}>
          started{' '}
          <input
            className="start-inline-input"
            value={startDraft}
            size={6}
            onChange={(e) => { setStartDraft(e.target.value); setStartError(null); }}
            onFocus={() => { startInputFocused.current = true; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void saveStartTime(); }
              if (e.key === 'Escape') {
                skipBlurSave.current = true;
                setStartDraft(toTimeInput(current?.started_at));
                setStartError(null);
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={() => {
              startInputFocused.current = false;
              if (skipBlurSave.current) { skipBlurSave.current = false; return; }
              void saveStartTime();
            }}
          />
          {startError && <div className="start-error">{startError}</div>}
        </div>

        <div className="timer-display">
          <span className="running-dot-slot">{current && <span className="running-dot" />}</span>
          <span>{current ? fmtClock(elapsedSec) : '00:00:00'}</span>
          <span className="running-dot-slot" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          {current ? (
            <button className="btn solid" onClick={() => void stop()}>[ STOP ]</button>
          ) : (
            <button className="btn solid" disabled={!taskText.trim()} onClick={() => void start()}>[ START ]</button>
          )}
        </div>

        <div className="timer-form">
          <div className="running-info" style={{ visibility: current ? 'visible' : 'hidden' }}>
            {runningInfoText}
          </div>

          <span className="label" style={{ visibility: current ? 'hidden' : 'visible', gridRow: 1, gridColumn: 1 }}>Project</span>
          <select
            className="input"
            style={{ visibility: current ? 'hidden' : 'visible', gridRow: 1, gridColumn: 2 }}
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

          <span className="label" style={{ visibility: current ? 'hidden' : 'visible', gridRow: 2, gridColumn: 1 }}>Task</span>
          <div style={{ visibility: current ? 'hidden' : 'visible', gridRow: 2, gridColumn: 2 }}>
            <TaskAutocomplete
              value={taskText}
              onChange={setTaskText}
              onEnter={(finalText) => void start(finalText)}
              descriptions={suggestions}
            />
          </div>
        </div>

        <div className="spread">
          <span className="section-title">Today</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {fmtDuration(todayTotalSec)}
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
              timeOnly
              running={runningEntry?.id === e.id}
              runningElapsedSec={elapsedSec}
            />
          ))}
        </div>
        {pastDayKeys.map((key) => (
          <PastDaySection
            key={key}
            entries={pastDayMap.get(key)!}
            projects={projects}
            collapsed={!expandedDays.has(key)}
            onToggle={() => toggleDay(key)}
            onRefresh={refresh}
          />
        ))}
      </div>
    </div>
  );
}
