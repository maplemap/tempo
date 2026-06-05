export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function fmtClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtDuration(totalSeconds: number): string {
  if (!totalSeconds) return '0m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function fmtTimeHM(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(d = new Date()): string {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${days[d.getDay()]}`;
}

export function fmtDayHeader(iso: string): string {
  const d = new Date(iso);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function isoDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function rangeForPeriod(period: string): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'all') {
    start.setMonth(start.getMonth() - 2);
    start.setHours(0, 0, 0, 0);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Normalise a user-typed time string into "HH:MM".
 * Accepts: "HH:MM", "H:MM", "HHMM", "HMM", "HH", "H".
 * Rejects empty strings, any non-digit characters (outside of one allowed colon),
 * and out-of-range values (h > 23, m > 59).
 * Returns null for invalid input → caller should revert to the previous value.
 */
export function normalizeTimeInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let h: number, m: number;

  if (s.includes(':')) {
    const match = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    h = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
  } else {
    if (!/^\d{1,4}$/.test(s)) return null;
    if (s.length <= 2) {
      h = parseInt(s, 10);
      m = 0;
    } else if (s.length === 3) {
      h = parseInt(s[0], 10);
      m = parseInt(s.slice(1), 10);
    } else {
      h = parseInt(s.slice(0, 2), 10);
      m = parseInt(s.slice(2), 10);
    }
  }

  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function rangeLastNDays(n: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (n - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}
