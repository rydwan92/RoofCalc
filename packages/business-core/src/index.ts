/**
 * Public API of the pure business/wholesale layer (V54).
 *
 * The rule this package exists to enforce: **organization-owned data begins
 * above the commercial variant.** Manufacturers, technical product families,
 * immutable technical revisions and commercial variants stay global — a
 * wholesaler does not own the technical truth of a swissporTON KODA tile. What
 * a wholesaler owns is *which* of those products it sells, under *which*
 * internal code, at *which* price.
 *
 * Consequently this package has no React, no Express, no database, no roof
 * geometry and no catalogue import: a `commercialVariantId` is an opaque
 * reference, exactly as it is in `pricing-core`.
 */

export * from './workspace';

export type {
  AssortmentCommercialState,
  AssortmentImportAction,
  AssortmentImportAudit,
  AssortmentImportIssue,
  AssortmentImportIssueCode,
  AssortmentImportPreview,
  AssortmentImportPreviewRow,
  AssortmentImportRow,
  AssortmentMatchCandidate,
  AssortmentMatchReason,
  AssortmentMatchResult,
  AssortmentMatchState,
  BusinessValidationIssue,
  BusinessValidationIssueCode,
  Organization,
  OrganizationAssortmentItem,
  OrganizationContext,
  OrganizationPriceList,
  OrganizationPriceMissingReason,
  OrganizationPricePolicy,
  OrganizationPriceResult,
  OrganizationPriceSource,
  ResolvedOrganizationPrice,
} from './model';

export {
  ASSORTMENT_IMPORT_FIELDS,
  assortmentColumnMappingSchema,
  assortmentImportRowSchema,
  businessIdSchema,
  canonicalJson,
  organizationAssortmentItemSchema,
  organizationPricePolicySchema,
  organizationSchema,
  organizationProfileSchema,
  type OrganizationProfile,
  SALE_UNITS,
  saleUnitSchema,
  type AssortmentColumnMapping,
  type AssortmentImportField,
} from './persistence';

export {
  activeVariantIds,
  assortmentForOrganization,
  assortmentItemForVariant,
  assortmentLabel,
  assortmentState,
  assortmentSummary,
  isTechnicallyUsable,
  sortForPicker,
  validateAssortmentUniqueness,
} from './assortment';

export {
  resolveOrganizationItemPrice,
  resolveOrganizationPrice,
  visiblePriceLists,
  type OrganizationPriceInput,
} from './price';

export {
  createMatchIndex,
  matchAssortmentRow,
  normalizeKey,
  type AssortmentMatchIndex,
} from './matching';

export {
  ASSORTMENT_FILTERS,
  assortmentCatalogFactsSchema,
  assortmentBulkFlagsRequestSchema,
  assortmentCreateRequestSchema,
  assortmentCommercialStateSchema,
  assortmentDetailResponseSchema,
  assortmentFlagsRequestSchema,
  assortmentImportRequestSchema,
  assortmentLinkRequestSchema,
  assortmentPreviewResponseSchema,
  assortmentPriceCreateRequestSchema,
  assortmentPriceSchema,
  assortmentQuerySchema,
  assortmentSummarySchema,
  assortmentUnlinkRequestSchema,
  businessApiErrorSchema,
  organizationAssortmentResponseSchema,
  organizationAssortmentRowSchema,
  organizationPricesResponseSchema,
  organizationsResponseSchema,
  type AssortmentFilter,
  type AssortmentCreateRequest,
  type AssortmentDetailResponse,
  type AssortmentPriceCreateRequest,
  type AssortmentPreviewResponse,
  type AssortmentQuery,
  type AssortmentSummary,
  type OrganizationAssortmentResponse,
  type OrganizationAssortmentRow,
  type OrganizationPricesResponse,
} from './api';

export {
  applicablePreviewRows,
  buildAssortmentImportPreview,
  mapAssortmentRows,
  normalizeSaleUnit,
  parseAssortmentCsv,
  parseMoneyMinor,
  problemPreviewRows,
  sniffDelimiter,
  type AssortmentPreviewInput,
  type MappedAssortmentRows,
  type ParsedCsv,
} from './csv';
