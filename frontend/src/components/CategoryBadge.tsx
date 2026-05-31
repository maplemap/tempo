import { useEffect, useRef, useState } from 'react';
import type { Category } from '../lib/api';
import { CATEGORIES } from '../lib/api';

interface CategoryBadgeProps {
  category: Category;
  manual: 0 | 1;
  onChange: (next: Category | null) => void;
}

export default function CategoryBadge({ category, manual, onChange }: CategoryBadgeProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(value: Category | null) {
    setOpen(false);
    onChange(value);
  }

  return (
    <span ref={rootRef} className="category-badge" style={{ position: 'relative', display: 'inline-block', width: 'fit-content' }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
      >
        {category}{manual ? '*' : ''}
      </button>
      {open && (
        <div
          className="category-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 10,
            background: 'var(--bg, #fff)',
            border: '1px solid currentColor',
            padding: 2,
            minWidth: '11ch',
          }}
        >
          {CATEGORIES.map((c) => (
            <div
              key={c}
              role="button"
              tabIndex={0}
              onClick={() => choose(c)}
              onKeyDown={(e) => { if (e.key === 'Enter') choose(c); }}
              style={{ padding: '2px 4px', cursor: 'pointer' }}
            >
              [{c}]
            </div>
          ))}
          <div
            role="button"
            tabIndex={0}
            onClick={() => choose(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') choose(null); }}
            style={{ padding: '2px 4px', cursor: 'pointer', borderTop: '1px dashed currentColor' }}
          >
            [auto]
          </div>
        </div>
      )}
    </span>
  );
}
