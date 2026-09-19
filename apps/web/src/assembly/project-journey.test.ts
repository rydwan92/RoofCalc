import { describe, expect, it } from 'vitest';
import { deriveProjectJourney, type JourneyFacts } from './project-journey';
import type {
  ProjectReadiness,
  ReadinessAreaSummary,
  ReadinessIssue,
} from './project-readiness';
import type {
  RoofSystemArea,
  RoofSystemChecklist,
} from './roof-system-checklist';

const issue = (
  code: ReadinessIssue['code'],
  area: ReadinessIssue['area'],
  severity: ReadinessIssue['severity'],
  action?: ReadinessIssue['action'],
): ReadinessIssue => ({
  id: code,
  code,
  area,
  severity,
  ...(action ? { action } : {}),
  affects: ['materials'],
  safeRepair: false,
  source: 'test',
});

const areas = (
  states: Partial<Record<ReadinessAreaSummary['area'], string>>,
): ReadinessAreaSummary[] =>
  (
    [
      'construction',
      'covering',
      'layers',
      'execution',
      'materials',
      'cost',
    ] as const
  ).map((area) => ({
    area,
    requirement: 'required',
    state: (states[area] ?? 'ready') as ReadinessAreaSummary['state'],
    counted: true,
    issueIds: [],
  }));

function readiness(
  issues: ReadinessIssue[],
  states: Partial<Record<ReadinessAreaSummary['area'], string>> = {},
  execution: 'ready' | 'blocked' = 'ready',
): ProjectReadiness {
  const doc = (state: string) => ({
    kind: 'execution' as const,
    state: state as 'ready',
    blockerIds: [],
    warningIds: [],
    readySections: 1,
    totalSections: 1,
  });
  return {
    issues,
    areas: areas(states),
    documents: {
      execution: doc(execution),
      materials: doc('ready'),
      cost: doc('ready'),
    },
    primary:
      issues.find((item) => item.severity !== 'info') ??
      issues.find(
        (item) =>
          item.severity === 'info' &&
          (item.area === 'covering' || item.area === 'construction'),
      ),
    progress: { ready: 0, total: 0 },
    safeRepair: { issueIds: [], changes: [] },
    limitations: [],
  };
}

function checklist(
  overrides: Partial<
    Record<RoofSystemArea['key'], RoofSystemArea['state']>
  > = {},
  hasBaseCovering = true,
): RoofSystemChecklist {
  const keys = [
    'covering',
    'ridge',
    'verge',
    'eave',
    'openings',
    'drainage',
  ] as const;
  const list = keys.map((key) => ({
    key,
    state: overrides[key] ?? (key === 'covering' ? 'ready' : 'not-configured'),
    items: [],
  }));
  return {
    areas: list,
    counts: { ready: 0, attention: 0, optional: 0 },
    hasBaseCovering,
  };
}

const journey = (
  facts: Partial<JourneyFacts> & Pick<JourneyFacts, 'readiness'>,
) => deriveProjectJourney({ checklist: checklist(), ...facts });
const state = (value: ReturnType<typeof journey>, key: string) =>
  value.stages.find((stage) => stage.key === key)?.state;

describe('V53 project journey', () => {
  it('fresh project without covering: choose covering; later stages wait', () => {
    const value = journey({
      readiness: readiness([
        issue('covering-missing', 'covering', 'info', 'choose-covering'),
      ]),
      checklist: checklist({}, false),
      cost: { started: false, missingPrices: 0 },
    });
    expect(value.recommended?.action).toBe('choose-covering');
    expect(value.recommended?.stage).toBe('covering');
    expect(state(value, 'layers')).toBe('waiting');
    expect(
      value.stages.find((stage) => stage.key === 'layers')?.waitingFor,
    ).toBe('covering');
    expect(state(value, 'roof-system')).toBe('waiting');
    expect(state(value, 'cost')).toBe('optional');
  });

  it('a geometry blocker outranks an unresolved window flashing', () => {
    const value = journey({
      readiness: readiness([
        issue('geometry-invalid', 'construction', 'blocker', 'review-geometry'),
        issue(
          'opening-flashing-undecided',
          'materials',
          'info',
          'open-roof-system',
        ),
      ]),
      checklist: checklist({ openings: 'needs-decision' }),
      openingsNeedingFlashing: [{ featureId: 'feature:w1' }],
    });
    expect(value.recommended?.action).toBe('review-geometry');
    expect(state(value, 'geometry')).toBe('fix');
    expect(state(value, 'construction')).toBe('waiting');
  });

  it('covering ready with unresolved battens recommends layers, not cost', () => {
    const value = journey({
      readiness: readiness(
        [issue('battens-off', 'layers', 'warning', 'enable-auto-battens')],
        { layers: 'attention' },
      ),
    });
    expect(value.recommended?.stage).toBe('layers');
    expect(value.recommended?.action).toBe('enable-auto-battens');
    expect(state(value, 'layers')).toBe('decision');
  });

  it('opening without flashing focuses that exact opening', () => {
    const value = journey({
      readiness: readiness([
        issue(
          'opening-flashing-undecided',
          'materials',
          'info',
          'open-roof-system',
        ),
      ]),
      checklist: checklist({ openings: 'needs-decision' }),
      openingsNeedingFlashing: [{ featureId: 'feature:w2' }],
    });
    expect(value.recommended).toMatchObject({
      stage: 'roof-system',
      action: 'open-roof-system',
      focus: { area: 'openings', featureId: 'feature:w2' },
    });
    expect(state(value, 'roof-system')).toBe('decision');
  });

  it('drainage disabled and nothing configured: roof system is optional', () => {
    const value = journey({ readiness: readiness([]) });
    expect(state(value, 'roof-system')).toBe('optional');
  });

  it('enabled incomplete drainage is a roof-system decision with drainage focus', () => {
    const value = journey({
      readiness: readiness([
        issue(
          'drainage-outlets-unconfirmed',
          'materials',
          'warning',
          'open-drainage',
        ),
      ]),
      checklist: checklist({ drainage: 'needs-decision' }),
    });
    expect(value.recommended?.stage).toBe('roof-system');
    expect(value.recommended?.action).toBe('open-drainage');
    expect(state(value, 'materials')).not.toBe('decision');
  });

  it('partial materials without other decisions recommend the material plan', () => {
    const value = journey({
      readiness: readiness([], { materials: 'pending' }),
      materials: { attention: 2, total: 10 },
    });
    expect(value.recommended?.stage).toBe('materials');
    expect(value.recommended?.reasonKey).toBe('materials');
  });

  it('started estimate with missing prices is a cost decision', () => {
    const value = journey({
      readiness: readiness([]),
      cost: { started: true, missingPrices: 3 },
    });
    expect(state(value, 'cost')).toBe('decision');
    expect(value.recommended?.action).toBe('open-cost');
  });

  it('everything ready leads to documents', () => {
    const value = journey({
      readiness: readiness([]),
      checklist: checklist({ ridge: 'ready' }),
      materials: { attention: 0, total: 10 },
      cost: { started: true, missingPrices: 0 },
    });
    expect(state(value, 'documents')).toBe('ready');
    expect(value.recommended?.action).toBe('open-documents');
    expect(value.counts.decisions).toBe(0);
  });
});
