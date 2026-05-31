import { fmtTimeHM, fmtDuration } from '../lib/time';
import type { Entry } from '../lib/api';

interface EntryRowProps {
  entry: Entry;
}

export default function EntryRow({ entry }: EntryRowProps) {
  return (
    <div className="entry-row">
      <span className="time">
        {fmtTimeHM(entry.started_at)} — {entry.ended_at ? fmtTimeHM(entry.ended_at) : '...'}
      </span>
      <span className="dur">{fmtDuration(entry.duration_seconds ?? 0)}</span>
      <span className="proj">{entry.project_name ?? '—'}</span>
      <span className="desc">{entry.description ?? <span className="muted">(no description)</span>}</span>
    </div>
  );
}
