// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resolveBattenLayout, roofPlaneIds } from '@cieslacalc/roof-math';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import i18n from '../i18n';
import { useAssembly } from './store';
import { resolveBattenAutoComposition } from './batten-composition';
import { evaluateBattenInstallation } from './batten-installation';
import {
  BattenAutoRepair,
  BattenInstallationDetails,
} from './BattenInstallation';

beforeEach(async () => {
  localStorage.clear();
  useAssembly.getState().reset();
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);
function setup(minPitchDeg: number | undefined = 19) {
  const state = useAssembly.getState();
  const layout = {
    enabled: true,
    mode: 'manual' as const,
    gaugeMm: 390,
    battenWidthMm: 60,
    battenHeightMm: 40,
    eaveOffsetMm: 250,
    ridgeOffsetMm: 40,
  };
  const assignment: CoveringAssignmentSpec = {
    id: 'tile',
    roofPlaneIds: roofPlaneIds(state.template),
    product: {
      technicalSpecSnapshot: {
        schemaVersion: 1,
        kind: 'roof-tile',
        installationModes: [
          {
            id: 'standard',
            coverWidthMm: 300,
            gaugeRangeMm: { min: 330, max: 360 },
            minPitchDeg,
          },
        ],
      },
    },
  };
  state.setCoveringAssignments([assignment]);
  state.setBattenLayout(layout);
  const composition = resolveBattenAutoComposition({
    layout,
    assignments: [assignment],
    ownership: resolvePrimaryCoveringAssignments([assignment]),
    roofPlaneIds: roofPlaneIds(state.template),
    roofPitchDeg: state.template.pitchDeg,
  });
  const result = resolveBattenLayout({
    template: state.template,
    layout,
    autoSource: composition.source,
  });
  return {
    layout,
    composition,
    result,
    decision: evaluateBattenInstallation({ layout, result, composition }),
  };
}

describe('installation ownership and safe repair UI', () => {
  it('shows a repair preview before one history action and preserves exact unrelated values', () => {
    const facts = setup();
    render(
      <>
        <BattenInstallationDetails {...facts} />
        <BattenAutoRepair layout={facts.layout} />
      </>,
    );
    const before = useAssembly.getState().historyPast.length;
    expect(screen.getByTestId('batten-layout-status').textContent).toBe(
      'Niezgodne',
    );
    expect(screen.getByTestId('batten-repair-preview').textContent).toContain(
      '→',
    );
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout,
    ).toEqual(facts.layout);
    fireEvent.click(screen.getByText('Co można policzyć automatycznie?'));
    expect(useAssembly.getState().historyPast.length).toBe(before);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dopasuj łaty automatycznie' }),
    );
    expect(useAssembly.getState().historyPast.length).toBe(before + 1);
    expect(
      useAssembly.getState().projectDocument.project.buildUp.battenLayout,
    ).toEqual({ ...facts.layout, mode: 'auto-from-covering' });
  });

  it('does not offer gauge repair for a separate hard minimum-pitch incompatibility', () => {
    const facts = setup(80);
    render(
      <>
        <BattenInstallationDetails {...facts} />
        <BattenAutoRepair layout={facts.layout} />
      </>,
    );
    expect(screen.getByTestId('batten-decision-issues').textContent).toContain(
      'Kąt dachu jest poniżej minimum',
    );
    expect(screen.queryByTestId('batten-repair-preview')).toBeNull();
  });

  it('does not claim readiness or complete repair without product pitch data', () => {
    const facts = setup();
    const assignment =
      useAssembly.getState().projectDocument.project.coverings[0]!;
    if (assignment.product.technicalSpecSnapshot.kind !== 'roof-tile')
      throw new Error('tile');
    const updated = structuredClone(assignment);
    if (updated.product.technicalSpecSnapshot.kind !== 'roof-tile')
      throw new Error('tile');
    delete updated.product.technicalSpecSnapshot.installationModes[0]!
      .minPitchDeg;
    useAssembly.getState().setCoveringAssignments([updated]);
    render(<BattenAutoRepair layout={facts.layout} />);
    expect(screen.queryByTestId('batten-repair-preview')).toBeNull();
  });
});
