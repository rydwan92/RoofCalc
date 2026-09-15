import { FileText, Hammer, LayoutGrid, ListTree, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAssembly } from './store';
import {
  perspectiveForTask,
  tasksForPerspective,
  WORKBENCH_PERSPECTIVES,
  type WorkbenchPerspective,
} from './workbench';

const PERSPECTIVE_ICON: Record<WorkbenchPerspective, typeof LayoutGrid> = {
  project: LayoutGrid,
  execution: Hammer,
  materials: ListTree,
  costing: Wallet,
  documents: FileText,
};

/**
 * Perspective grouping over the six-task workbench (V34B §2-4). Real
 * navigation, not decoration: selecting a perspective jumps to its first
 * task (or opens the existing export flow for Dokumenty). It never hides a
 * task from the ribbon below — expert direct navigation stays one click.
 */
export function PerspectiveBar({
  onOpenDocuments,
}: {
  onOpenDocuments: () => void;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const active = perspectiveForTask(state.workbench.viewPreset);
  return (
    <nav
      className="a-perspective-bar"
      role="tablist"
      aria-label={t('assembly.perspective')}
    >
      {WORKBENCH_PERSPECTIVES.map((perspective) => {
        const Icon = PERSPECTIVE_ICON[perspective];
        const tasks = tasksForPerspective(perspective);
        const name = t(`assembly.perspective.${perspective}`);
        return (
          <button
            key={perspective}
            type="button"
            role="tab"
            data-perspective={perspective}
            aria-selected={active === perspective}
            aria-label={t('assembly.perspectiveLabel', { name })}
            onClick={() => {
              if (perspective === 'documents') {
                onOpenDocuments();
                return;
              }
              if (tasks.length && !tasks.includes(state.workbench.viewPreset))
                state.setViewPreset(tasks[0]!);
            }}
          >
            <Icon size={16} aria-hidden="true" />
            <span aria-hidden="true">{name}</span>
          </button>
        );
      })}
    </nav>
  );
}
