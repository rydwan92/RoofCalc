import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  summarizeCostScenario,
  type CostScenario,
} from '@cieslacalc/cost-core';
import { createProjectRecord, newProjectId } from '@cieslacalc/project-core';
import type { QuoteDraft } from '@cieslacalc/quote-core';
import { useBusiness } from '../context';
import { useOrganizationPrices } from '../use-assortment';
import { deriveCommercialReadiness } from '../commercial-readiness';
import {
  commercialProjectionFingerprint,
  createQuoteFromMaterialPlan,
} from '../quote-adapter';
import type { NewEstimationInput } from '../BusinessHome';
import type {
  ProjectSession,
  ProjectSessionState,
} from '../../projects/session';
import {
  createDefaultProjectDocument,
  type AssemblyState,
} from '../../assembly/store';
import type {
  MaterialPlanRow,
  MaterialPriceSelection,
} from '../../assembly/material-plan';
import { materialText } from '../../assembly/material-copy';
import { workbenchLocation } from '../../assembly/workbench';

import { workspaceClient, type EstimationDetail } from './client';
import { AutosaveQueue, type RemoteSaveStatus } from './autosave';

export function useBusinessWorkspace({
  state,
  projectSession,
  projectSessionState,
  materialRows,
  effectiveMaterialPrices,
  costScenario,
  hasCovering,
  locale,
  setReuseFreshProject,
  setProjectStartMode,
}: {
  state: AssemblyState;
  projectSession: ProjectSession;
  projectSessionState: ProjectSessionState;
  materialRows: MaterialPlanRow[];
  effectiveMaterialPrices: Record<string, MaterialPriceSelection>;
  costScenario: CostScenario | undefined;
  hasCovering: boolean;
  locale: string;
  setReuseFreshProject: (value: boolean) => void;
  setProjectStartMode: (value: 'new') => void;
}) {
  const business = useBusiness();
  const [detail, setDetail] = useState<EstimationDetail>();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [opening, setOpening] = useState(false);
  const org = business.organizationId;
  const scope =
    org && business.session ? business.session.user.id + ':' + org : '';
  const scopeRef = useRef(scope);
  const ownerScope = useRef('');
  scopeRef.current = scope;
  const lastKey = scope ? 'roofcalc.businessEstimation.v1:' + scope : '';
  const quoteQueue = useMemo(
    () =>
      new AutosaveQueue<QuoteDraft>(
        detail?.quote?.snapshot,
        detail?.quote?.version,
        async (snapshot, version) => {
          if (!detail) throw new Error('estimation-required');
          const saved = await workspaceClient.saveQuote(
            detail.estimation.organizationId,
            detail.estimation.id,
            snapshot,
            version,
          );
          return { value: saved.snapshot, version: saved.version };
        },
        (current, saved) => ({
          ...current,
          id: saved.id,
          number: saved.number,
          createdAt: saved.createdAt,
        }),
      ),
    [detail],
  );
  const projectQueue = useMemo(
    () =>
      new AutosaveQueue(
        detail?.project,
        detail?.estimation.version,
        async (project, version) => {
          if (!detail || !version) throw new Error('estimation-required');
          return {
            value: project,
            version: await workspaceClient.saveProject(
              detail.estimation.organizationId,
              detail.estimation.id,
              version,
              project,
            ),
          };
        },
      ),
    [detail],
  );
  const quoteState = useSyncExternalStore(
    quoteQueue.subscribe,
    quoteQueue.snapshot,
  );
  const projectState = useSyncExternalStore(
    projectQueue.subscribe,
    projectQueue.snapshot,
  );
  const flush = async () => {
    await projectQueue.flush();
    await quoteQueue.flush();
  };
  const returnHome = async () => {
    try {
      await flush();
    } catch {
      /* Keep both queues and expose recovery on return. */
    }
    setQuoteOpen(false);
    business.setHomeOpen(true);
  };
  useEffect(() => {
    quoteQueue.resume();
    projectQueue.resume();
    const warn = (event: BeforeUnloadEvent) => {
      if (quoteQueue.dirty() || projectQueue.dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      quoteQueue.dispose();
      projectQueue.dispose();
      window.removeEventListener('beforeunload', warn);
    };
  }, [quoteQueue, projectQueue]);
  useEffect(() => {
    if (scope && scope === ownerScope.current) {
      quoteQueue.resume();
      projectQueue.resume();
      void projectQueue.flush().catch(() => undefined);
      void quoteQueue.flush().catch(() => undefined);
    } else {
      quoteQueue.suspend();
      projectQueue.suspend();
    }
  }, [scope, quoteQueue, projectQueue]);
  useEffect(() => {
    if (
      !detail ||
      opening ||
      state.activeTransaction ||
      projectSessionState.active?.id !== detail.project.id
    )
      return;
    const current = projectQueue.snapshot().value;
    if (
      JSON.stringify(current?.document) !==
      JSON.stringify(state.projectDocument)
    )
      projectQueue.set({
        ...detail.project,
        document: state.projectDocument,
        updatedAt: new Date().toISOString(),
      });
  }, [
    detail,
    opening,
    state.projectDocument,
    state.activeTransaction,
    projectSessionState.active?.id,
    projectQueue,
  ]);

  const activate = async (next: EstimationDetail, expectedScope: string) => {
    if (scopeRef.current !== expectedScope) return;
    state.setMode('builder');
    await projectSession.initialize();
    if (scopeRef.current !== expectedScope) return;
    await projectSession.openRemote(next.project);
    ownerScope.current = expectedScope;
    setDetail(next);
    setQuoteOpen(false);
    business.setEstimation({
      id: next.estimation.id,
      projectId: next.project.id,
      projectName: next.estimation.name,
      location: next.estimation.location,
      createdAt: next.estimation.createdAt,
      customer: {
        name: next.customer.name,
        companyName: next.customer.companyName,
        taxId: next.customer.taxId,
        email: next.customer.email,
        phone: next.customer.phone,
        address: next.customer.address,
      },
    });
    try {
      localStorage.setItem(lastKey, next.estimation.id);
    } catch {
      /* Optional pointer only. */
    }
    business.setHomeOpen(false);
  };
  // Scope changes discard all previous tenant state. The stored value is only
  // an opaque pointer; the server authorizes every restore.
  useEffect(() => {
    // An expired session must not throw away queued roof/quote edits. A renewed
    // session for the same user resumes the existing queues and their versions.
    if (!scope || scope === ownerScope.current) return;
    setDetail(undefined);
    setQuoteOpen(false);
    setWorkspaceError('');
    business.setEstimation(undefined);
    ownerScope.current = scope;
    if (!org) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(lastKey);
    } catch {
      /* Optional. */
    }
    if (!last) return;
    let cancelled = false;
    setOpening(true);
    void workspaceClient
      .estimation(org, last)
      .then(async (next) => {
        if (cancelled) return;
        await activate(next, scope);
        if (!cancelled) setQuoteOpen(!!next.quote);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceError('load');
      })
      .finally(() => {
        if (!cancelled) setOpening(false);
      });
    return () => {
      cancelled = true;
    };
    // Restoration is intentionally once per authenticated organization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const materialVariantIds = materialRows.flatMap((row) =>
    row.product?.variantId ? [row.product.variantId] : [],
  );
  const commercialPrices = useOrganizationPrices(materialVariantIds);
  const activeProjectId = projectSessionState.active?.id;
  const currentQuoteDraft = quoteState.value;
  const currentCommercialFingerprint = costScenario
    ? commercialProjectionFingerprint({
        rows: materialRows,
        scenario: costScenario,
        prices: effectiveMaterialPrices,
        organizationPrices: commercialPrices.items,
      })
    : '';
  const costSummary = costScenario
    ? summarizeCostScenario(costScenario)
    : undefined;
  const commercialReadiness = deriveCommercialReadiness({
    rows: materialRows,
    manuallyPricedRows: new Set(
      Object.entries(effectiveMaterialPrices)
        .filter(
          ([, price]) =>
            price.source === 'manual' &&
            price.valid !== false &&
            price.currencyCode === costScenario?.currencyCode,
        )
        .map(([id]) => id),
    ),
    priceStateByVariant: commercialPrices.byVariantId,
    hasCovering: hasCovering,
    cost: costSummary,
    quoteExists: !!currentQuoteDraft,
    quoteStale:
      !!currentQuoteDraft &&
      currentQuoteDraft.sourceFingerprint !== currentCommercialFingerprint,
  });

  const createCurrentQuote = (existing?: QuoteDraft) => {
    const active = projectSessionState.active;
    const estimation = business.estimation;
    const organization = business.organization;
    if (!active || !estimation || !organization || !costScenario)
      return undefined;
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const validUntil = new Date(
      new Date(createdAt).getTime() +
        (organization.defaultValidityDays ?? 14) * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    return createQuoteFromMaterialPlan({
      draft: {
        number: existing?.number,
        issuedOn: existing?.issuedOn ?? createdAt.slice(0, 10),
        preparedBy: existing?.preparedBy ?? business.session?.user.name,
        id: existing?.id ?? newProjectId(),
        organizationSnapshot: existing?.organizationSnapshot ?? {
          id: organization.id,
          name: organization.name,
          ...(organization.taxId ? { taxId: organization.taxId } : {}),
          ...(organization.address ? { address: organization.address } : {}),
          ...(organization.phone ? { phone: organization.phone } : {}),
          ...(organization.email ? { email: organization.email } : {}),
          ...(organization.website ? { website: organization.website } : {}),
          ...(organization.logoUrl ? { logoUrl: organization.logoUrl } : {}),
        },
        customerSnapshot: estimation.customer,
        projectReference: {
          id: active.id,
          name: estimation.projectName,
          ...(estimation.location ? { location: estimation.location } : {}),
        },
        createdAt,
        validUntil: existing?.validUntil ?? validUntil,
        currencyCode: organization.currencyCode,
        ...(existing?.notes ? { notes: existing.notes } : {}),
        footer: existing ? existing.footer : organization.offerFooter,
      },
      rows: materialRows,
      scenario: costScenario,
      prices: effectiveMaterialPrices,
      organizationPrices: commercialPrices.items,
      label: (row) =>
        `${row.product?.name || materialText(locale, row.labelKey)}${
          row.description ? ` · ${row.description}` : ''
        }`,
    });
  };

  const openQuote = () => {
    if (!detail || !org || detail.project.id !== activeProjectId) {
      business.setHomeOpen(true);
      return;
    }
    if (!quoteState.value) {
      const draft = createCurrentQuote();
      if (!draft) return;
      quoteQueue.set(draft);
    }
    setQuoteOpen(true);
  };
  const refreshQuote = () => {
    const next = createCurrentQuote(quoteState.value);
    if (next) quoteQueue.set(next);
  };
  const changeQuote = (draft: QuoteDraft) => quoteQueue.set(draft);
  const runCommercialAction = (
    action: (typeof commercialReadiness)['primaryAction'],
  ) => {
    business.setHomeOpen(false);
    if (action === 'choose-covering') {
      state.navigateTo(workbenchLocation('covering'));
      return;
    }
    if (
      ['complete-technical', 'match-assortment', 'fill-prices'].includes(action)
    ) {
      state.navigateTo(workbenchLocation('materials', 'plan'));
      return;
    }
    if (action === 'refresh-quote') refreshQuote();
    openQuote();
  };
  const startBusinessEstimation = async (input: NewEstimationInput) => {
    if (!org) throw new Error('organization-required');
    await flush();
    const expectedScope = scope;
    const customer = input.customerId
      ? { id: input.customerId }
      : await workspaceClient.createCustomer(org, {
          ...input.customer,
          type: input.customer.companyName ? 'company' : 'person',
        });
    const project = createProjectRecord(
      createDefaultProjectDocument(),
      input.projectName,
    );
    const next = await workspaceClient.createEstimation(
      org,
      {
        customerId: customer.id,
        roofProjectId: project.id,
        name: input.projectName,
        location: input.location,
      },
      project,
    );
    await activate(next, expectedScope);
    setReuseFreshProject(true);
    setProjectStartMode('new');
  };
  const openBusinessProject = async (id: string) => {
    if (!org) return;
    await flush();
    setOpening(true);
    setWorkspaceError('');
    try {
      const next = await workspaceClient.estimation(org, id);
      await activate(next, scope);
      setQuoteOpen(!!next.quote);
    } catch {
      setWorkspaceError('load');
      throw new Error('estimation-open-failed');
    } finally {
      setOpening(false);
    }
  };
  const reloadRemote = async () => {
    if (!org || !detail) return;
    if (
      (quoteQueue.dirty() || projectQueue.dirty()) &&
      !window.confirm(
        locale.startsWith('pl')
          ? 'Odrzucić lokalne zmiany i wczytać wersję serwera?'
          : 'Discard local edits and load the server version?',
      )
    )
      return;
    const next = await workspaceClient.estimation(org, detail.estimation.id);
    await activate(next, scope);
    setQuoteOpen(!!next.quote);
  };
  const saveStatus: RemoteSaveStatus = [
    quoteState.status,
    projectState.status,
  ].includes('conflict')
    ? 'conflict'
    : [quoteState.status, projectState.status].includes('error')
      ? 'error'
      : [quoteState.status, projectState.status].includes('saving')
        ? 'saving'
        : 'saved';

  const exportRecovery = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schemaVersion: 1,
            estimation: detail?.estimation,
            project: projectQueue.snapshot().value,
            quote: quoteQueue.snapshot().value,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'roofcalc-business-recovery.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const guardRef = useRef<() => Promise<boolean>>(async () => true);
  guardRef.current = async () => {
    if (!projectQueue.dirty() && !quoteQueue.dirty()) return true;
    try {
      await flush();
      return true;
    } catch {
      const leave = window.confirm(
        locale.startsWith('pl')
          ? 'Nie zapisano wszystkich zmian. Pobrać kopię JSON bieżącej wyceny i kontynuować?'
          : 'Some changes are unsaved. Download a JSON recovery copy and continue?',
      );
      if (leave) exportRecovery();
      return leave;
    }
  };
  const registerLeaveGuard = business.registerLeaveGuard;
  useEffect(
    () => registerLeaveGuard?.(() => guardRef.current()),
    [registerLeaveGuard],
  );
  return {
    returnHome,
    commercialSummary: costSummary,
    activeEstimation:
      detail && detail.project.id === activeProjectId
        ? detail.estimation
        : undefined,
    exportRecovery,
    currentQuoteDraft,
    currentCommercialFingerprint,
    commercialReadiness,
    quoteOpen,
    setQuoteOpen,
    openQuote,
    refreshQuote,
    runCommercialAction,
    startBusinessEstimation,
    openBusinessProject,
    changeQuote,
    saveStatus,
    retrySave: flush,
    reloadRemote,
    workspaceError,
    opening,
    compareDraft: quoteOpen ? createCurrentQuote(quoteState.value) : undefined,
  };
}
