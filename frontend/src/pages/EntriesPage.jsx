import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rangeForPeriod, fmtDayHeader, isoDateKey, fmtDuration } from '../lib/time.js';
import EntryItem from '../components/EntryItem.jsx';

const periods = [
  { key: 'day',   label: 'Day' },
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' }
];

export default function EntriesPage() {
  const [period, setPeriod] = useState('week');
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const navigate = useNavigate();

  async function refresh() {
    const [e, p] = await Promise.all([
      api.entries.list(rangeForPeriod(period)),
      api.projects.list()
    ]);
    setEntries(e.entries);
    setProjects(p.projects);
  }

  useEffect(() => { refresh(); }, [period]);

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
        {period === 'day'
          ? entries.map((e) => (
              <EntryItem
                key={e.id}
                entry={e}
                projects={projects}
                onChange={refresh}
                onRestart={() => navigate('/')}
                editingId={editingId}
                setEditingId={setEditingId}
              />
            ))
          : Object.entries(
              entries.reduce((acc, e) => {
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
            );})
        }
      </div>
    </>
  );
}
