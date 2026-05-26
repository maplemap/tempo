import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Entry, Project } from '../lib/api';
import { rangeForPeriod, fmtDayHeader, isoDateKey, fmtDuration } from '../lib/time';
import EntryItem from '../components/EntryItem';

type Period = 'week' | 'month' | 'all';

const periods: Array<{ key: Period; label: string }> = [
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all',   label: 'All' }
];

function rangeForAll(monthsBack: number): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - monthsBack);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function EntriesPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allMonthsBack, setAllMonthsBack] = useState(2);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  async function fetchAndSet(p: Period, monthsBack: number) {
    const range = p === 'all' ? rangeForAll(monthsBack) : rangeForPeriod(p);
    const [e, proj] = await Promise.all([
      api.entries.list(range),
      api.projects.list()
    ]);
    setEntries(e.entries);
    setProjects(proj.projects);
    if (p === 'all') {
      const probe = await api.entries.list({
        from: new Date(0).toISOString(),
        to: range.from,
        limit: '1',
        offset: '0'
      });
      setHasMore(probe.entries.length > 0);
    }
  }

  useEffect(() => {
    setAllMonthsBack(2);
    setHasMore(false);
    setEntries([]);
    setSearch('');
    fetchAndSet(period, 2);
  }, [period]);

  async function refresh() {
    await fetchAndSet(period, allMonthsBack);
  }

  async function loadMore() {
    const nextMonths = allMonthsBack + 2;
    setAllMonthsBack(nextMonths);
    await fetchAndSet(period, nextMonths);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter(e =>
        (e.description ?? '').toLowerCase().includes(q) ||
        (e.project_name ?? '').toLowerCase().includes(q)
      )
    : entries;

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
      <input
        className="input"
        placeholder="search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8, width: '100%', boxSizing: 'border-box' }}
      />
      <div className="spread" style={{ marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} entries</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {fmtDuration(filtered.reduce((s, e) => s + (e.duration_seconds || 0), 0))}
        </span>
      </div>
      <div className="entries">
        {filtered.length === 0 && <div className="muted">no entries</div>}
        {Object.entries(
          filtered.reduce<Record<string, Entry[]>>((acc, e) => {
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
