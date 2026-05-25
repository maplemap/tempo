import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { fmtTimeHM, fmtDuration } from '../lib/time';
import ConfirmInline from './ConfirmInline';
import { renderDescription } from '../lib/renderDescription';
import type { Entry, Project } from '../lib/api';

interface EntryItemProps {
  entry: Entry;
  projects?: Project[];
  onChange?: () => void;
  onRestart?: () => void;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
}

interface Draft {
  description: string;
  project_id: number | string;
  started_at: string;
  ended_at: string;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  return s ? new Date(s).toISOString() : null;
}

export default function EntryItem({
  entry, projects = [], onChange, onRestart, editingId, setEditingId
}: EntryItemProps) {
  const editing = editingId === entry.id;
  const [draft, setDraft] = useState<Draft>({
    description: entry.description ?? '',
    project_id: entry.project_id ?? '',
    started_at: toLocalInput(entry.started_at),
    ended_at: toLocalInput(entry.ended_at)
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(msg: string): void {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setError(msg);
    errorTimer.current = setTimeout(() => setError(null), 3500);
  }

  useEffect(() => {
    if (!editing) return;
    setDraft({
      description: entry.description ?? '',
      project_id: entry.project_id ?? '',
      started_at: toLocalInput(entry.started_at),
      ended_at: toLocalInput(entry.ended_at)
    });
  }, [editing]);

  async function save(): Promise<void> {
    const now = Date.now();
    const startedAt = fromLocalInput(draft.started_at) ?? entry.started_at;
    const endedAt = draft.ended_at ? fromLocalInput(draft.ended_at) : entry.ended_at;

    if (new Date(startedAt).getTime() > now) { showError('! start time cannot be in the future'); return; }
    if (endedAt && new Date(endedAt).getTime() > now) { showError('! end time cannot be in the future'); return; }
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) { showError('! end time must be after start time'); return; }

    try {
      await api.entries.update(entry.id, {
        description: draft.description,
        project_id: draft.project_id === '' ? null : Number(draft.project_id),
        started_at: startedAt,
        ended_at: endedAt
      });
      setEditingId(null);
      onChange?.();
    } catch (e) {
      showError(`! ${(e as Error).message}`);
    }
  }

  async function remove(): Promise<void> {
    await api.entries.remove(entry.id);
    onChange?.();
  }

  async function restart(): Promise<void> {
    await api.timer.start({ projectId: entry.project_id, description: entry.description ?? '' });
    onRestart?.();
  }

  const nowMax = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 1, 0, 0);
    return toLocalInput(d.toISOString());
  })();

  if (editing) {
    return (
      <div className="entry-edit">
        <div className="entry-edit-row">
          <input
            type="datetime-local"
            className="input"
            value={draft.started_at}
            max={nowMax}
            onChange={(e) => setDraft({ ...draft, started_at: e.target.value })}
          />
          <span className="muted">→</span>
          <input
            type="datetime-local"
            className="input"
            value={draft.ended_at}
            max={nowMax}
            onChange={(e) => setDraft({ ...draft, ended_at: e.target.value })}
          />
          <select
            className="input"
            value={draft.project_id}
            onChange={(e) => setDraft({ ...draft, project_id: e.target.value })}
          >
            <option value="">—</option>
            {projects.filter((p) => !p.archived || p.id === entry.project_id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="entry-edit-row">
          <input
            className="input"
            placeholder="description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            style={{ flex: 1 }}
          />
          <button className="btn solid" onClick={save}>[ SAVE ]</button>
          <button className="btn" onClick={() => { setEditingId(null); setConfirmDelete(false); }}>[ CANCEL ]</button>
          {confirmDelete
            ? <ConfirmInline message="delete entry?" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
            : <button className="btn" onClick={() => setConfirmDelete(true)}>[ DELETE ]</button>
          }
        </div>
        {error && <div className="entry-error">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div
        className="entry-row entry-clickable"
        onClick={() => setEditingId(entry.id)}
        title="Click to edit"
      >
        <span className="time">
          {fmtTimeHM(entry.started_at)} — {entry.ended_at ? fmtTimeHM(entry.ended_at) : '...'}
        </span>
        <span className="dur">{fmtDuration(entry.duration_seconds ?? 0)}</span>
        <span className="proj">{entry.project_name ?? '—'}</span>
        <span className="desc">
          {renderDescription(entry.description, { links: entry.links })}
        </span>
        <span className="badges">
          {(entry.badges ?? []).map((b) => (
            <span key={b} className="badge">{b}</span>
          ))}
        </span>
        <span className="entry-actions">
          <button
            className="btn icon-btn"
            onClick={(e) => { e.stopPropagation(); restart(); }}
            title="Restart this task"
          >
            [ ▶ ]
          </button>
          {confirmDelete
            ? (
              <span onClick={(e) => e.stopPropagation()}>
                <ConfirmInline message="delete?" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
              </span>
            )
            : (
              <button
                className="btn icon-btn"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                title="Delete entry"
              >
                [ × ]
              </button>
            )
          }
        </span>
      </div>
    </div>
  );
}
