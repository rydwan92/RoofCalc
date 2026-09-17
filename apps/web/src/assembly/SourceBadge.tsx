import { useTranslation } from 'react-i18next';

/**
 * V44: the one source vocabulary for a value or product across modules.
 * AUTO — RoofCalc derived it; RĘCZNIE — the user owns it; KATALOG — a stored
 * catalogue snapshot; Z PROJEKTU — carried from the project model.
 */
export type ValueSource = 'auto' | 'manual' | 'catalogue' | 'project';

export function SourceBadge({
  source,
  detail,
  testId,
}: {
  source: ValueSource;
  detail?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={`a-source-tag is-${source}`}
      data-source={source}
      data-owner={source === 'auto' || source === 'manual' ? source : undefined}
      data-testid={testId}
    >
      {t(`assembly.sourceLabel.${source}`)}
      {detail ? <small> · {detail}</small> : null}
    </span>
  );
}
