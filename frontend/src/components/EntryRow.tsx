import { fmtTimeHM, fmtDuration } from '../lib/time';
import type { Entry } from '../lib/api';

interface EntryRowProps {
  entry: Entry;
  badges?: string[];
}

export default function EntryRow({ entry, badges }: EntryRowProps) {
  const shown = badges ?? entry.badges ?? [];
  return (
    <div className="entry-row">
      <span className="time">
        {fmtTimeHM(entry.started_at)} — {entry.ended_at ? fmtTimeHM(entry.ended_at) : '...'}
      </span>
      <span className="dur">{fmtDuration(entry.duration_seconds ?? 0)}</span>
      <span className="proj">{entry.project_name ?? '—'}</span>
      <span className="desc">{entry.description ?? <span className="muted">(no description)</span>}</span>
      <span className="badges">
        {shown.map((b) => (
          <span key={b} className="badge">{b}</span>
        ))}
      </span>
    </div>
  );
}
