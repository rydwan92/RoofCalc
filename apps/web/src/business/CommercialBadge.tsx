import { useTranslation } from 'react-i18next';
import { businessCopy } from './copy';
import { useCommercialState } from './OutsideAssortment';

/**
 * The compact commercial context one Material Plan row shows in Business mode
 * (§42): the wholesaler's own code, and whether a price exists — not a price
 * table. The Material Plan's job is still *what to buy*, in physical units;
 * money lives in the Cost workspace.
 *
 * Renders `null` in STANDARD mode, so the Material Plan needs no mode check of
 * its own and its pre-V54 layout is untouched (§65).
 */
export function CommercialBadge({ variantId }: { variantId?: string }) {
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const state = useCommercialState(variantId);
  if (!state || state.kind === 'loading') return null;
  if (state.kind === 'unavailable')
    return (
      <p className="bz-commercial" data-state="unavailable" role="status">
        {m.unavailable}
      </p>
    );
  if (state.kind === 'outside')
    return (
      <p
        className="bz-commercial"
        data-state="outside"
        data-testid="material-commercial"
      >
        {m.outsideAssortment}
      </p>
    );
  return (
    <p
      className="bz-commercial"
      data-state={state.kind}
      data-testid="material-commercial"
    >
      {state.externalKey && (
        <span>
          {m.wholesalerCode}: <code>{state.externalKey}</code>
        </span>
      )}
      <span>
        {state.kind === 'priced'
          ? `✓ ${m.organizationPrice(
              new Intl.NumberFormat(i18n.language, {
                style: 'currency',
                currency: state.price.currencyCode,
              }).format(state.price.netAmountMinor / 100),
              m.saleUnit[state.price.saleUnit] ?? state.price.saleUnit,
            )}`
          : `⚠ ${m.noWholesalePrice}`}
      </span>
    </p>
  );
}
