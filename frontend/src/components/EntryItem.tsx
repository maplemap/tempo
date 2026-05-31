import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { fmtDuration, normalizeTimeInput } from '../lib/time';
import ConfirmInline from './ConfirmInline';
import CategoryBadge from './CategoryBadge';
import type { Entry, Project, Category } from '../lib/api';

interface EntryItemProps {
  entry: Entry;
  projects?: Project[];
  onChange?: () => void;
  onRestart?: () => void;
  timeOnly?: boolean;
}

function toTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function applyTimeInput(hhmm: string, originalIso: string): string {
  const d = new Date(originalIso);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export default function EntryItem({
  entry, projects = [], onChange, onRestart,
}: EntryItemProps) {
  const [startText, setStartText] = useState(() => toTimeInput(entry.started_at));
  const [endText, setEndText] = useState(() => toTimeInput(entry.ended_at));
  const [projectId, setProjectId] = useState<string>(String(entry.project_id ?? ''));
  const [description, setDescription] = useState(entry.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStartText(toTimeInput(entry.started_at));
    setEndText(toTimeInput(entry.ended_at));
    setProjectId(String(entry.project_id ?? ''));
    setDescription(entry.description ?? '');
  }, [entry.id, entry.started_at, entry.ended_at, entry.project_id, entry.description]);

  function showError(msg: string) {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setError(msg);
    errorTimer.current = setTimeout(() => setError(null), 3500);
  }

  async function saveTime() {
    const normStart = normalizeTimeInput(startText);
    const normEnd = endText ? normalizeTimeInput(endText) : null;

    if (!normStart || (endText && normEnd === null)) {
      showError('! invalid time');
      setStartText(toTimeInput(entry.started_at));
      setEndText(toTimeInput(entry.ended_at));
      return;
    }

    if (normStart !== startText) setStartText(normStart);
    if (endText && normEnd && normEnd !== endText) setEndText(normEnd);

    const startedAt = applyTimeInput(normStart, entry.started_at);
    const endedAt = normEnd
      ? applyTimeInput(normEnd, entry.ended_at ?? entry.started_at)
      : entry.ended_at;
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      showError('! end must be after start');
      setStartText(toTimeInput(entry.started_at));
      setEndText(toTimeInput(entry.ended_at));
      return;
    }
    try {
      await api.entries.update(entry.id, { started_at: startedAt, ended_at: endedAt });
      onChange?.();
    } catch (e) {
      showError(`! ${(e as Error).message}`);
    }
  }

  async function saveProject(e: React.ChangeEvent<HTMLSelectElement>) {
    const pid = e.target.value ? Number(e.target.value) : null;
    setProjectId(e.target.value);
    await api.entries.update(entry.id, { project_id: pid });
    onChange?.();
  }

  async function saveDescription() {
    const trimmed = description.trim();
    if (!trimmed) { setDescription(entry.description ?? ''); return; }
    if (trimmed === (entry.description ?? '')) return;
    try {
      await api.entries.update(entry.id, { description: trimmed });
      onChange?.();
    } catch (e) {
      showError(`! ${(e as Error).message}`);
    }
  }

  async function saveCategory(next: Category | null) {
    try {
      await api.entries.setCategory(entry.id, next);
      onChange?.();
    } catch (e) {
      showError(`! ${(e as Error).message}`);
    }
  }

  async function restart() {
    await api.timer.start({ projectId: entry.project_id, description: entry.description ?? '' });
    onRestart?.();
  }

  async function remove() {
    await api.entries.remove(entry.id);
    onChange?.();
  }

  return (
    <div>
      <div className="entry-row">
        <span className="time">
          <input
            className="entry-time-input"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={saveTime}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span className="muted">—</span>
          <input
            className="entry-time-input"
            value={endText}
            placeholder="..."
            onChange={(e) => setEndText(e.target.value)}
            onBlur={saveTime}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </span>
        <span className="dur">{fmtDuration(entry.duration_seconds ?? 0)}</span>
        <select
          className="entry-proj-select"
          value={projectId}
          onChange={saveProject}
        >
          <option value="">—</option>
          {projects.filter((p) => !p.archived || p.id === entry.project_id).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <CategoryBadge category={entry.category} manual={entry.category_manual} onChange={saveCategory} />
        <input
          className="entry-desc-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <span className="entry-actions">
          <button className="btn icon-btn" onClick={restart}>[ ▶ ]</button>
          {confirmDelete
            ? <ConfirmInline message="delete?" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
            : <button className="btn icon-btn" onClick={() => setConfirmDelete(true)}>[ × ]</button>
          }
        </span>
      </div>
      {error && <div style={{ fontSize: 11, color: '#c0392b', paddingBottom: 4 }}>{error}</div>}
    </div>
  );
}
