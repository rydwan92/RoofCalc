import {
  Grid3X3,
  Hammer,
  Layers3,
  ListTree,
  Scissors,
  SquareDashed,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAssembly } from './store';

const tasks = [
  ['construction', Hammer],
  ['openings', SquareDashed],
  ['layers', Layers3],
  ['covering', Grid3X3],
  ['cuts', Scissors],
  ['materials', ListTree],
  ['costing', Wallet],
] as const;

export function MobileTaskDock() {
  const { t } = useTranslation();
  const preset = useAssembly((state) => state.workbench.viewPreset);
  const setViewPreset = useAssembly((state) => state.setViewPreset);
  return (
    <nav
      className="a-mobile-task-dock"
      role="tablist"
      aria-label={t('assembly.viewPreset')}
    >
      {tasks.map(([task, Icon]) => (
        <button
          key={task}
          role="tab"
          data-task={task}
          aria-selected={preset === task}
          aria-label={t(`assembly.${task}Preset`)}
          title={t(`assembly.${task}Preset`)}
          onClick={() => setViewPreset(task)}
        >
          <Icon size={19} aria-hidden="true" />
          <span>
            {t(`assembly.mobile${task[0]!.toUpperCase()}${task.slice(1)}`)}
          </span>
        </button>
      ))}
    </nav>
  );
}
