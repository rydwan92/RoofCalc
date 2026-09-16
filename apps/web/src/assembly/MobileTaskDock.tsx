import { useTranslation } from 'react-i18next';
import { PERSPECTIVE_ICON } from './PerspectiveBar';
import { useAssembly } from './store';
import { perspectiveForTask, WORKBENCH_PERSPECTIVES } from './workbench';

/** V37: the phone dock carries the five perspectives, never all tasks. */
export function MobileTaskDock() {
  const { t } = useTranslation();
  const preset = useAssembly((state) => state.workbench.viewPreset);
  const navigatePerspective = useAssembly((state) => state.navigatePerspective);
  const active = perspectiveForTask(preset);
  return (
    <nav
      className="a-mobile-task-dock"
      role="tablist"
      aria-label={t('assembly.perspective')}
    >
      {WORKBENCH_PERSPECTIVES.map((perspective) => {
        const Icon = PERSPECTIVE_ICON[perspective];
        const name = t(`assembly.perspective.${perspective}`);
        return (
          <button
            key={perspective}
            role="tab"
            data-perspective={perspective}
            aria-selected={active === perspective}
            aria-label={t('assembly.perspectiveLabel', { name })}
            title={name}
            onClick={() => navigatePerspective(perspective)}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{t(`assembly.nav.mobile.${perspective}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}
