import { createHash, randomUUID } from 'node:crypto';
import {
  applicablePreviewRows,
  assortmentColumnMappingSchema,
  buildAssortmentImportPreview,
  canonicalJson,
  mapAssortmentRows,
  parseAssortmentCsv,
  validateAssortmentUniqueness,
  type AssortmentImportPreview,
  type AssortmentPreviewResponse,
  type Organization,
  type OrganizationAssortmentItem,
  type OrganizationPriceList,
} from '@cieslacalc/business-core';
import type { PriceListEntry } from '@cieslacalc/pricing-core';
import type {
  BusinessAdminRepository,
  BusinessCatalogReader,
  BusinessRepository,
} from './repository';

export class BusinessAdminError extends Error {
  constructor(
    readonly code:
      | 'business-invalid-request'
      | 'organization-not-found'
      | 'assortment-item-not-found'
      | 'commercial-variant-not-found'
      | 'duplicate-active-variant',
  ) {
    super(code);
  }
}

/** How many catalogue variants one import run may match against. */
const MATCH_CANDIDATE_LIMIT = 20_000;

/**
 * Admin mutations for one organization's assortment (§19–§32).
 *
 * The service itself is complete and safe to call; **whether it is reachable
 * over HTTP** is decided entirely by `capability.ts`'s local/dev gate, because
 * production authentication does not exist yet. Keeping the domain here rather
 * than inside a route handler is what makes it testable without a server and
 * reusable the day real authentication arrives.
 *
 * Two rules this service exists to hold:
 *
 * - it **never touches the global catalogue**. Linking writes one
 *   organization-owned column; it cannot create, edit or delete a
 *   manufacturer, product, revision or commercial variant (§21);
 * - it **never deletes**. Unlinking clears a reference, deactivating sets a
 *   flag; the organization's commercial history stays (§22, §56).
 */
export class BusinessAdminService {
  constructor(
    private readonly repository: BusinessRepository,
    private readonly admin: BusinessAdminRepository,
    private readonly catalog: BusinessCatalogReader,
  ) {}

  private async requireOrganization(
    organizationId: string,
  ): Promise<Organization> {
    const organization = await this.repository.getOrganization(organizationId);
    if (!organization) throw new BusinessAdminError('organization-not-found');
    return organization;
  }

  /**
   * Manual mapping (§21). Verifies the variant really exists in the global
   * catalogue first — a link to a non-existent ID would look matched while
   * being unusable — and refuses a second *active* row for the same variant.
   */
  async link(
    organizationId: string,
    itemId: string,
    commercialVariantId: string,
  ): Promise<OrganizationAssortmentItem> {
    await this.requireOrganization(organizationId);
    if (!(await this.catalog.variantExists(commercialVariantId)))
      throw new BusinessAdminError('commercial-variant-not-found');
    const items =
      await this.repository.assortmentForOrganization(organizationId);
    const target = items.find((item) => item.id === itemId);
    if (!target) throw new BusinessAdminError('assortment-item-not-found');
    const issues = validateAssortmentUniqueness(
      items.map((item) =>
        item.id === itemId ? { ...item, commercialVariantId } : item,
      ),
    );
    if (issues.some((issue) => issue.code === 'duplicate-active-variant'))
      throw new BusinessAdminError('duplicate-active-variant');
    const updated = await this.admin.updateAssortmentItem(
      organizationId,
      itemId,
      { commercialVariantId },
    );
    if (!updated) throw new BusinessAdminError('assortment-item-not-found');
    return updated;
  }

  /** §22: the organization row survives; only the catalogue reference goes. */
  async unlink(
    organizationId: string,
    itemId: string,
  ): Promise<OrganizationAssortmentItem> {
    await this.requireOrganization(organizationId);
    const updated = await this.admin.updateAssortmentItem(
      organizationId,
      itemId,
      { commercialVariantId: null },
    );
    if (!updated) throw new BusinessAdminError('assortment-item-not-found');
    return updated;
  }

  /** Active / preferred / display name. `null` clears the display override. */
  async setFlags(
    organizationId: string,
    itemId: string,
    flags: {
      active?: boolean;
      preferred?: boolean;
      displayNameOverride?: string | null;
    },
  ): Promise<OrganizationAssortmentItem> {
    await this.requireOrganization(organizationId);
    if (
      flags.active === undefined &&
      flags.preferred === undefined &&
      flags.displayNameOverride === undefined
    )
      throw new BusinessAdminError('business-invalid-request');
    if (flags.active === true) {
      const items =
        await this.repository.assortmentForOrganization(organizationId);
      const target = items.find((item) => item.id === itemId);
      if (!target) throw new BusinessAdminError('assortment-item-not-found');
      const issues = validateAssortmentUniqueness(
        items.map((item) =>
          item.id === itemId ? { ...item, active: true } : item,
        ),
      );
      if (issues.some((issue) => issue.code === 'duplicate-active-variant'))
        throw new BusinessAdminError('duplicate-active-variant');
    }
    const updated = await this.admin.updateAssortmentItem(
      organizationId,
      itemId,
      flags,
    );
    if (!updated) throw new BusinessAdminError('assortment-item-not-found');
    return updated;
  }

  /**
   * CSV import (§23–§30). `apply: false` is a real dry run: it reads, maps,
   * matches and reports, and writes nothing at all. Only an explicit
   * `apply: true` second call writes, and only the rows the preview marked
   * `create` or `update` — a blocked row is never written (§26).
   */
  async importCsv(
    organizationId: string,
    input: {
      sourceLabel: string;
      csv: string;
      mapping: Record<string, string>;
      apply: boolean;
    },
  ): Promise<AssortmentPreviewResponse> {
    const organization = await this.requireOrganization(organizationId);
    const mapping = assortmentColumnMappingSchema.safeParse(input.mapping);
    if (!mapping.success)
      throw new BusinessAdminError('business-invalid-request');
    const parsed = parseAssortmentCsv(input.csv);
    if (!parsed.headers.length)
      throw new BusinessAdminError('business-invalid-request');
    const mapped = mapAssortmentRows(parsed, mapping.data);
    const [existing, candidates] = await Promise.all([
      this.repository.assortmentForOrganization(organizationId),
      this.catalog.matchCandidates(MATCH_CANDIDATE_LIMIT),
    ]);
    const preview = buildAssortmentImportPreview({
      organizationId,
      rows: mapped.rows,
      issues: mapped.issues,
      existing,
      candidates: candidates.map((facts) => ({
        commercialVariantId: facts.variantId,
        ...(facts.variantSku ? { sku: facts.variantSku } : {}),
        manufacturerName: facts.manufacturerName,
        productName: facts.productName,
        variantName: facts.variantName,
      })),
    });

    if (input.apply) {
      const startedAt = new Date().toISOString();
      await this.applyPreview(organization, existing, preview);
      await this.admin.recordImport({
        id: `import:${organizationId}:${randomUUID()}`,
        organizationId,
        sourceLabel: input.sourceLabel,
        // The checksum covers the *mapped* rows, so the same file re-imported
        // through the same mapping is recognisably the same run (§29/§32).
        checksum: createHash('sha256')
          .update(canonicalJson(mapped.rows))
          .digest('hex'),
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'completed',
        counts: preview.counts,
      });
    }
    return toPreviewResponse(preview, input.apply);
  }

  /**
   * Writes the applicable rows, then — separately — the organization's price
   * list (§30). The two writes are deliberately distinct concepts: an
   * assortment row says *we sell this*, a price entry says *at this amount
   * today*. Historical accepted estimate lines are never touched.
   */
  private async applyPreview(
    organization: Organization,
    existing: readonly OrganizationAssortmentItem[],
    preview: AssortmentImportPreview,
  ): Promise<void> {
    const byKey = new Map(existing.map((item) => [item.externalKey, item]));
    const applicable = applicablePreviewRows(preview);
    const items: OrganizationAssortmentItem[] = applicable.map(
      ({ row, match }) => {
        const previous = byKey.get(row.externalKey);
        const variantId =
          match.commercialVariantId ?? previous?.commercialVariantId;
        return {
          id:
            previous?.id ??
            `oai:${organization.id}:${createHash('sha256')
              .update(`${organization.id} ${row.externalKey}`)
              .digest('hex')
              .slice(0, 32)}`,
          organizationId: organization.id,
          ...(variantId ? { commercialVariantId: variantId } : {}),
          externalKey: row.externalKey,
          ...(row.ean ? { ean: row.ean } : {}),
          sourceName: row.sourceName,
          ...(previous?.displayNameOverride
            ? { displayNameOverride: previous.displayNameOverride }
            : {}),
          active: row.active ?? previous?.active ?? true,
          // An import never overwrites an admin's own commercial preference.
          preferred: previous?.preferred ?? row.preferred ?? false,
        };
      },
    );
    if (items.length)
      await this.admin.upsertAssortmentItems(organization.id, items);

    const priced = applicable.filter(
      ({ row }) => row.netAmountMinor !== undefined,
    );
    if (!priced.length) return;
    const validFrom = new Date().toISOString().slice(0, 10);
    const priceList: OrganizationPriceList = {
      id: `price-list:${organization.id}:import`,
      organizationId: organization.id,
      ownerLabel: `${organization.name} — cennik (import)`,
      currencyCode: organization.currencyCode,
      taxContext: 'net, imported from the organization price file',
      validFrom,
    };
    const entries: PriceListEntry[] = priced.flatMap(({ row, match }) => {
      const variantId =
        match.commercialVariantId ??
        byKey.get(row.externalKey)?.commercialVariantId;
      // A price entry references a catalogue variant, so an unmatched row has
      // nowhere to attach a price yet. The row itself is still imported.
      if (!variantId) return [];
      return [
        {
          id: `price:${organization.id}:${validFrom}:${row.externalKey}`,
          priceListId: priceList.id,
          commercialVariantId: variantId,
          saleUnit: row.saleUnit ?? 'piece',
          netAmountMinor: row.netAmountMinor!,
          ...(row.vatRateBps !== undefined
            ? {
                sourceAmountBasis: 'gross' as const,
                sourceVatRateBps: row.vatRateBps,
              }
            : { sourceAmountBasis: 'net' as const }),
          validFrom,
        },
      ];
    });
    if (entries.length)
      await this.admin.upsertOrganizationPrices({ priceList, entries });
  }
}

function toPreviewResponse(
  preview: AssortmentImportPreview,
  applied: boolean,
): AssortmentPreviewResponse {
  return {
    organizationId: preview.organizationId,
    applied,
    counts: preview.counts,
    rows: preview.rows.map(({ row, action, match, issues }) => ({
      sourceLine: row.sourceLine,
      externalKey: row.externalKey,
      sourceName: row.sourceName,
      action,
      matchState: match.state,
      ...(match.commercialVariantId
        ? { commercialVariantId: match.commercialVariantId }
        : {}),
      ...(match.candidateIds?.length
        ? { candidateIds: match.candidateIds }
        : {}),
      ...(row.netAmountMinor !== undefined
        ? { netAmountMinor: row.netAmountMinor }
        : {}),
      issues: issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
      })),
    })),
  };
}
