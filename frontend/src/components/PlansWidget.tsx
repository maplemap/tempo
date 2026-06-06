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
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Plan, PlanCategory, Project } from '../lib/api';

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

function loadPanelSize() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s) as { width: number; height: number };
  } catch {}
  return { width: 500, height: Math.round(window.innerHeight * 0.7) };
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
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => localStorage.getItem('backlog-open') === '1');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<PlanCategory[]>([]);
  const [showDone, setShowDone] = useState(true);
  const [panelSize, setPanelSize] = useState(loadPanelSize);
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);

  function toggleCollapsed(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }
  const panelRef = useRef<HTMLDivElement>(null);

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    let cur = panelSize;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(280, Math.min(window.innerWidth - 48, window.innerWidth - 24 - ev.clientX));
      const h = Math.max(180, Math.min(window.innerHeight - 100, window.innerHeight - 68 - ev.clientY));
      cur = { width: w, height: h };
      setPanelSize(cur);
    };
    const onUp = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  useEffect(() => { localStorage.setItem('backlog-open', open ? '1' : '0'); }, [open]);

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

  const sections: Array<{ key: string; category: PlanCategory | null; plans: Plan[] }> = [
    { key: 'section-null', category: null, plans: openPlans.filter((p) => p.category_id == null) },
    ...categories.map((c) => ({
      key: `section-${c.id}`,
      category: c,
      plans: openPlans.filter((p) => p.category_id === c.id),
    })),
  ];

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
    try { await api.timer.stop(); } catch {}
    await api.timer.start({ projectId: plan.project_id, description: plan.text });
    navigate('/');
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

  return (
    <div className="plans-float" ref={panelRef}>
      {open && (
        <div className="plans-panel" style={{ width: panelSize.width, height: panelSize.height }}>
          <div className="plans-resize-handle" onMouseDown={handleResizeMouseDown} />
          <div className="plans-panel-header">
            <span className="plans-panel-title">
              Plans&nbsp;
              <span className="plans-panel-count">
                {openCount} open{doneCount > 0 ? ` · ${doneCount} done` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {doneCount > 0 && (
                <button className="btn icon-btn" onClick={() => setShowDone((v) => !v)}>
                  {showDone ? '[ hide done ]' : '[ show done ]'}
                </button>
              )}
              <button className="btn icon-btn" onClick={() => setOpen(false)}>[ × ]</button>
            </span>
          </div>

          <div className="plans-panel-body">
            <AddRow
              projects={projects}
              onAdd={(plan) => setPlans((prev) => [plan, ...prev])}
            />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {sections.map((section) => {
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
              })}
            </DndContext>

            <AddCategoryRow onAdd={(category) => setCategories((prev) => [...prev, category])} />

            {showDone && donePlans.map((plan) => (
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
          </div>
        </div>
      )}

      <button
        className={`btn icon-btn plans-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        [ plans{openCount > 0 ? ` · ${openCount}` : ''} ]
      </button>
    </div>
  );
}
