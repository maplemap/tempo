import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { fmtDuration, normalizeTimeInput } from '../lib/time';
import { useTimer } from '../lib/TimerContext';
import ConfirmInline from './ConfirmInline';
import CategoryBadge from './CategoryBadge';
import { renderDescription } from '../lib/renderDescription';
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

// YYYY-MM-DD — for internal comparison and applyDateInput
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// DD.MM.YYYY — for display in the text input
function toDateDisplay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function applyTimeInput(hhmm: string, originalIso: string): string {
  const d = new Date(originalIso);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Strict DD.MM.YYYY — partial input like "3.06.2026" returns null and is preserved in the field
function parseDateInput(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function applyDateInput(yyyymmdd: string, originalIso: string): string {
  const d = new Date(originalIso);
  const [year, month, day] = yyyymmdd.split('-').map(Number);
  d.setFullYear(year, month - 1, day);
  return d.toISOString();
}

export default function EntryItem({
  entry, projects = [], onChange, onRestart, timeOnly = false,
}: EntryItemProps) {
  const { start: startTimer } = useTimer();
  const [dateText, setDateText] = useState(() => toDateDisplay(entry.started_at));
  const [startText, setStartText] = useState(() => toTimeInput(entry.started_at));
  const [endText, setEndText] = useState(() => toTimeInput(entry.ended_at));
  const [projectId, setProjectId] = useState<string>(String(entry.project_id ?? ''));
  const [description, setDescription] = useState(entry.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDateText(toDateDisplay(entry.started_at));
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

  async function saveDate() {
    const parsed = parseDateInput(dateText);
    if (!parsed) {
      // Empty → reset; partial/invalid → preserve so user can complete it
      if (!dateText.trim()) setDateText(toDateDisplay(entry.started_at));
      return;
    }
    if (parsed === toDateInput(entry.started_at)) {
      setDateText(toDateDisplay(entry.started_at)); // normalize display
      return;
    }
    const startedAt = applyDateInput(parsed, entry.started_at);
    const endedAt = entry.ended_at ? applyDateInput(parsed, entry.ended_at) : entry.ended_at;
    try {
      await api.entries.update(entry.id, { started_at: startedAt, ended_at: endedAt });
      onChange?.();
    } catch (e) {
      showError(`! ${(e as Error).message}`);
      setDateText(toDateDisplay(entry.started_at));
    }
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
    let endedAt: string | null | undefined = entry.ended_at;
    if (normEnd) {
      const d = new Date(applyTimeInput(normEnd, entry.started_at));
      // Auto-advance one day if end ≤ start (overnight entry)
      if (d <= new Date(startedAt)) d.setDate(d.getDate() + 1);
      endedAt = d.toISOString();
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
    await startTimer({ projectId: entry.project_id, description: entry.description ?? '' });
    onRestart?.();
  }

  async function remove() {
    await api.entries.remove(entry.id);
    onChange?.();
  }

  return (
    <div>
      <div className={`entry-row${timeOnly ? ' entry-row--no-date' : ''}`}>
        {!timeOnly && <input
          className="entry-date-input"
          value={dateText}
          onChange={(e) => setDateText(e.target.value)}
          onBlur={saveDate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.currentTarget.blur(); return; }
            if (e.key === 'Escape') { setDateText(toDateDisplay(entry.started_at)); e.currentTarget.blur(); return; }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const base = parseDateInput(dateText) ?? toDateInput(entry.started_at);
              const d = new Date(base + 'T00:00:00');
              d.setDate(d.getDate() + (e.key === 'ArrowUp' ? 1 : -1));
              setDateText(toDateDisplay(d.toISOString()));
            }
          }}
        />}
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
          title={projects.find(p => String(p.id) === projectId)?.name || undefined}
          onChange={saveProject}
        >
          <option value="">—</option>
          {projects.filter((p) => !p.archived || p.id === entry.project_id).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <CategoryBadge category={entry.category} manual={entry.category_manual} onChange={saveCategory} />
        {editingDesc
          ? <input
              autoFocus
              className="entry-desc-input"
              value={description}
              title={description || undefined}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { setEditingDesc(false); void saveDescription(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          : <span
              className="entry-desc-input"
              style={{ cursor: 'text', display: 'block', whiteSpace: 'nowrap' }}
              title={description || undefined}
              onClick={() => setEditingDesc(true)}
            >
              {renderDescription(description, { links: entry.links, githubRepo: entry.github_repo })}
            </span>
        }
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
