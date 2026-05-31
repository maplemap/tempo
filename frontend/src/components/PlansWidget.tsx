import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Plan, Project } from '../lib/api';

interface SortableItemProps {
  plan: Plan;
  projects: Project[];
  onRun: (plan: Plan) => void;
  onUpdate: (id: number, patch: Partial<Plan>) => void;
  onDelete: (plan: Plan) => void;
}

function SortableItem({ plan, projects, onRun, onUpdate, onDelete }: SortableItemProps) {
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
      <span className="plan-handle" {...attributes} {...listeners}>⠿</span>
      <select
        className="plan-inline-select"
        value={plan.project_id ?? ''}
        onChange={saveProject}
      >
        <option value="">—</option>
        {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input
        className="plan-inline-input"
        value={text}
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

export default function PlansWidget() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDone, setShowDone] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    const [{ plans: p }, { projects: prjs }] = await Promise.all([
      api.plans.list(),
      api.projects.list(),
    ]);
    setPlans(p);
    setProjects(prjs);
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = openPlans.findIndex((p) => p.id === active.id);
    const newIdx = openPlans.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(openPlans, oldIdx, newIdx);
    setPlans([...reordered, ...donePlans]);
    api.plans.reorder(reordered.map((p) => p.id)).catch(() => void load());
  }

  async function handleRun(plan: Plan) {
    try { await api.timer.stop(); } catch {}
    await api.timer.start({ projectId: plan.project_id, description: plan.text });
    const { plan: updated } = await api.plans.update(plan.id, { done: true });
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? updated : p)));
    setOpen(false);
    navigate('/');
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
        <div className="plans-panel">
          <div className="plans-panel-header">
            <span className="plans-panel-title">
              BACKLOG&nbsp;
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
              <SortableContext items={openPlans.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {openPlans.map((plan) => (
                  <SortableItem
                    key={plan.id}
                    plan={plan}
                    projects={projects}
                    onRun={handleRun}
                    onUpdate={(id, patch) => setPlans((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p))}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {showDone && donePlans.map((plan) => (
              <div key={plan.id} className="plan-row plan-row--done">
                <span className="plan-text">
                  {plan.project_name && <span className="plan-proj">{plan.project_name} · </span>}
                  {plan.text}
                </span>
                <button className="btn icon-btn" onClick={() => void handleRestore(plan)}>[ ↩ ]</button>
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
        [ backlog{openCount > 0 ? ` · ${openCount}` : ''} ]
      </button>
    </div>
  );
}
