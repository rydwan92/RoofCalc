import { z } from 'zod';
import {
  LINE_ROLE_RULES,
  QUANTITY_RULE_KINDS,
  ROOF_LINE_COMPONENT_ROLES,
  type RoofLineComponentRole,
} from './roles';

/**
 * V52 `roof-system-component`: ONE technical catalogue kind for the linear
 * and line-bound roof-system elements (ridge tape, ridge ends, clips, eave
 * combs/strips/flashings, verge flashings). The role is a field, never a
 * table and never recovered from a name.
 *
 * Every numeric fact is optional and present only when the source states it.
 * `quantityRule` is what the SOURCE declares; when it is absent the user must
 * confirm a rule before RoofCalc derives a quantity. Compatibility is
 * structural: `universal`, or an explicit list of covering product IDs —
 * never a manufacturer or name match.
 */
const stableId = z.string().min(1).max(128);
const positiveMm = z.number().finite().positive().max(100_000);

export const roofSystemComponentCompatibilitySchema = z.discriminatedUnion(
  'scope',
  [
    z.object({ scope: z.literal('universal') }).strict(),
    z
      .object({
        scope: z.literal('covering-products'),
        productIds: z.array(stableId).min(1).max(50),
      })
      .strict(),
  ],
);
export type RoofSystemComponentCompatibility = z.infer<
  typeof roofSystemComponentCompatibilitySchema
>;

export const roofSystemComponentTechnicalSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('roof-system-component'),
    role: z.enum(ROOF_LINE_COMPONENT_ROLES as [string, ...string[]]),
    /** Optional technical system identifier (a manufacturer's ridge system). */
    systemKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    /** Commercial length of one piece. */
    lengthMm: positiveMm.optional(),
    /** Installed cover of one piece along the line (overlap already in it). */
    effectiveCoverLengthMm: positiveMm.optional(),
    /** Length of one roll. */
    rollLengthMm: positiveMm.optional(),
    /** Informative only; never changes a linear requirement. */
    widthMm: positiveMm.optional(),
    quantityRule: z.enum(QUANTITY_RULE_KINDS).optional(),
    compatibility: roofSystemComponentCompatibilitySchema,
  })
  .strict()
  .superRefine((spec, context) => {
    const allowed = LINE_ROLE_RULES[spec.role as RoofLineComponentRole];
    if (spec.quantityRule && !allowed.includes(spec.quantityRule))
      context.addIssue({
        code: 'custom',
        message: 'rule_not_allowed_for_role',
      });
    if (spec.quantityRule === 'roll-length' && !spec.rollLengthMm)
      context.addIssue({ code: 'custom', message: 'roll_rule_requires_roll' });
    if (
      spec.quantityRule === 'linear-effective-cover' &&
      !spec.effectiveCoverLengthMm
    )
      context.addIssue({
        code: 'custom',
        message: 'cover_rule_requires_cover',
      });
  });
export type RoofSystemComponentTechnicalSpec = z.infer<
  typeof roofSystemComponentTechnicalSpecSchema
>;

/** Whether a component may be used with the chosen covering product. */
export function isComponentCompatible(
  spec: Pick<RoofSystemComponentTechnicalSpec, 'compatibility'>,
  coveringProductId: string | undefined,
): boolean {
  if (spec.compatibility.scope === 'universal') return true;
  return (
    coveringProductId !== undefined &&
    spec.compatibility.productIds.includes(coveringProductId)
  );
}

export const roofLineComponentRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('linear-effective-cover'),
    effectiveCoverLengthMm: positiveMm,
  }),
  z.object({ kind: z.literal('roll-length'), rollLengthMm: positiveMm }),
  z.object({ kind: z.literal('one-per-feature-end') }),
  z.object({ kind: z.literal('one-per-ridge-tile') }),
  z.object({
    kind: z.literal('manual'),
    quantity: z.number().int().min(0).max(100_000),
  }),
]);
export type RoofLineComponentRule = z.infer<typeof roofLineComponentRuleSchema>;

/**
 * A line-bound roof-system component the user added (V51 manual; V52 also
 * from the catalogue). Only decisions are stored: which product, which rule,
 * which features, which explicit allowance. Every count is derived.
 */
export const roofLineComponentIntentSchema = z
  .object({
    id: stableId,
    role: z.enum(ROOF_LINE_COMPONENT_ROLES as [string, ...string[]]),
    name: z.string().trim().min(1).max(240),
    /** Absent on V51 documents: manual. */
    source: z.enum(['catalog', 'manual']).optional(),
    product: z
      .object({
        spec: roofSystemComponentTechnicalSpecSchema,
        manufacturer: z.string().trim().min(1).max(160).optional(),
        catalogRef: z
          .object({
            productId: stableId,
            technicalRevisionId: stableId,
            variantId: stableId.optional(),
          })
          .optional(),
      })
      .optional(),
    /** Explicit feature selection; absent = every feature of the role. */
    featureIds: z.array(stableId).max(200).optional(),
    /** Explicit user allowance added to the total line requirement, mm. */
    allowanceMm: z.number().finite().min(0).max(100_000).optional(),
    rule: roofLineComponentRuleSchema,
  })
  .superRefine((intent, context) => {
    const allowed = LINE_ROLE_RULES[intent.role as RoofLineComponentRole];
    if (!allowed.includes(intent.rule.kind))
      context.addIssue({
        code: 'custom',
        message: 'rule_not_allowed_for_role',
      });
  });
export type RoofLineComponentIntent = z.infer<
  typeof roofLineComponentIntentSchema
>;
