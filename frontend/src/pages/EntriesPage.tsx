import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Entry, Project } from '../lib/api';
import { rangeForPeriod, fmtDayHeader, isoDateKey, fmtDuration } from '../lib/time';
import EntryItem from '../components/EntryItem';

type Period = 'week' | 'month' | 'all';

const ITEMS_PER_PAGE = 50;

const periods: Array<{ key: Period; label: string }> = [
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all',   label: 'All' }
];

export default function EntriesPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const navigate = useNavigate();

  async function load(p: Period, off: number, accumulate: boolean) {
    const range = rangeForPeriod(p);
    const params: Record<string, string> = { ...range };
    if (p === 'all') {
      params.limit = String(ITEMS_PER_PAGE);
      params.offset = String(off);
    }
    const [e, proj] = await Promise.all([
      api.entries.list(params),
      api.projects.list()
    ]);
    setEntries(prev => accumulate ? [...prev, ...e.entries] : e.entries);
    setProjects(proj.projects);
    setHasMore(e.hasMore);
  }

  useEffect(() => {
    setOffset(0);
    setEntries([]);
    setHasMore(false);
    load(period, 0, false);
  }, [period]);

  async function refresh() {
    setOffset(0);
    await load(period, 0, false);
  }

  async function loadMore() {
    const nextOffset = offset + ITEMS_PER_PAGE;
    setOffset(nextOffset);
    await load(period, nextOffset, true);
  }

  return (
    <>
      <div className="hd">
        <div className="brand">TEMPO / ENTRIES</div>
        <div className="flex">
          {periods.map((p) => (
            <button
              key={p.key}
              className={`btn${period === p.key ? ' solid' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              [ {p.label} ]
            </button>
          ))}
        </div>
      </div>
      <hr className="rule" />
      <div className="spread" style={{ marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>{entries.length} entries</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {fmtDuration(entries.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
        </span>
      </div>
      <div className="entries">
        {entries.length === 0 && <div className="muted">no entries</div>}
        {Object.entries(
          entries.reduce<Record<string, Entry[]>>((acc, e) => {
            const key = isoDateKey(e.started_at);
            (acc[key] = acc[key] || []).push(e);
            return acc;
          }, {})
        )
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([dateKey, group]) => {
          const totalSec = group.reduce((s, e) => s + (e.duration_seconds || 0), 0);
          return (
            <div key={dateKey}>
              <div className="spread" style={{ marginTop: 16 }}>
                <span className="section-title" style={{ margin: 0 }}>{fmtDayHeader(group[0].started_at)}</span>
                <span className="muted" style={{ fontSize: 12 }}>{fmtDuration(totalSec)}</span>
              </div>
              <hr className="rule" style={{ marginTop: 6 }} />
              {group.map((e) => (
                <EntryItem
                  key={e.id}
                  entry={e}
                  projects={projects}
                  onChange={refresh}
                  onRestart={() => navigate('/')}
                  editingId={editingId}
                  setEditingId={setEditingId}
                />
              ))}
            </div>
          );
        })}
        {period === 'all' && hasMore && (
          <button className="btn" style={{ marginTop: 16, width: '100%' }} onClick={loadMore}>
            [ Load More ]
          </button>
        )}
      </div>
    </>
  );
}
