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
  limited,
}: {
  membraneEnabled: boolean;
  membraneAreaMm2: number;
  counterBattensEnabled: boolean;
  counterBattenLengthMm: number;
  battensEnabled: boolean;
  battenLengthMm: number;
  limited: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section
      className="a-build-up-summary"
      aria-label={t('assembly.roofBuildUp')}
    >
      <dl>
        <div>
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
        <div data-limited={limited || undefined}>
          <dt>{t('assembly.counterBattens')}</dt>
          <dd>
            {limited && counterBattensEnabled
              ? t('assembly.limited')
              : metric(
                  counterBattensEnabled,
                  counterBattenLengthMm,
                  1000,
                  'm',
                  i18n.language,
                  t('assembly.disabled'),
                )}
          </dd>
        </div>
        <div>
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
