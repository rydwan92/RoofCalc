import type {
  BusinessCustomer,
  CommercialEstimation,
  CustomerInput,
  EstimationInput,
  EstimationListQuery,
} from '@cieslacalc/business-core';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';
import type { QuoteDraft } from '@cieslacalc/quote-core';

export class WorkspaceError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
export interface SavedQuote {
  id: string;
  commercialEstimationId: string;
  number: string;
  version: number;
  updatedAt: string;
  snapshot: QuoteDraft;
}
export interface EstimationDetail {
  estimation: CommercialEstimation;
  customer: BusinessCustomer;
  project: ProjectRecordV1;
  quote?: SavedQuote;
}
export interface EstimationSummary extends CommercialEstimation {
  customerName: string;
  quoteNumber?: string;
  quoteFingerprint?: string;
  missingPrices?: number;
  netMinor?: number;
  grossMinor?: number;
  currencyCode?: string;
  missingVat?: number;
}
export interface WorkspaceRepository {
  listCustomers(
    org: string,
    search: string,
    limit: number,
    offset: number,
  ): Promise<BusinessCustomer[]>;
  getCustomer(org: string, id: string): Promise<BusinessCustomer | undefined>;
  createCustomer(org: string, input: CustomerInput): Promise<BusinessCustomer>;
  updateCustomer(
    org: string,
    id: string,
    input: CustomerInput,
  ): Promise<BusinessCustomer | undefined>;
  listEstimations(
    org: string,
    customerId: string | undefined,
    limit: number,
    offset: number,
    query?: EstimationListQuery,
  ): Promise<EstimationSummary[]>;
  archiveEstimation(org: string, id: string): Promise<void>;
  getEstimation(org: string, id: string): Promise<EstimationDetail | undefined>;
  createEstimation(
    org: string,
    userId: string,
    input: EstimationInput,
    project: ProjectRecordV1,
  ): Promise<EstimationDetail>;
  saveProject(
    org: string,
    id: string,
    version: number,
    project: ProjectRecordV1,
  ): Promise<number>;
  createQuote(
    org: string,
    estimationId: string,
    draft: QuoteDraft,
  ): Promise<SavedQuote>;
  saveQuote(
    org: string,
    estimationId: string,
    version: number,
    draft: QuoteDraft,
  ): Promise<SavedQuote>;
}
