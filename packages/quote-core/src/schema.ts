import { z } from 'zod';
import type { QuoteDraft } from './index';

const id = z.string().trim().min(1).max(128);
const text = z.string().max(400);
const minor = z.number().int().nonnegative().max(1_000_000_000_000);
const bps = z.number().int().min(0).max(10000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const quantity = z
  .object({
    value: z.number().finite().min(0).max(1e9),
    unit: z.enum([
      'piece',
      'pack',
      'pallet',
      'roll',
      'm',
      'm2',
      'm3',
      'kg',
      'hour',
      'flat',
    ]),
  })
  .strict();
export const quoteDraftSchema: z.ZodType<QuoteDraft> = z
  .object({
    schemaVersion: z.literal(1),
    id,
    status: z.literal('draft'),
    number: z.string().max(64).optional(),
    issuedOn: date.optional(),
    preparedBy: text.optional(),
    organizationSnapshot: z
      .object({
        id,
        name: text.min(1),
        taxId: text.optional(),
        address: text.optional(),
      })
      .strict(),
    customerSnapshot: z
      .object({
        name: text.min(1),
        companyName: text.optional(),
        taxId: text.optional(),
        email: text.optional(),
        phone: text.optional(),
        address: text.optional(),
      })
      .strict(),
    projectReference: z
      .object({ id, name: text.min(1), location: text.optional() })
      .strict(),
    createdAt: z.string().datetime({ offset: true }),
    validUntil: date.optional(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    sourceFingerprint: z.string().min(1).max(128),
    notes: z.string().max(16000).optional(),
    lines: z
      .array(
        z
          .object({
            id,
            group: z.enum([
              'covering',
              'layers',
              'roof-system',
              'drainage',
              'construction',
              'other',
            ]),
            description: z.string().min(1).max(2000),
            organizationSku: text.optional(),
            commercialVariantId: id.optional(),
            technicalQuantity: quantity,
            offerQuantity: quantity,
            quantityOverridden: z.boolean(),
            unitNetAmountMinor: minor.optional(),
            organizationUnitNetAmountMinor: minor.optional(),
            priceSource: z.enum([
              'organization-price-list',
              'manual-estimation',
              'missing',
            ]),
            discountBps: bps.optional(),
            vatRateBps: bps.optional(),
            included: z.boolean(),
          })
          .strict()
          .refine(
            (line) =>
              line.technicalQuantity.unit === line.offerQuantity.unit &&
              (line.priceSource === 'missing') ===
                (line.unitNetAmountMinor === undefined),
            'invalid-line-basis',
          ),
      )
      .max(3000),
  })
  .strict()
  .refine(
    (draft) =>
      new Set(draft.lines.map((line) => line.id)).size === draft.lines.length,
    'duplicate-line-id',
  );
