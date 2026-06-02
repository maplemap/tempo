import { useEffect, useRef } from 'react';

function currentDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useMidnightRefresh(onNewDay: () => void): void {
  const callbackRef = useRef(onNewDay);
  useEffect(() => { callbackRef.current = onNewDay; });

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    let lastKey = currentDayKey();

    function check() {
      const key = currentDayKey();
      if (key !== lastKey) {
        lastKey = key;
        callbackRef.current();
      }
    }

    function scheduleNext() {
      if (!active) return;
      const now = new Date();
      const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 50;
      timeoutId = setTimeout(() => {
        if (!active) return;
        check();
        scheduleNext();
      }, ms);
    }

    scheduleNext();

    function onVisibility() {
      if (!document.hidden) check();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
