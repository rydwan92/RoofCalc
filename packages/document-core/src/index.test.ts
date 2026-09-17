import { describe, expect, it } from 'vitest';
import {
  buildExecutionDocument,
  defaultSectionSelection,
  type SectionCandidate,
} from './index';

const source = {
  projectId: 'project-1',
  projectName: 'Dach A',
  projectCreatedAt: '2026-09-01T10:00:00.000Z',
  projectUpdatedAt: '2026-09-14T10:00:00.000Z',
  projectSchemaVersion: 1,
};
const candidates: SectionCandidate[] = [
  {
    kind: 'assumptions',
    readiness: 'available',
    section: {
      kind: 'assumptions',
      scope: [],
      limitations: [],
      notModelled: [{ code: 'structural-check' }],
    },
  },
  { kind: 'cutting-plan', readiness: 'unavailable', reason: 'plan-k1-first' },
  {
    kind: 'project-summary',
    readiness: 'available',
    section: {
      kind: 'project-summary',
      roofType: 'gable',
      structuralSystem: 'rafter',
      buildingLengthMm: 10000,
      halfRunMm: 4000,
      pitchDeg: 35,
      openingCount: 0,
      timberFamilies: [],
      enabledLayerCount: 0,
      coveringCount: 0,
      resolvedCoveringCount: 0,
    },
  },
];

describe('execution document contract', () => {
  it('orders typed sections and excludes unavailable evidence', () => {
    expect(defaultSectionSelection(candidates)).toEqual([
      'project-summary',
      'assumptions',
    ]);
    const result = buildExecutionDocument({
      source,
      candidates,
      selected: ['assumptions', 'cutting-plan', 'project-summary'],
      generatedAt: '2026-09-14T11:00:00.000Z',
    });
    expect(result.version).toBe(1);
    expect(result.sections.map((section) => section.kind)).toEqual([
      'project-summary',
      'assumptions',
    ]);
    expect(result.source).toEqual(source);
    expect(result.warnings).toEqual([]);
  });

  it('is deterministic except for the supplied generation time', () => {
    const input = {
      source,
      candidates,
      selected: ['assumptions', 'project-summary'] as const,
      generatedAt: '2026-09-14T11:00:00.000Z',
    };
    expect(buildExecutionDocument(input)).toEqual(
      buildExecutionDocument(input),
    );
    const later = buildExecutionDocument({
      ...input,
      generatedAt: '2026-09-14T12:00:00.000Z',
    });
    expect(later).toEqual({
      ...buildExecutionDocument(input),
      generatedAt: later.generatedAt,
    });
  });
});

it('V47 carries document readiness into the built document', () => {
  const status = {
    state: 'warning' as const,
    issues: [
      {
        severity: 'warning' as const,
        code: 'hip-detail-required',
        params: { count: 4 },
      },
    ],
  };
  const document = buildExecutionDocument({
    source: {
      projectId: 'p',
      projectName: 'P',
      projectCreatedAt: '2026-01-01T00:00:00.000Z',
      projectUpdatedAt: '2026-01-01T00:00:00.000Z',
      projectSchemaVersion: 1,
    },
    candidates: [],
    selected: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
    status,
  });
  expect(document.status).toEqual(status);
});
