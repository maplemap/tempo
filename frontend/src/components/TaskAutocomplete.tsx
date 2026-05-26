import { useState, useRef, useEffect } from 'react';
import type { Task } from '../lib/api';

interface TaskAutocompleteProps {
  tasks: Task[];
  projectId: number | null;
  selected: Task | null;
  onSelect: (task: Task) => void;
  onCreate: (name: string) => Promise<Task>;
  onNameBlur?: (name: string) => void;
  className?: string;
  placeholder?: string;
}

export default function TaskAutocomplete({
  tasks, projectId, selected, onSelect, onCreate, onNameBlur, className, placeholder
}: TaskAutocompleteProps) {
  const [text, setText] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const prevId = useRef(selected?.id);
  const didSelect = useRef(false);

  useEffect(() => {
    if (selected?.id !== prevId.current) {
      setText(selected?.name ?? '');
      prevId.current = selected?.id;
    }
  }, [selected?.id, selected?.name]);

  const filtered = tasks
    .filter((t) => !projectId || t.project_id === projectId || t.project_id === null)
    .filter((t) => t.name.toLowerCase().includes(text.toLowerCase()));

  const exactMatch = filtered.some((t) => t.name.toLowerCase() === text.trim().toLowerCase());
  const showCreate = text.trim().length > 0 && !exactMatch;
  const items: Array<Task | { id: -1; name: string; project_id: null; created_at: '' }> = [
    ...filtered,
    ...(showCreate ? [{ id: -1 as const, name: text.trim(), project_id: null, created_at: '' }] : []),
  ];

  async function pick(item: typeof items[number]) {
    didSelect.current = true;
    if (item.id === -1) {
      const task = await onCreate(item.name);
      setText(task.name);
      onSelect(task);
    } else {
      setText(item.name);
      onSelect(item as Task);
    }
    setOpen(false);
    setActiveIdx(-1);
  }

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        className={className}
        value={text}
        placeholder={placeholder ?? 'task...'}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActiveIdx(-1); didSelect.current = false; }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            if (!didSelect.current) onNameBlur?.(text);
            didSelect.current = false;
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); }
          if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIdx >= 0) { void pick(items[activeIdx]); return; }
            const match = filtered.find((t) => t.name.toLowerCase() === text.trim().toLowerCase());
            if (match) { void pick(match); }
            else if (text.trim()) { void pick({ id: -1, name: text.trim(), project_id: null, created_at: '' }); }
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <div className="task-dropdown">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`task-dropdown-item${idx === activeIdx ? ' active' : ''}${item.id === -1 ? ' create' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); void pick(item); }}
            >
              {item.id === -1 ? `+ new: ${item.name}` : item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
