import { useTranslation } from 'react-i18next';
import type { BuildUpView } from './workbench';
import {
  BattenStatusLine,
  CounterBattenStatusLine,
  type InstallationWorkflowFacts,
} from './InstallationWorkflow';

function metric(
  enabled: boolean,
  value: number,
  divisor: number,
  suffix: string,
  locale: string,
  disabledLabel: string,
) {
  if (!enabled) return disabledLabel;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / divisor)} ${suffix}`;
}

/**
 * V43B: the summary states each layer's actual condition — gauge, rows, owner
 * and why counter-battens are partial — so a bare "Łaty 283 m" can never hide
 * a missing covering, an unverified manual gauge or a narrowed plane scope.
 */
export function BuildUpSummaryBar({
  membraneEnabled,
  membraneAreaMm2,
  installation,
  selectedView,
  onSelect,
}: {
  membraneEnabled: boolean;
  membraneAreaMm2: number;
  installation: InstallationWorkflowFacts;
  selectedView: BuildUpView;
  onSelect: (view: BuildUpView) => void;
}) {
  const { t, i18n } = useTranslation();
  const cell = (view: BuildUpView) => ({
    role: 'button',
    tabIndex: 0,
    'aria-current':
      selectedView === view ? ('page' as const) : (undefined as undefined),
    onClick: () => onSelect(view),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(view);
      }
    },
  });
  return (
    <section
      className="a-build-up-summary"
      aria-label={t('assembly.roofBuildUp')}
    >
      <dl>
        <div {...cell('membrane')}>
          <dt>{t('assembly.netGeometricArea')}</dt>
          <dd>
            {metric(
              membraneEnabled,
              membraneAreaMm2,
              1_000_000,
              'm²',
              i18n.language,
              t('assembly.disabled'),
            )}
          </dd>
        </div>
        <div
          {...cell('counterBattens')}
          data-limited={
            installation.counterBattens.tone === 'attention' ||
            installation.counterBattens.tone === 'blocked' ||
            undefined
          }
          data-summary="counter-battens"
        >
          <dt>{t('assembly.counterBattens')}</dt>
          <dd>
            <CounterBattenStatusLine workflow={installation.counterBattens} />
          </dd>
        </div>
        <div
          {...cell('battens')}
          data-limited={
            installation.battens.tone === 'attention' ||
            installation.battens.tone === 'blocked' ||
            undefined
          }
          data-summary="battens"
        >
          <dt>{t('assembly.battens')}</dt>
          <dd>
            <BattenStatusLine workflow={installation.battens} />
          </dd>
        </div>
        <div {...cell('installation')} data-summary="installation">
          <dt>{t('assembly.install.title')}</dt>
          <dd className="a-summary-link">{t('assembly.install.details')}</dd>
        </div>
      </dl>
    </section>
  );
}
