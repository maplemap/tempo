import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ByCategoryStats } from '../lib/api';
import { rangeForPeriod, fmtDuration, fmtDayTimeRange } from '../lib/time';
import { useMidnightRefresh } from '../lib/hooks';
import AsciiBar from '../components/AsciiBar';
import { renderDescription } from '../lib/renderDescription';

type Period = 'week' | 'month' | 'all';

interface StatsData {
  range: { from: string; to: string };
  total: number;
  byProject: Array<{ project_name: string; project_id: number | null; total: number }>;
  byDay: Array<{ day: string; total: number }>;
  counters: { prs_created: number; reviews_done: number; prs_merged: number };
  discrepancies: Array<{ entryId: number; description: string | null; missingRefs: Array<{ ref: string; url: string | null }> }>;
}

const periods: Array<{ key: Period; label: string }> = [
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'all',   label: 'All' }
];

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [byCategory, setByCategory] = useState<ByCategoryStats | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  async function fetchAndSet(p: Period) {
    const range = p === 'all' ? { from: new Date(0).toISOString(), to: new Date().toISOString() } : rangeForPeriod(p);
    const [statsData, categoryData] = await Promise.all([
      api.stats.get(range),
      api.stats.byCategory(range)
    ]);
    setStats(statsData as StatsData);
    setByCategory(categoryData);
  }

  useEffect(() => {
    setSearch('');
    setExpandedCats(new Set());
    setExpandedGroups(new Set());
    fetchAndSet(period);
  }, [period]);

  useMidnightRefresh(() => fetchAndSet(period));

  function toggleCat(c: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (!stats) return null;

  const max = Math.max(1, ...stats.byProject.map((r) => r.total || 0));

  const q = search.trim().toLowerCase();
  const filteredCategories = byCategory
    ? (q
        ? byCategory.categories
            .map((cat) => {
              const groups = cat.groups.filter((g) => (g.description ?? '').toLowerCase().includes(q));
              return { ...cat, groups, total: groups.reduce((s, g) => s + g.total, 0) };
            })
            .filter((cat) => cat.groups.length > 0)
        : byCategory.categories)
    : [];

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
          <span className="name" title={row.project_name}>{row.project_name}</span>
          <span>{fmtDuration(row.total)}</span>
          <AsciiBar ratio={row.total / max} />
          <span className="muted">{Math.round((row.total / stats.total) * 100) || 0}%</span>
        </div>
      ))}

      {byCategory && byCategory.categories.length > 0 && (
        <>
          <hr className="rule" />
          <div className="section-title">By category</div>
          <input
            className="input"
            placeholder="search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8, width: '100%', boxSizing: 'border-box' }}
          />
          {filteredCategories.length === 0 && <div className="muted">no matching tasks</div>}
          {filteredCategories.map((cat) => {
            const ratio = byCategory.total > 0 ? cat.total / byCategory.total : 0;
            const pct = Math.round(ratio * 100);
            const open = q ? true : expandedCats.has(cat.category);
            return (
              <div key={cat.category}>
                <div
                  className="dash-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleCat(cat.category)}
                >
                  <span className="name" title={cat.category}>{open ? '▾' : '▸'} [{cat.category}]</span>
                  <span>{fmtDuration(cat.total)}</span>
                  <AsciiBar ratio={ratio} />
                  <span className="muted">{pct}%</span>
                </div>
                {open && cat.groups.map((g) => {
                  const groupKey = `${cat.category}:${(g.description ?? '').toLowerCase().trim() || '__empty__'}`;
                  const groupOpen = expandedGroups.has(groupKey);
                  return (
                    <div key={groupKey}>
                      <div
                        className="dash-row"
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleGroup(groupKey)}
                      >
                        <span className="name" title={g.description ?? ''} style={{ paddingLeft: 16 }}>{groupOpen ? '▾' : '▸'} {renderDescription(g.description, { links: g.entries[0]?.links })}</span>
                        <span>{fmtDuration(g.total)}</span>
                        <span></span>
                        <span></span>
                      </div>
                      {groupOpen && g.entries.map((e) => (
                        <div key={e.id} className="dash-row">
                          <span className="muted" style={{ paddingLeft: 32, fontSize: 12 }}>
                            {fmtDayTimeRange(e.started_at, e.ended_at)}
                          </span>
                          <span>{fmtDuration(e.duration_seconds)}</span>
                          <span></span>
                          <span></span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      )}


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
              · {d.description}{' '}
              <span className="muted">
                (refs:{' '}
                {d.missingRefs.map((r, i) => (
                  <span key={r.ref}>
                    {i > 0 && ', '}
                    {r.url
                      ? <a href={r.url} target="_blank" rel="noreferrer">#{r.ref}</a>
                      : `#${r.ref}`}
                  </span>
                ))}
                )
              </span>
            </div>
          ))}
        </>
      )}
    </>
  );
}
