import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../lib/api';
import type { Plan, PlanCategory, Project } from '../lib/api';
import { useTimer } from '../lib/TimerContext';

interface SortableItemProps {
  plan: Plan;
  projects: Project[];
  onRun: (plan: Plan) => void;
  onMarkDone: (plan: Plan) => void;
  onUpdate: (id: number, patch: Partial<Plan>) => void;
  onDelete: (plan: Plan) => void;
}

function SortableItem({ plan, projects, onRun, onMarkDone, onUpdate, onDelete }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: plan.id });
  const [text, setText] = useState(plan.text);
  const active = projects.filter((p) => !p.archived || p.id === plan.project_id);

  useEffect(() => { setText(plan.text); }, [plan.text]);

  async function saveText() {
    const trimmed = text.trim();
    if (!trimmed) { setText(plan.text); return; }
    if (trimmed === plan.text) return;

    const { plan: updated } = await api.plans.update(plan.id, { text: trimmed });
    onUpdate(plan.id, { text: updated.text });
  }

  async function saveProject(e: React.ChangeEvent<HTMLSelectElement>) {
    const projectId = e.target.value ? Number(e.target.value) : null;
    const { plan: updated } = await api.plans.update(plan.id, { project_id: projectId });
    onUpdate(plan.id, { project_id: updated.project_id, project_name: updated.project_name });
  }

  return (
    <div
      ref={setNodeRef}
      className="plan-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <input type="checkbox" className="plan-checkbox" checked={false} onChange={() => onMarkDone(plan)} />
      <span className="plan-handle" {...attributes} {...listeners}>⠿</span>
      <select
        className="plan-inline-select"
        value={plan.project_id ?? ''}
        title={plan.project_name ?? undefined}
        onChange={saveProject}
      >
        <option value="">—</option>
        {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input
        className="plan-inline-input"
        value={text}
        title={text || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={saveText}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      <button className="btn icon-btn" onClick={() => onRun(plan)}>[ ▶ ]</button>
      <button className="btn icon-btn" onClick={() => onDelete(plan)}>[ × ]</button>
    </div>
  );
}

interface AddRowProps {
  projects: Project[];
  onAdd: (plan: Plan) => void;
}

function AddRow({ projects, onAdd }: AddRowProps) {
  const active = projects.filter((p) => !p.archived);
  const [projectId, setProjectId] = useState<string>(active[0] ? String(active[0].id) : '');
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjectId(active[0] ? String(active[0].id) : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const pid = projectId ? Number(projectId) : null;

    const { plan } = await api.plans.create({ project_id: pid, text: trimmed });
    onAdd(plan);
    setText('');
    inputRef.current?.focus();
  }

  return (
    <div className="plan-add-row">
      <select
        className="plan-add-select"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        tabIndex={-1}
      >
        <option value="">—</option>
        {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input
        ref={inputRef}
        className="plan-add-input"
        placeholder="new plan..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit(); }
        }}
      />
    </div>
  );
}

function SectionDroppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`plan-section${isOver ? ' plan-section--over' : ''}`}>{children}</div>;
}

interface CategoryHeaderProps {
  category: PlanCategory;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (category: PlanCategory) => void;
}

function CategoryHeader({ category, count, collapsed, onToggle, onRename, onDelete }: CategoryHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  useEffect(() => { setName(category.name); }, [category.name]);

  async function save() {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) { setName(category.name); return; }
    await onRename(category.id, trimmed);
  }

  return (
    <div className="plan-cat-header">
      <button className="plan-cat-toggle btn icon-btn" onClick={onToggle}>
        {collapsed ? '▸' : '▾'}
      </button>
      {editing ? (
        <input
          className="plan-cat-name-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setName(category.name); setEditing(false); }
          }}
        />
      ) : (
        <span className="plan-cat-name" title={category.name} onClick={() => setEditing(true)}>
          {category.name}
        </span>
      )}
      <span className="plan-cat-count">{count}</span>
      <button className="btn icon-btn" onClick={() => onDelete(category)}>[ × ]</button>
    </div>
  );
}

interface DoneHeaderProps {
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}

function DoneHeader({ count, collapsed, onToggle }: DoneHeaderProps) {
  return (
    <div className="plan-cat-header">
      <button className="plan-cat-toggle btn icon-btn" onClick={onToggle}>
        {collapsed ? '▸' : '▾'}
      </button>
      <span className="plan-cat-name plan-cat-name--fixed">Done</span>
      <span className="plan-cat-count">{count}</span>
    </div>
  );
}

function AddCategoryRow({ onAdd }: { onAdd: (category: PlanCategory) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  async function submit() {
    const trimmed = name.trim();
    setEditing(false);
    setName('');
    if (!trimmed) return;
    const { category } = await api.planCategories.create(trimmed);
    onAdd(category);
  }

  if (!editing) {
    return (
      <button className="btn icon-btn plan-cat-add" onClick={() => setEditing(true)}>
        [ + category ]
      </button>
    );
  }
  return (
    <div className="plan-cat-add-row">
      <input
        className="plan-cat-name-input"
        placeholder="category name..."
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void submit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit(); }
          if (e.key === 'Escape') { setName(''); setEditing(false); }
        }}
      />
    </div>
  );
}

const STORAGE_KEY = 'backlog-panel-size';
const COLLAPSED_KEY = 'backlog-collapsed-cats';
const DONE_COLLAPSED_KEY = 'backlog-done-collapsed';
const PANEL_POSITION_KEY = 'backlog-panel-position';

interface PanelSize { width: number; height: number; }
interface PanelPosition { top: number; left: number; }
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

function loadPanelSize(): PanelSize {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s) as PanelSize;
  } catch {}
  return { width: 500, height: Math.round(window.innerHeight * 0.7) };
}

function clampPanelPosition(pos: PanelPosition, size: PanelSize): PanelPosition {
  const maxLeft = Math.max(0, window.innerWidth - size.width);
  const maxTop = Math.max(0, window.innerHeight - size.height);
  return {
    left: Math.min(Math.max(0, pos.left), maxLeft),
    top: Math.min(Math.max(0, pos.top), maxTop),
  };
}

function clampPanelSize(size: PanelSize): PanelSize {
  return {
    width: Math.max(280, Math.min(size.width, window.innerWidth - 24)),
    height: Math.max(180, Math.min(size.height, window.innerHeight - 24)),
  };
}

function loadPanelPosition(size: PanelSize): PanelPosition {
  try {
    const s = localStorage.getItem(PANEL_POSITION_KEY);
    if (s) return clampPanelPosition(JSON.parse(s) as PanelPosition, size);
  } catch {}
  return clampPanelPosition(
    { left: window.innerWidth - size.width - 24, top: window.innerHeight - size.height - 90 },
    size
  );
}

function loadCollapsed(): Set<number> {
  try {
    const s = localStorage.getItem(COLLAPSED_KEY);
    if (s) return new Set(JSON.parse(s) as number[]);
  } catch {}
  return new Set();
}

function saveCollapsed(set: Set<number>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
}

export default function PlansWidget() {
  const { start: startTimer } = useTimer();
  const [open, setOpen] = useState(() => localStorage.getItem('backlog-open') === '1');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<PlanCategory[]>([]);
  const [panelSize, setPanelSize] = useState(loadPanelSize);
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);
  const [doneCollapsed, setDoneCollapsed] = useState(() => localStorage.getItem(DONE_COLLAPSED_KEY) === '1');
  const [panelPosition, setPanelPosition] = useState(() => loadPanelPosition(panelSize));
  const [panelDragging, setPanelDragging] = useState(false);

  function toggleCollapsed(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }

  function handleResizeMouseDown(e: React.MouseEvent, corner: ResizeCorner) {
    e.preventDefault();
    const origTop = panelPosition.top;
    const origLeft = panelPosition.left;
    const origWidth = panelSize.width;
    const origHeight = panelSize.height;
    const right = origLeft + origWidth;
    const bottom = origTop + origHeight;
    const rightEdge = corner === 'ne' || corner === 'se';
    const bottomEdge = corner === 'sw' || corner === 'se';

    let curSize = panelSize;
    let curPos = panelPosition;

    const onMove = (ev: MouseEvent) => {
      let top = origTop;
      let left = origLeft;
      let width = origWidth;
      let height = origHeight;

      if (rightEdge) {
        const maxW = window.innerWidth - left - 12;
        width = Math.max(280, Math.min(maxW, ev.clientX - left));
      } else {
        left = Math.max(0, Math.min(right - 280, ev.clientX));
        width = right - left;
      }

      if (bottomEdge) {
        const maxH = window.innerHeight - top - 12;
        height = Math.max(180, Math.min(maxH, ev.clientY - top));
      } else {
        top = Math.max(0, Math.min(bottom - 180, ev.clientY));
        height = bottom - top;
      }

      curSize = { width, height };
      curPos = { top, left };
      setPanelSize(curSize);
      setPanelPosition(curPos);
    };
    const onUp = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(curSize));
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(curPos));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handlePanelHeaderMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return; // don't drag when clicking [ x ]
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startTop = panelPosition.top;
    const startLeft = panelPosition.left;
    setPanelDragging(true);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPanelPosition(clampPanelPosition({ top: startTop + dy, left: startLeft + dx }, panelSize));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setPanelDragging(false);
      setPanelPosition((p) => {
        localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(p));
        return p;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  useEffect(() => { localStorage.setItem('backlog-open', open ? '1' : '0'); }, [open]);
  useEffect(() => { localStorage.setItem(DONE_COLLAPSED_KEY, doneCollapsed ? '1' : '0'); }, [doneCollapsed]);

  // Make sure the panel is still fully on-screen every time it's shown (window may have been resized while closed).
  useEffect(() => {
    if (!open) return;
    setPanelSize((s) => {
      const nextSize = clampPanelSize(s);
      setPanelPosition((p) => clampPanelPosition(p, nextSize));
      return nextSize;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    const [{ plans: p }, { projects: prjs }, { categories: cats }] = await Promise.all([
      api.plans.list(),
      api.projects.list(),
      api.planCategories.list(),
    ]);
    setPlans(p);
    setProjects(prjs);
    setCategories(cats);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open]);

  const openPlans = plans.filter((p) => !p.done);
  const donePlans = plans.filter((p) => p.done).sort((a, b) =>
    (b.done_at ?? '').localeCompare(a.done_at ?? '')
  );

  const generalSection: { key: string; category: PlanCategory | null; plans: Plan[] } =
    { key: 'section-null', category: null, plans: openPlans.filter((p) => p.category_id == null) };
  const categorySections: Array<{ key: string; category: PlanCategory | null; plans: Plan[] }> =
    categories.map((c) => ({
      key: `section-${c.id}`,
      category: c,
      plans: openPlans.filter((p) => p.category_id === c.id),
    }));

  async function handleRenameCategory(id: number, name: string) {
    const { category } = await api.planCategories.update(id, { name });
    setCategories((prev) => prev.map((c) => (c.id === id ? category : c)));
  }

  async function handleDeleteCategory(cat: PlanCategory) {
    await api.planCategories.remove(cat.id);
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setPlans((prev) => prev.map((p) => (p.category_id === cat.id ? { ...p, category_id: null } : p)));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activePlan = openPlans.find((p) => p.id === active.id);
    if (!activePlan) return;

    if (over.id === 'section-done') {
      void handleMarkDone(activePlan);
      return;
    }

    // Target: either a plan row (sortable) or a section container (droppable).
    let targetCatId: number | null;
    let overPlanId: number | null = null;
    if (typeof over.id === 'string' && over.id.startsWith('section-')) {
      const raw = over.id.slice('section-'.length);
      targetCatId = raw === 'null' ? null : Number(raw);
    } else {
      const overPlan = openPlans.find((p) => p.id === over.id);
      if (!overPlan) return;
      targetCatId = overPlan.category_id;
      overPlanId = overPlan.id;
    }

    const categoryChanged = targetCatId !== activePlan.category_id;
    if (active.id === over.id && !categoryChanged) return;

    // Rebuild the flat open list: remove, retag, insert.
    const without = openPlans.filter((p) => p.id !== activePlan.id);
    const moved = { ...activePlan, category_id: targetCatId };
    let insertIdx: number;
    if (overPlanId != null) {
      insertIdx = without.findIndex((p) => p.id === overPlanId);
      const oldIdx = openPlans.findIndex((p) => p.id === activePlan.id);
      const overIdx = openPlans.findIndex((p) => p.id === overPlanId);
      if (oldIdx < overIdx) insertIdx += 1; // dragging downward → place after the target
    } else {
      insertIdx = without.length; // dropped on a section (likely empty) → append
    }
    const inserted = [...without.slice(0, insertIdx), moved, ...without.slice(insertIdx)];

    // Normalize global order to match display order: uncategorized, then categories.
    const sectionOrder: Array<number | null> = [null, ...categories.map((c) => c.id)];
    const reordered = sectionOrder.flatMap((catId) => inserted.filter((p) => p.category_id === catId));

    setPlans([...reordered, ...donePlans]);
    if (categoryChanged) {
      api.plans.update(activePlan.id, { category_id: targetCatId }).catch(() => void load());
    }
    api.plans.reorder(reordered.map((p) => p.id)).catch(() => void load());
  }

  async function handleRun(plan: Plan) {
    await startTimer({ projectId: plan.project_id, description: plan.text });
  }

  async function handleMarkDone(plan: Plan) {
    const { plan: updated } = await api.plans.update(plan.id, { done: true });
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? updated : p)));
  }

  async function handleRestore(plan: Plan) {
    const { plan: updated } = await api.plans.update(plan.id, { done: false });
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? updated : p)));
  }

  async function handleDelete(plan: Plan) {
    await api.plans.remove(plan.id);
    setPlans((prev) => prev.filter((p) => p.id !== plan.id));
  }

  const openCount = openPlans.length;
  const doneCount = donePlans.length;

  function renderSection(section: { key: string; category: PlanCategory | null; plans: Plan[] }) {
    const isCollapsed = section.category != null && collapsed.has(section.category.id);
    return (
      <SectionDroppable key={section.key} id={section.key}>
        {section.category && (
          <CategoryHeader
            category={section.category}
            count={section.plans.length}
            collapsed={isCollapsed}
            onToggle={() => toggleCollapsed(section.category!.id)}
            onRename={handleRenameCategory}
            onDelete={(c) => void handleDeleteCategory(c)}
          />
        )}
        {!isCollapsed && (
          <SortableContext items={section.plans.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {section.plans.map((plan) => (
              <SortableItem
                key={plan.id}
                plan={plan}
                projects={projects}
                onRun={handleRun}
                onMarkDone={handleMarkDone}
                onUpdate={(id, patch) => setPlans((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p))}
                onDelete={handleDelete}
              />
            ))}
          </SortableContext>
        )}
      </SectionDroppable>
    );
  }

  return (
    <>
      <button
        className={`btn plans-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        [ plans{openCount > 0 ? ` · ${openCount}` : ''} ]
      </button>

      {open && (
        <div
          className="plans-panel"
          style={{ top: panelPosition.top, left: panelPosition.left, width: panelSize.width, height: panelSize.height }}
        >
          <div className="plans-resize-handle--nw" onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} />
          <div className="plans-resize-handle--ne" onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} />
          <div className="plans-resize-handle--sw" onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} />
          <div className="plans-resize-handle" onMouseDown={(e) => handleResizeMouseDown(e, 'se')} />
          <div
            className={`plans-panel-header${panelDragging ? ' dragging' : ''}`}
            onMouseDown={handlePanelHeaderMouseDown}
          >
            <span className="plans-panel-title">
              Plans&nbsp;
              <span className="plans-panel-count">
                {openCount} open{doneCount > 0 ? ` · ${doneCount} done` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn icon-btn" onClick={() => setOpen(false)}>[ × ]</button>
            </span>
          </div>

          <div className="plans-panel-body">
            <AddRow
              projects={projects}
              onAdd={(plan) => setPlans((prev) => [plan, ...prev])}
            />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {renderSection(generalSection)}

              <AddCategoryRow onAdd={(category) => setCategories((prev) => [...prev, category])} />

              {categorySections.map(renderSection)}

              {doneCount > 0 && (
              <SectionDroppable id="section-done">
                <DoneHeader
                  count={doneCount}
                  collapsed={doneCollapsed}
                  onToggle={() => setDoneCollapsed((v) => !v)}
                />
                {!doneCollapsed && donePlans.map((plan) => (
                  <div key={plan.id} className="plan-row plan-row--done">
                    <input type="checkbox" className="plan-checkbox" checked={true} onChange={() => void handleRestore(plan)} />
                    <span className="plan-handle plan-handle--disabled">⠿</span>
                    <select
                      className="plan-inline-select"
                      value={plan.project_id ?? ''}
                      title={plan.project_name ?? undefined}
                      disabled
                    >
                      <option value="">—</option>
                      {projects.filter((p) => !p.archived || p.id === plan.project_id).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input className="plan-inline-input" value={plan.text} title={plan.text || undefined} disabled readOnly onChange={() => {}} />
                    <button className="btn icon-btn" onClick={() => void handleDelete(plan)}>[ × ]</button>
                  </div>
                ))}
              </SectionDroppable>
              )}
            </DndContext>
          </div>
        </div>
      )}
    </>
  );
}
