import {
  Check,
  Droplets,
  FileText,
  Grid3X3,
  Hammer,
  House,
  Keyboard,
  Layers3,
  LayoutGrid,
  Link2,
  ListTree,
  Scissors,
  SquareDashed,
  Triangle,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { JourneyOverviewKey, ProjectJourney } from './project-journey';
import { useAssembly } from './store';
import {
  activePerspective,
  tasksForPerspective,
  WORKBENCH_PERSPECTIVES,
  type MaterialsView,
  type ViewPreset,
  type WorkbenchPerspective,
} from './workbench';

export const PERSPECTIVE_ICON: Record<WorkbenchPerspective, typeof LayoutGrid> =
  {
    project: Triangle,
    structure: Hammer,
    covering: Grid3X3,
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
  connections: Link2,
  materials: ListTree,
  costing: Wallet,
  documents: FileText,
};

/** Each section carries the status of its journey stage (V53 overview). */
export const SECTION_STAGE: Record<WorkbenchPerspective, JourneyOverviewKey> = {
  project: 'geometry',
  structure: 'construction',
  covering: 'covering',
  materials: 'materials',
  costing: 'cost',
  documents: 'documents',
};

const MATERIAL_VIEWS: readonly MaterialsView[] = [
  'plan',
  'system',
  'drainage',
  'cutting',
  'schedule',
];

/**
 * VNext primary navigation: ONE row of six sections. It replaces the V53
 * stage strip and the V37 perspective bar, which described the same project
 * twice. Each section shows its journey status; switching is transient view
 * state and creates no edit history. The compact "next action" sits at the
 * end of the same row (`trailing`).
 */
export function WorkspaceNav({
  journey,
  onSection,
  trailing,
}: {
  journey?: ProjectJourney;
  onSection: (perspective: WorkbenchPerspective) => void;
  trailing?: ReactNode;
}) {
  const workbench = useAssembly((state) => state.workbench);
  const { t } = useTranslation();
  const active = activePerspective(workbench);
  return (
    <div className="a-section-row">
      <nav
        className="a-section-nav"
        aria-label={t('assembly.nav.sections')}
        data-testid="journey-overview"
      >
        <ol role="tablist" aria-label={t('assembly.nav.sections')}>
          {WORKBENCH_PERSPECTIVES.map((perspective, index) => {
            const Icon = PERSPECTIVE_ICON[perspective];
            const stage = journey?.overview.find(
              (item) => item.key === SECTION_STAGE[perspective],
            );
            const name = t(`assembly.perspective.${perspective}`);
            const status = stage
              ? t(`assembly.journey.overviewStatus.${stage.status}`)
              : undefined;
            return (
              <li key={perspective} data-status={stage?.status}>
                <button
                  type="button"
                  role="tab"
                  data-perspective={perspective}
                  data-journey-step={SECTION_STAGE[perspective]}
                  aria-selected={active === perspective}
                  aria-current={active === perspective ? 'page' : undefined}
                  aria-label={t('assembly.perspectiveLabel', { name })}
                  aria-describedby={
                    status ? `section-status-${perspective}` : undefined
                  }
                  title={`${name} — ${t(`assembly.nav.sectionHelp.${perspective}`)}${status ? ` · ${status}` : ''} (Alt+${index + 1})`}
                  onClick={() => onSection(perspective)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="a-section-name" aria-hidden="true">
                    {name}
                  </span>
                  {stage && (
                    <i
                      className="a-section-status"
                      data-status={stage.status}
                      aria-hidden="true"
                    >
                      {stage.status === 'complete' && <Check size={10} />}
                    </i>
                  )}
                  {status && (
                    <span
                      id={`section-status-${perspective}`}
                      className="a-visually-hidden"
                    >
                      {status}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {trailing}
    </div>
  );
}

/** The keyboard shortcuts of the workbench, discoverable in one place. */
export function ShortcutHelp() {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ['Alt+1 … Alt+6', t('assembly.nav.shortcuts.section')],
    ['[  ]', t('assembly.nav.shortcuts.panels')],
    ['M', t('assembly.nav.shortcuts.measure')],
    ['F', t('assembly.nav.shortcuts.fit')],
    ['Ctrl+Z / Ctrl+Y', t('assembly.nav.shortcuts.undo')],
    ['Ctrl+D', t('assembly.nav.shortcuts.duplicate')],
    ['Alt+←', t('assembly.nav.shortcuts.back')],
    ['Esc', t('assembly.nav.shortcuts.escape')],
  ];
  return (
    <details className="a-shortcuts" data-testid="workbench-shortcuts">
      <summary
        className="a-icon"
        aria-label={t('assembly.nav.shortcuts.open')}
        title={t('assembly.nav.shortcuts.open')}
      >
        <Keyboard size={17} aria-hidden="true" />
      </summary>
      <div role="dialog" aria-label={t('assembly.nav.shortcuts.title')}>
        <strong>{t('assembly.nav.shortcuts.title')}</strong>
        <dl>
          {rows.map(([keys, label]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function taskLabelKey(task: ViewPreset, perspective: WorkbenchPerspective) {
  if (task === 'construction')
    return perspective === 'structure'
      ? 'assembly.nav.task.structure'
      : 'assembly.nav.task.geometry';
  if (task === 'documents') return 'assembly.nav.documentHub';
  return `assembly.${task}Preset`;
}

/**
 * Secondary navigation for the active section only (V37 §2). Materials
 * exposes its local views as real tabs, so K1 cutting has a stable place.
 */
export function ContextualTaskTabs({ k1Ready = true }: { k1Ready?: boolean }) {
  const state = useAssembly();
  const { t } = useTranslation();
  const perspective = activePerspective(state.workbench);
  if (perspective === 'materials')
    return (
      <div
        className="a-context-tabs"
        data-section={perspective}
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
            ) : view === 'drainage' ? (
              <Droplets size={15} aria-hidden="true" />
            ) : view === 'system' ? (
              <House size={15} aria-hidden="true" />
            ) : (
              <ListTree size={15} aria-hidden="true" />
            )}
            <span>{t(`assembly.nav.materials.${view}`)}</span>
          </button>
        ))}
      </div>
    );
  const tasks = tasksForPerspective(perspective);
  return (
    <div
      className="a-context-tabs"
      data-section={perspective}
      role="tablist"
      aria-label={t('assembly.nav.contextTasks')}
    >
      {tasks.map((task) => {
        const Icon = TASK_ICON[task];
        return (
          <button
            key={task}
            type="button"
            role="tab"
            data-task={task}
            aria-selected={state.workbench.viewPreset === task}
            title={t(
              `assembly.nav.taskHelp.${task === 'construction' ? (perspective === 'structure' ? 'structure' : 'geometry') : task}`,
            )}
            onClick={() => state.setViewPreset(task)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{t(taskLabelKey(task, perspective))}</span>
          </button>
        );
      })}
    </div>
  );
}
