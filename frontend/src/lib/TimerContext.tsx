import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { TimerEntry } from './api';

const FAVICON_SIZE = 64;
const FAVICON_CORNER = 14;

function drawFavicon(minutes: number | null): void {
  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const ctx = canvas.getContext('2d')!;
  const s = FAVICON_SIZE;
  const r = FAVICON_CORNER;

  ctx.fillStyle = minutes !== null ? '#fe5f33' : '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f9f9f9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (minutes === null) {
    ctx.font = 'bold 44px monospace';
    ctx.fillText('T', s / 2, s / 2 + 2);
  } else {
    const label = minutes < 100 ? String(minutes) : '99+';
    ctx.font = `bold ${label.length > 2 ? 28 : 38}px monospace`;
    ctx.fillText(label, s / 2, s / 2 + 2);
  }

  let link = document.getElementById('tempo-favicon') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = 'tempo-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL('image/png');
}

function clearFavicon(): void {
  const link = document.getElementById('tempo-favicon');
  if (link) link.remove();
}

interface TimerContextValue {
  current: TimerEntry | null;
  elapsedSec: number;
  start: (params: { projectId?: number | null; description?: string }) => Promise<TimerEntry>;
  stop: () => Promise<void>;
  updateStartedAt: (iso: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<TimerEntry | null>(null);
  const [tick, setTick] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  async function refresh() {
    const { current: c } = await api.timer.current();
    setCurrent(c);
    startedAtRef.current = c ? new Date(c.started_at).getTime() : null;
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [current]);
  void tick;

  const elapsedSec = current && startedAtRef.current
    ? Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))
    : 0;

  useEffect(() => {
    if (!current) {
      document.title = 'Tempo';
      return;
    }
    const mins = Math.floor(elapsedSec / 60);
    const parts = [current.project_name, current.description].filter(Boolean).join(' - ');
    document.title = `${String(mins).padStart(2, '0')}m — Tempo${parts ? ` | ${parts}` : ''}`;
  }, [current, elapsedSec]);

  useEffect(() => {
    if (!current) {
      drawFavicon(null);
      return () => clearFavicon();
    }

    function doTick() {
      const elapsed = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
      drawFavicon(Math.floor(elapsed / 60));
    }

    doTick();
    const id = window.setInterval(doTick, 1000);
    return () => { clearInterval(id); clearFavicon(); };
  }, [current]);

  // Hidden tabs get their setInterval throttled or frozen by the browser, so the
  // title/favicon minutes stall while the tab is in the background. Recompute the
  // moment the tab becomes visible again so the count is correct as soon as it's
  // looked at, instead of lagging until the next (throttled) tick.
  useEffect(() => {
    if (!current) return;
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      setTick((t) => t + 1); // forces elapsedSec recompute → title effect re-runs
      const elapsed = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
      drawFavicon(Math.floor(elapsed / 60));
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [current]);

  useEffect(() => {
    return () => {
      document.title = 'Tempo';
      clearFavicon();
    };
  }, []);

  async function start(params: { projectId?: number | null; description?: string }): Promise<TimerEntry> {
    const res = await api.timer.start(params);
    setCurrent(res.current);
    startedAtRef.current = new Date(res.current.started_at).getTime();
    return res.current;
  }

  async function stop(): Promise<void> {
    try {
      await api.timer.stop();
    } catch (e) {
      console.warn('stop failed, will resync', e);
    } finally {
      setCurrent(null);
      startedAtRef.current = null;
    }
  }

  async function updateStartedAt(iso: string): Promise<void> {
    if (!current) return;
    await api.entries.update(current.id, { started_at: iso });
    setCurrent({ ...current, started_at: iso });
    startedAtRef.current = new Date(iso).getTime();
  }

  return (
    <TimerContext.Provider value={{ current, elapsedSec, start, stop, updateStartedAt, refresh }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
