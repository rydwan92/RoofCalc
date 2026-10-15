import { useTranslation } from 'react-i18next';
import { PERSPECTIVE_ICON, SECTION_STAGE } from './PerspectiveBar';
import type { ProjectJourney } from './project-journey';
import { useAssembly } from './store';
import {
  activePerspective,
  WORKBENCH_PERSPECTIVES,
  type WorkbenchPerspective,
} from './workbench';

/**
 * The phone dock carries the six sections of the one primary navigation
 * (VNext), with the same journey status as the desktop row, never all
 * tasks; the section's tasks follow as contextual tabs.
 */
export function MobileTaskDock({
  journey,
  onSection,
}: {
  journey?: ProjectJourney;
  onSection?: (perspective: WorkbenchPerspective) => void;
}) {
  const { t } = useTranslation();
  const workbench = useAssembly((state) => state.workbench);
  const navigatePerspective = useAssembly((state) => state.navigatePerspective);
  const active = activePerspective(workbench);
  return (
    <nav
      className="a-mobile-task-dock"
      aria-label={t('assembly.nav.sections')}
      data-testid="journey-overview"
    >
      <ol role="tablist" aria-label={t('assembly.nav.sections')}>
        {WORKBENCH_PERSPECTIVES.map((perspective) => {
          const Icon = PERSPECTIVE_ICON[perspective];
          const name = t(`assembly.perspective.${perspective}`);
          const stage = journey?.overview.find(
            (item) => item.key === SECTION_STAGE[perspective],
          );
          return (
            <li key={perspective} data-status={stage?.status}>
              <button
                type="button"
                role="tab"
                data-perspective={perspective}
                data-journey-step={SECTION_STAGE[perspective]}
                aria-selected={active === perspective}
                aria-label={t('assembly.perspectiveLabel', { name })}
                title={name}
                onClick={() =>
                  onSection
                    ? onSection(perspective)
                    : navigatePerspective(perspective)
                }
              >
                <Icon size={19} aria-hidden="true" />
                <span>{t(`assembly.nav.mobile.${perspective}`)}</span>
                {stage && (
                  <i
                    className="a-section-status"
                    data-status={stage.status}
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
