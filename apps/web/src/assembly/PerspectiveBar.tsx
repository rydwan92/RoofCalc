import {
  ChevronDown,
  FileText,
  Grid3X3,
  Hammer,
  Layers3,
  LayoutGrid,
  ListTree,
  Scissors,
  SquareDashed,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssembly } from './store';
import {
  perspectiveForTask,
  tasksForPerspective,
  WORKBENCH_PERSPECTIVES,
  type MaterialsView,
  type ViewPreset,
  type WorkbenchPerspective,
} from './workbench';

export const PERSPECTIVE_ICON: Record<WorkbenchPerspective, typeof LayoutGrid> =
  {
    project: LayoutGrid,
    execution: Hammer,
    materials: ListTree,
    costing: Wallet,
    documents: FileText,
  };

const TASK_ICON: Record<ViewPreset, typeof LayoutGrid> = {
  construction: Hammer,
  openings: SquareDashed,
  layers: Layers3,
  covering: Grid3X3,
  cuts: Scissors,
  materials: ListTree,
  costing: Wallet,
  documents: FileText,
};

const ALL_DESTINATIONS: readonly ViewPreset[] = [
  'construction',
  'openings',
  'layers',
  'covering',
  'cuts',
  'materials',
  'costing',
  'documents',
];

const MATERIAL_VIEWS: readonly MaterialsView[] = [
  'plan',
  'cutting',
  'schedule',
];

/**
 * V37 primary navigation: five perspectives. Secondary tasks are contextual
 * (see ContextualTaskTabs). Switching perspective is transient view state and
 * clears the return trail; it never creates edit history.
 */
export function PerspectiveBar() {
  const state = useAssembly();
  const { t } = useTranslation();
  const active = perspectiveForTask(state.workbench.viewPreset);
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <div className="a-perspective-row">
      <nav
        className="a-perspective-bar"
        role="tablist"
        aria-label={t('assembly.perspective')}
      >
        {WORKBENCH_PERSPECTIVES.map((perspective) => {
          const Icon = PERSPECTIVE_ICON[perspective];
          const name = t(`assembly.perspective.${perspective}`);
          return (
            <button
              key={perspective}
              type="button"
              role="tab"
              data-perspective={perspective}
              aria-selected={active === perspective}
              aria-label={t('assembly.perspectiveLabel', { name })}
              onClick={() => state.navigatePerspective(perspective)}
            >
              <Icon size={16} aria-hidden="true" />
              <span aria-hidden="true">{name}</span>
            </button>
          );
        })}
      </nav>
      <details className="a-nav-jump" ref={menu}>
        <summary title={t('assembly.nav.jumpHint')}>
          <Wrench size={15} aria-hidden="true" />
          <span>{t('assembly.nav.jump')}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div role="menu" aria-label={t('assembly.nav.jump')}>
          {ALL_DESTINATIONS.map((task) => {
            const Icon = TASK_ICON[task];
            return (
              <button
                key={task}
                type="button"
                role="menuitem"
                data-nav-shortcut={task}
                onClick={() => {
                  state.navigatePerspective(perspectiveForTask(task));
                  state.setViewPreset(task);
                  menu.current?.removeAttribute('open');
                }}
              >
                <Icon size={15} aria-hidden="true" />
                <span>
                  {t(`assembly.perspective.${perspectiveForTask(task)}`)} ›{' '}
                  {t(
                    task === 'materials'
                      ? 'assembly.nav.materials.plan'
                      : task === 'documents'
                        ? 'assembly.nav.documentHub'
                        : `assembly.${task}Preset`,
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}

/**
 * Secondary navigation for the active perspective only (V37 §2). Materials
 * exposes its local views as real tabs, so K1 cutting has a stable place.
 */
export function ContextualTaskTabs({ k1Ready = true }: { k1Ready?: boolean }) {
  const state = useAssembly();
  const { t } = useTranslation();
  const perspective = perspectiveForTask(state.workbench.viewPreset);
  if (perspective === 'materials')
    return (
      <div
        className="a-context-tabs"
        role="tablist"
        aria-label={t('assembly.nav.contextTasks')}
      >
        {MATERIAL_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            data-task={view === 'plan' ? 'materials' : undefined}
            data-materials-view={view}
            aria-selected={state.workbench.materialsView === view}
            disabled={view === 'cutting' && !k1Ready}
            title={
              view === 'cutting' && !k1Ready
                ? t('assembly.nav.k1Unavailable')
                : undefined
            }
            onClick={() => state.setMaterialsView(view)}
          >
            {view === 'cutting' ? (
              <Scissors size={15} aria-hidden="true" />
            ) : (
              <ListTree size={15} aria-hidden="true" />
            )}
            <span>{t(`assembly.nav.materials.${view}`)}</span>
          </button>
        ))}
      </div>
    );
  return (
    <div
      className="a-context-tabs"
      role="tablist"
      aria-label={t('assembly.nav.contextTasks')}
    >
      {tasksForPerspective(perspective).map((task) => {
        const Icon = TASK_ICON[task];
        return (
          <button
            key={task}
            type="button"
            role="tab"
            data-task={task}
            aria-selected={state.workbench.viewPreset === task}
            onClick={() => state.setViewPreset(task)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>
              {t(
                task === 'documents'
                  ? 'assembly.nav.documentHub'
                  : `assembly.${task}Preset`,
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
