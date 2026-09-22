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
import { newProjectId } from '@cieslacalc/project-core';
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
import type { AssemblyState } from '../../assembly/store';
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
  scopeRef.current = scope;
  const lastKey = scope ? 'roofcalc.businessEstimation.v1:' + scope : '';
  const quoteQueue = useMemo(
    () =>
      new AutosaveQueue<QuoteDraft>(
        detail?.quote?.snapshot,
        detail?.quote?.version,
        async (snapshot, version) => {
          if (!org || !detail) throw new Error('estimation-required');
          const saved = await workspaceClient.saveQuote(
            org,
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
    [org, detail],
  );
  const projectQueue = useMemo(
    () =>
      new AutosaveQueue(
        detail?.project,
        detail?.estimation.version,
        async (project, version) => {
          if (!org || !detail || !version)
            throw new Error('estimation-required');
          return {
            value: project,
            version: await workspaceClient.saveProject(
              org,
              detail.estimation.id,
              version,
              project,
            ),
          };
        },
      ),
    [org, detail],
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
  useEffect(() => {
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
    setDetail(next);
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
    setDetail(undefined);
    setQuoteOpen(false);
    setWorkspaceError('');
    business.setEstimation(undefined);
    if (!scope || !org) return;
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
      new Date(createdAt).getTime() + 14 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    return createQuoteFromMaterialPlan({
      draft: {
        number: existing?.number,
        issuedOn: existing?.issuedOn ?? createdAt.slice(0, 10),
        preparedBy: existing?.preparedBy ?? business.session?.user.name,
        id: existing?.id ?? newProjectId(),
        organizationSnapshot: {
          id: organization.id,
          name: organization.name,
          ...(organization.taxId ? { taxId: organization.taxId } : {}),
          ...(organization.address ? { address: organization.address } : {}),
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
      },
      rows: materialRows,
      scenario: costScenario,
      prices: effectiveMaterialPrices,
      organizationPrices: commercialPrices.items,
      label: (row) =>
        `${materialText(locale, row.labelKey)}${
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
    state.setMode('builder');
    await projectSession.initialize();
    const before = projectSession.snapshot();
    if (!before.freshProject) await projectSession.create();
    else projectSession.acknowledgeFreshProject();
    await projectSession.rename(input.projectName);
    await projectSession.persistNow();
    const project = projectSession.exportRecord();
    if (!project) throw new Error('project-unavailable');
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
  const saveStatus: RemoteSaveStatus = [quoteState.status, projectState.status].includes(
    'conflict',
  )
    ? 'conflict'
    : [quoteState.status, projectState.status].includes('error')
      ? 'error'
      : [quoteState.status, projectState.status].includes('saving')
        ? 'saving'
        : 'saved';
  return {
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
