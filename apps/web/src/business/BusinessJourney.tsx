import { useTranslation } from 'react-i18next';
import type { CostScenarioSummary } from '@cieslacalc/cost-core';
import type {
  CommercialPrimaryAction,
  CommercialReadiness,
} from './commercial-readiness';

const stages = [
  'roof',
  'covering',
  'system',
  'materials',
  'prices',
  'quote',
] as const;

export function BusinessJourney({
  readiness,
  onAction,
  summary,
}: {
  readiness: CommercialReadiness;
  onAction: (action: CommercialPrimaryAction) => void;
  summary?: CostScenarioSummary;
}) {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const labels = pl
    ? ['Dach', 'Pokrycie', 'System dachu', 'Materiały', 'Ceny', 'Oferta']
    : ['Roof', 'Covering', 'Roof system', 'Materials', 'Prices', 'Quote'];
  const action = {
    'choose-covering': pl
      ? 'Wybierz pokrycie z asortymentu hurtowni'
      : 'Choose covering from the company assortment',
    'complete-technical': pl
      ? `Uzupełnij ${readiness.technicalIssues} kwestii technicznych`
      : `Complete ${readiness.technicalIssues} technical items`,
    'match-assortment': pl
      ? `Powiąż ${readiness.assortmentIssues + readiness.identityIssues} pozycji z asortymentem`
      : `Match ${readiness.assortmentIssues + readiness.identityIssues} assortment items`,
    'fill-prices': pl
      ? `Uzupełnij ${readiness.priceIssues} brakujących cen`
      : `Complete ${readiness.priceIssues} missing prices`,
    'prepare-quote': pl ? 'Przygotuj ofertę' : 'Prepare quote',
    'refresh-quote': pl
      ? 'Odśwież ofertę po zmianach projektu'
      : 'Refresh quote after project changes',
    'preview-quote': pl ? 'Otwórz ofertę roboczą' : 'Open draft quote',
  }[readiness.primaryAction];
  return (
    <section className="bz-journey" data-testid="business-journey">
      <ol>
        {stages.map((stage, index) => (
          <li key={stage} data-stage={stage}>
            <span>{index + 1}</span>
            {labels[index]}
          </li>
        ))}
      </ol>
      <div className="bz-next-action">
        <span>{pl ? 'Co teraz?' : 'What next?'}</span>
        <button
          className="a-button a-primary"
          type="button"
          onClick={() => onAction(readiness.primaryAction)}
        >
          {action}
        </button>
      </div>
      <div className="bz-readiness-split">
        {summary && (
          <span>
            <strong>{pl ? 'Wycena netto' : 'Net estimate'}</strong>{' '}
            {new Intl.NumberFormat(i18n.language, {
              style: 'currency',
              currency: summary.currencyCode,
            }).format(summary.netMinor / 100)}
            {!summary.complete && (
              <small> · {pl ? 'niepełna' : 'incomplete'}</small>
            )}
          </span>
        )}
        <span>
          <strong>{pl ? 'Technicznie' : 'Technical'}</strong>{' '}
          {readiness.technicalIssues ? `⚠ ${readiness.technicalIssues}` : '✓'}
        </span>
        <span>
          <strong>{pl ? 'Handlowo' : 'Commercial'}</strong>{' '}
          {readiness.assortmentIssues +
          readiness.priceIssues +
          readiness.identityIssues
            ? `⚠ ${readiness.assortmentIssues + readiness.priceIssues + readiness.identityIssues}`
            : `✓ ${readiness.readyItems}`}
        </span>
      </div>
    </section>
  );
}
