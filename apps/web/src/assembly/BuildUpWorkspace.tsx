import { useTranslation } from 'react-i18next';

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

export function BuildUpSummaryBar({
  membraneEnabled,
  membraneAreaMm2,
  counterBattensEnabled,
  counterBattenLengthMm,
  battensEnabled,
  battenLengthMm,
  partial,
  selectedView,
  onSelect,
}: {
  membraneEnabled: boolean;
  membraneAreaMm2: number;
  counterBattensEnabled: boolean;
  counterBattenLengthMm: number;
  battensEnabled: boolean;
  battenLengthMm: number;
  partial: boolean;
  selectedView: 'overview' | 'membrane' | 'counterBattens' | 'battens';
  onSelect: (
    view: 'overview' | 'membrane' | 'counterBattens' | 'battens',
  ) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section
      className="a-build-up-summary"
      aria-label={t('assembly.roofBuildUp')}
    >
      <dl>
        <div
          role="button"
          tabIndex={0}
          aria-current={selectedView === 'membrane' ? 'page' : undefined}
          onClick={() => onSelect('membrane')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ')
              onSelect('membrane');
          }}
        >
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
          role="button"
          tabIndex={0}
          aria-current={selectedView === 'counterBattens' ? 'page' : undefined}
          data-limited={partial || undefined}
          onClick={() => onSelect('counterBattens')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ')
              onSelect('counterBattens');
          }}
        >
          <dt>{t('assembly.counterBattens')}</dt>
          <dd>
            {metric(
              counterBattensEnabled,
              counterBattenLengthMm,
              1000,
              'm',
              i18n.language,
              t('assembly.disabled'),
            )}
            {partial && counterBattensEnabled
              ? ` · ${t('assembly.partial')}`
              : ''}
          </dd>
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-current={selectedView === 'battens' ? 'page' : undefined}
          onClick={() => onSelect('battens')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelect('battens');
          }}
        >
          <dt>{t('assembly.battens')}</dt>
          <dd>
            {metric(
              battensEnabled,
              battenLengthMm,
              1000,
              'm',
              i18n.language,
              t('assembly.disabled'),
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
