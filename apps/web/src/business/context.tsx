import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  Organization,
  OrganizationPricePolicy,
} from '@cieslacalc/business-core';
import { businessClient, type BusinessClient } from './client';

/**
 * The **application's** business context (§12, §49).
 *
 * This is deliberately not project state. A roof's geometry, its technical
 * snapshots and its purchase quantities must not change because the user
 * switched wholesaler, so the active organization lives here — in the
 * application/session layer — and never enters `RoofProjectDocumentV1`, its
 * undo history or its autosave. Switching organization re-reads availability,
 * SKUs and price suggestions, and touches nothing else.
 *
 * `STANDARD` is the default and is byte-for-byte the pre-V54 experience: no
 * organization selector, no wholesaler badges, no Admin entry and no business
 * request on any calculation path (§65).
 */

export type AppMode = 'standard' | 'business';

const MODE_KEY = 'cieslacalc.businessMode.v1';
const ORGANIZATION_KEY = 'cieslacalc.activeOrganization.v1';
const POLICY_KEY = 'cieslacalc.organizationPricePolicy.v1';

/** Browser storage is a per-viewer convenience here; absence is not an error. */
function readStored(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: string | undefined) {
  try {
    if (value === undefined) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    /* Private mode or blocked storage must never break the workbench. */
  }
}

export interface BusinessContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  /** Undefined in STANDARD mode, or before an organization is chosen. */
  organization?: Organization;
  organizationId?: string;
  setOrganizationId: (organizationId: string | undefined) => void;
  organizations: Organization[];
  pricePolicy: OrganizationPricePolicy;
  setPricePolicy: (policy: OrganizationPricePolicy) => void;
  /** True while the organization list is still loading in business mode. */
  loading: boolean;
  /**
   * The business API could not be reached. Business surfaces say
   * "Dane firmy są chwilowo niedostępne."; the roof keeps working (§66).
   */
  unavailable: boolean;
  client: BusinessClient;
}

const BusinessContext = createContext<BusinessContextValue | undefined>(
  undefined,
);

export function BusinessContextProvider({
  children,
  client = businessClient,
  initialMode,
}: {
  children: ReactNode;
  client?: BusinessClient;
  initialMode?: AppMode;
}) {
  const [mode, setModeState] = useState<AppMode>(
    () =>
      initialMode ??
      (readStored(MODE_KEY) === 'business' ? 'business' : 'standard'),
  );
  const [organizationId, setOrganizationIdState] = useState<string | undefined>(
    () => readStored(ORGANIZATION_KEY),
  );
  const [pricePolicy, setPricePolicyState] = useState<OrganizationPricePolicy>(
    () =>
      readStored(POLICY_KEY) === 'organization-then-catalogue'
        ? 'organization-then-catalogue'
        : 'organization-only',
  );

  /** No business request is ever issued in STANDARD mode. */
  const organizationsQuery = useQuery({
    queryKey: ['business', 'organizations'],
    queryFn: ({ signal }) => client.listOrganizations(signal),
    enabled: mode === 'business',
    retry: false,
    staleTime: 5 * 60_000,
  });

  const organizations = useMemo(
    () => organizationsQuery.data ?? [],
    [organizationsQuery.data],
  );

  const setMode = useCallback((next: AppMode) => {
    setModeState(next);
    writeStored(MODE_KEY, next === 'business' ? 'business' : undefined);
  }, []);

  const setOrganizationId = useCallback((next: string | undefined) => {
    setOrganizationIdState(next);
    writeStored(ORGANIZATION_KEY, next);
  }, []);

  const setPricePolicy = useCallback((next: OrganizationPricePolicy) => {
    setPricePolicyState(next);
    writeStored(POLICY_KEY, next);
  }, []);

  /**
   * One selected organization in V54. When the stored ID is unknown to this
   * server, the first available organization is used rather than leaving the
   * user in a half-configured business mode.
   */
  const organization = useMemo(() => {
    if (mode !== 'business') return undefined;
    return (
      organizations.find((item) => item.id === organizationId) ??
      organizations[0]
    );
  }, [mode, organizationId, organizations]);

  const value = useMemo<BusinessContextValue>(
    () => ({
      mode,
      setMode,
      ...(organization
        ? { organization, organizationId: organization.id }
        : {}),
      setOrganizationId,
      organizations,
      pricePolicy,
      setPricePolicy,
      loading: mode === 'business' && organizationsQuery.isPending,
      unavailable: mode === 'business' && organizationsQuery.isError,
      client,
    }),
    [
      client,
      mode,
      organization,
      organizations,
      organizationsQuery.isError,
      organizationsQuery.isPending,
      pricePolicy,
      setMode,
      setOrganizationId,
      setPricePolicy,
    ],
  );

  return (
    <BusinessContext.Provider value={value}>
      {children}
    </BusinessContext.Provider>
  );
}

/**
 * Business context, or a STANDARD-mode stub when no provider is mounted.
 * The stub is what keeps every pre-V54 component and test working untouched:
 * a component that asks "are we in business mode?" outside the provider is
 * truthfully told "no".
 */
export function useBusiness(): BusinessContextValue {
  const value = useContext(BusinessContext);
  return (
    value ?? {
      mode: 'standard',
      setMode: () => undefined,
      setOrganizationId: () => undefined,
      organizations: [],
      pricePolicy: 'organization-only' as const,
      setPricePolicy: () => undefined,
      loading: false,
      unavailable: false,
      client: businessClient,
    }
  );
}

/** The active organization, or undefined outside business mode. */
export function useActiveOrganization(): Organization | undefined {
  return useBusiness().organization;
}
