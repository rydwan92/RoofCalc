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
  type AssortmentImportAudit,
  type AssortmentCreateRequest,
  type AssortmentPriceCreateRequest,
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
      | 'duplicate-external-key'
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

  async setFlagsBulk(
    organizationId: string,
    itemIds: string[],
    flags: { active?: boolean; preferred?: boolean },
  ): Promise<OrganizationAssortmentItem[]> {
    await this.requireOrganization(organizationId);
    const ids = [...new Set(itemIds)];
    if (
      ids.length === 0 ||
      (flags.active === undefined && flags.preferred === undefined)
    )
      throw new BusinessAdminError('business-invalid-request');
    const items =
      await this.repository.assortmentForOrganization(organizationId);
    if (ids.some((id) => !items.some((item) => item.id === id)))
      throw new BusinessAdminError('assortment-item-not-found');
    if (flags.active === true) {
      const wanted = new Set(ids);
      const issues = validateAssortmentUniqueness(
        items.map((item) =>
          wanted.has(item.id) ? { ...item, active: true } : item,
        ),
      );
      if (issues.some((issue) => issue.code === 'duplicate-active-variant'))
        throw new BusinessAdminError('duplicate-active-variant');
    }
    return this.admin.updateAssortmentItemsFlags(organizationId, ids, flags);
  }

  async createItem(
    organizationId: string,
    input: AssortmentCreateRequest,
  ): Promise<OrganizationAssortmentItem> {
    const organization = await this.requireOrganization(organizationId);
    const items =
      await this.repository.assortmentForOrganization(organizationId);
    if (items.some((item) => item.externalKey === input.externalKey))
      throw new BusinessAdminError('duplicate-external-key');
    if (
      input.commercialVariantId &&
      !(await this.catalog.variantExists(input.commercialVariantId))
    )
      throw new BusinessAdminError('commercial-variant-not-found');
    const item: OrganizationAssortmentItem = {
      id: `oai:manual:${randomUUID()}`,
      organizationId,
      ...(input.commercialVariantId
        ? { commercialVariantId: input.commercialVariantId }
        : {}),
      externalKey: input.externalKey,
      ...(input.ean ? { ean: input.ean } : {}),
      sourceName: input.sourceName,
      active: input.active,
      preferred: input.preferred,
    };
    const issues = validateAssortmentUniqueness([...items, item]);
    if (issues.some((issue) => issue.code === 'duplicate-active-variant'))
      throw new BusinessAdminError('duplicate-active-variant');
    const price = input.price
      ? manualPrice(organization, input.commercialVariantId!, input.price)
      : undefined;
    await this.admin.createAssortmentItemWithPrice({
      item,
      ...(price
        ? { priceList: price.priceList, priceEntry: price.priceEntry }
        : {}),
    });
    return item;
  }

  async addPrice(
    organizationId: string,
    input: AssortmentPriceCreateRequest,
  ): Promise<PriceListEntry> {
    const organization = await this.requireOrganization(organizationId);
    const item = await this.repository.assortmentItemForOrganization(
      organizationId,
      input.itemId,
    );
    if (!item) throw new BusinessAdminError('assortment-item-not-found');
    if (!item.commercialVariantId)
      throw new BusinessAdminError('business-invalid-request');
    const price = manualPrice(organization, item.commercialVariantId, input);
    await this.admin.upsertOrganizationPrices({
      priceList: price.priceList,
      entries: [price.priceEntry],
    });
    return price.priceEntry;
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
      const audit = {
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
      } as const;
      await this.applyPreview(organization, existing, preview, audit);
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
    audit: AssortmentImportAudit,
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
    const priced = applicable.filter(
      ({ row }) => row.netAmountMinor !== undefined,
    );
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
    await this.admin.applyAssortmentImport({
      organizationId: organization.id,
      items,
      ...(entries.length ? { priceList } : {}),
      entries,
      audit,
    });
  }
}

function manualPrice(
  organization: Organization,
  commercialVariantId: string,
  input: {
    netAmountMinor: number;
    saleUnit: PriceListEntry['saleUnit'];
    validFrom: string;
    vatRateBps?: number;
  },
): { priceList: OrganizationPriceList; priceEntry: PriceListEntry } {
  const listHash = createHash('sha256')
    .update(organization.id)
    .digest('hex')
    .slice(0, 32);
  const priceList: OrganizationPriceList = {
    id: `price-list:manual:${listHash}`,
    organizationId: organization.id,
    ownerLabel: `${organization.name} — cennik ręczny`,
    currencyCode: organization.currencyCode,
    taxContext: 'net; optional VAT rate recorded as source provenance',
    validFrom: '2000-01-01',
  };
  // `pricing-core` resolves equal-date entries by the lexicographically
  // smallest ID. A reverse timestamp keeps a correction made later that day
  // current without mutating the previous immutable entry.
  const reverseTimestamp = String(
    9_999_999_999_999_999_999n - process.hrtime.bigint(),
  ).padStart(19, '0');
  return {
    priceList,
    priceEntry: {
      id: `price:manual:${reverseTimestamp}:${randomUUID()}`,
      priceListId: priceList.id,
      commercialVariantId,
      saleUnit: input.saleUnit,
      netAmountMinor: input.netAmountMinor,
      sourceAmountBasis: 'net',
      ...(input.vatRateBps !== undefined
        ? { sourceVatRateBps: input.vatRateBps }
        : {}),
      validFrom: input.validFrom,
    },
  };
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
