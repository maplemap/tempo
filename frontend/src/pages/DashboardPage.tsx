import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { rangeForPeriod, fmtDuration } from '../lib/time';
import AsciiBar from '../components/AsciiBar';

type Period = 'day' | 'week' | 'month';

interface StatsData {
  range: { from: string; to: string };
  total: number;
  byProject: Array<{ project_name: string; project_id: number | null; total: number }>;
  byDay: Array<{ day: string; total: number }>;
  counters: { prs_created: number; reviews_done: number; prs_merged: number };
  discrepancies: Array<{ entryId: number; description: string | null; missingRefs: string[] }>;
}

const periods: Array<{ key: Period; label: string }> = [
  { key: 'day',   label: 'Day' },
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' }
];

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    api.stats.get(rangeForPeriod(period)).then((data) => setStats(data as StatsData));
  }, [period]);

  if (!stats) return null;

  const max = Math.max(1, ...stats.byProject.map((r) => r.total || 0));
  const maxDay = Math.max(1, ...stats.byDay.map((r) => r.total || 0));

  return (
    <>
      <div className="hd">
        <div className="brand">TEMPO / DASHBOARD</div>
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

      <div className="spread">
        <div className="section-title">Total</div>
        <div style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>
          {fmtDuration(stats.total)}
        </div>
      </div>

      <div className="section-title">By project</div>
      {stats.byProject.length === 0 && <div className="muted">no data</div>}
      {stats.byProject.map((row) => (
        <div key={row.project_id ?? 'none'} className="dash-row">
          <span className="name">{row.project_name}</span>
          <span>{fmtDuration(row.total)}</span>
          <AsciiBar ratio={row.total / max} />
          <span className="muted">{Math.round((row.total / stats.total) * 100) || 0}%</span>
        </div>
      ))}

      <hr className="rule" />

      <div className="section-title">By day</div>
      {stats.byDay.map((row) => (
        <div key={row.day} className="dash-row">
          <span className="name">{row.day}</span>
          <span>{fmtDuration(row.total)}</span>
          <AsciiBar ratio={row.total / maxDay} />
          <span></span>
        </div>
      ))}

      <hr className="rule" />

      <div className="section-title">Your work (verified from GitHub)</div>
      <div className="counters">
        <div className="counter-block">
          <div className="num">{stats.counters.prs_created}</div>
          <div className="lbl">Tasks done (PRs created)</div>
        </div>
        <div className="counter-block">
          <div className="num">{stats.counters.reviews_done}</div>
          <div className="lbl">Reviews</div>
        </div>
        <div className="counter-block">
          <div className="num">{stats.counters.prs_merged}</div>
          <div className="lbl">Shipped to main (PRs merged)</div>
        </div>
      </div>

      {stats.discrepancies.length > 0 && (
        <>
          <hr className="rule" />
          <div className="section-title">Discrepancies</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            you tracked these but no matching external event was found
          </div>
          {stats.discrepancies.map((d) => (
            <div key={d.entryId} style={{ padding: '4px 0' }}>
              · {d.description} <span className="muted">(refs: {d.missingRefs.join(', ')})</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
