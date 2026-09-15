// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import {
  createEmptyCostScenario,
  type CostScenario,
} from '@cieslacalc/cost-core';
import i18n from '../i18n';
import { CostWorkspace } from './CostWorkspace';
import { createK1CuttingRequirement } from './k1-cutting-adapter';
import { createWorkbenchProjectResolver } from './workbench-project';
import type { ExportFacts } from './export-adapter';

beforeEach(async () => {
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

const source = {
  projectId: 'p1',
  projectName: 'Dach testowy',
  projectCreatedAt: '2026-09-01T00:00:00.000Z',
  projectUpdatedAt: '2026-09-14T00:00:00.000Z',
  projectSchemaVersion: 1,
};

const noBuildUpFacts = {
  battens: {
    status: 'disabled' as const,
    mode: 'manual' as const,
    battens: [],
    totalLengthMm: 0,
    planes: [],
    issues: [],
  },
  battenAutoSource: { status: 'missing' as const },
  counterBattens: {
    status: 'disabled' as const,
    rows: [],
    totalVisibleLengthMm: 0,
    warnings: [],
    issues: [],
    resolvedAxisCount: 0,
    visibleSegmentCount: 0,
    roofPlaneIds: [],
  },
};

function facts(overrides: Partial<ExportFacts> = {}): ExportFacts {
  const gable = gableTemplateFromAssembly(assemblyDefaults);
  const resolved = createWorkbenchProjectResolver().resolve(gable);
  const schedule = createRoofMemberSchedule({ skeleton: resolved.skeleton });
  const k1 = createK1CuttingRequirement(resolved.resolved, schedule);
  return {
    source,
    template: gable,
    resolved: resolved.resolved,
    skeleton: resolved.skeleton,
    surface: resolveRoofSurfaceGeometry({ template: gable, features: [] }),
    windows: [],
    schedule,
    details: resolved.detailPreviews,
    k1,
    membraneEnabled: false,
    counterBattensEnabled: false,
    battensEnabled: false,
    ...noBuildUpFacts,
    coverings: [],
    coveringStatuses: [],
    ...overrides,
  } as unknown as ExportFacts;
}

function Harness({ initialFacts }: { initialFacts: ExportFacts }) {
  const [scenario, setScenario] = useState<CostScenario>(() =>
    createEmptyCostScenario('PLN'),
  );
  return (
    <CostWorkspace
      facts={initialFacts}
      scenario={scenario}
      onScenarioChange={setScenario}
      onOpenDocuments={() => {}}
    />
  );
}

describe('CostWorkspace', () => {
  it('adds a battens suggestion as a priceable geometric-estimate line', () => {
    const withBattens = facts({
      battensEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: facts().skeleton,
        buildUp: [
          {
            id: 'batten:1',
            familyKey: 'L',
            memberKind: 'batten',
            lengthMm: 100_000,
            section: { widthMm: 60, depthMm: 40 },
          },
        ],
      }),
    });
    render(<Harness initialFacts={withBattens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(screen.getByText('Łaty')).toBeTruthy();
    expect(screen.getByText('Geometria')).toBeTruthy();
    expect(screen.queryByText('Proponowane z projektu')).toBeNull();
  });

  it('never pre-fills a covering suggestion with the geometric count as quantity', () => {
    const withCovering = facts({
      schedule: createRoofMemberSchedule({
        skeleton: facts().skeleton,
        covering: [
          {
            id: 'covering:1',
            coveringAssignmentId: 'assignment-1',
            sourceRoofPlaneIds: ['roof-plane:left'],
            quantity: 2070,
            requirementReadiness: 'geometric-only',
            layoutKind: 'roof-tile',
            semantic: 'effective-coverage-position',
            unit: 'coverage-position',
            fullPositions: 2000,
            cutPositions: 70,
          },
        ],
      }),
    });
    render(<Harness initialFacts={withCovering} />);
    expect(screen.getByText(/2070 szt\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uzupełnij' }));
    const quantityInput = screen.getByDisplayValue('0') as HTMLInputElement;
    expect(quantityInput.value).toBe('0');
    expect(quantityInput.value).not.toBe('2070');
  });

  it('lets the user configure VAT and shows gross once set', () => {
    const withBattens = facts({
      battensEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: facts().skeleton,
        buildUp: [
          {
            id: 'batten:1',
            familyKey: 'L',
            memberKind: 'batten',
            lengthMm: 10_000,
            section: { widthMm: 60, depthMm: 40 },
          },
        ],
      }),
    });
    render(<Harness initialFacts={withBattens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    const priceInput = screen.getByDisplayValue('') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '10' } });
    fireEvent.blur(priceInput);
    expect(screen.queryByText(/RAZEM BRUTTO/)).toBeNull();
    fireEvent.change(screen.getByLabelText('VAT'), {
      target: { value: '2300' },
    });
    expect(screen.getByText(/RAZEM BRUTTO/)).toBeTruthy();
  });

  it('refreshes the visible quantity input after accepting a project change', () => {
    const battenFacts = (lengthMm: number) =>
      facts({
        battensEnabled: true,
        schedule: createRoofMemberSchedule({
          skeleton: facts().skeleton,
          buildUp: [
            {
              id: 'batten:1',
              familyKey: 'L',
              memberKind: 'batten',
              lengthMm,
              section: { widthMm: 60, depthMm: 40 },
            },
          ],
        }),
      });
    const { rerender } = render(<Harness initialFacts={battenFacts(10_000)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    rerender(<Harness initialFacts={battenFacts(20_000)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aktualizuj' }));
    expect(screen.getByDisplayValue('20')).toBeTruthy();
    expect(screen.queryByDisplayValue('10')).toBeNull();
  });

  it('disables CSV export while no line is included', () => {
    render(<Harness initialFacts={facts()} />);
    const button = screen
      .getByText('Pobierz CSV')
      .closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
