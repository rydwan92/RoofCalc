// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import { createProjectStartTemplate } from './project-start';
import { RoofSectionPreview, roofSectionMembers } from './RoofSectionPreview';
import { workbenchProjectResolver } from './workbench-project';

afterEach(cleanup);

const base = gableTemplateFromAssembly(assemblyDefaults);
const roof = (
  values: Partial<Parameters<typeof createProjectStartTemplate>[0]>,
) =>
  createProjectStartTemplate(
    {
      roofType: 'gable',
      buildingLengthMm: 10_000,
      buildingWidthMm: 8_000,
      pitchDeg: 35,
      eaveOverhangMm: 500,
      rafterSpacingMm: 900,
      ...values,
    },
    base,
  );
const kindsOf = (template: ReturnType<typeof roof>) =>
  roofSectionMembers(workbenchProjectResolver.resolve(template).skeleton)
    .map((member) => member.kind)
    .sort();

/** VNext-12: the Creator's cross-section is the resolved skeleton, cut once. */
describe('the roof cross-section', () => {
  it('cuts a gable through one rafter pair, its ridge board and both plates', () => {
    expect(kindsOf(roof({}))).toEqual([
      'rafter',
      'rafter',
      'ridge',
      'wall-plate',
      'wall-plate',
    ]);
  });

  it('shows the collar tie of a rafter and collar-tie roof', () => {
    expect(kindsOf(roof({ structureSystem: 'rafter-collar-tie' }))).toContain(
      'collar-tie',
    );
  });

  it('cuts a mono-pitch roof through one rafter and its two plates', () => {
    expect(kindsOf(roof({ roofType: 'mono-pitch', pitchDeg: 15 }))).toEqual([
      'rafter',
      'wall-plate',
      'wall-plate',
    ]);
  });

  it('cuts one station only: every rafter it shows stands at the same place', () => {
    const members = roofSectionMembers(
      workbenchProjectResolver.resolve(roof({ roofType: 'hip' })).skeleton,
    ).filter(
      (member) => member.kind !== 'wall-plate' && member.kind !== 'ridge',
    );
    expect(members.length).toBeGreaterThan(0);
    expect(new Set(members.map((member) => member.from.y)).size).toBe(1);
  });

  it('labels each plane with its own pitch and the building width', () => {
    render(
      <RoofSectionPreview
        template={roof({
          roofType: 'asymmetric-gable',
          pitchDeg: 40,
          rightPitchDeg: 25,
        })}
        label="Przekrój"
        invalidLabel="—"
        widthLabel="800 cm"
      />,
    );
    const texts = [
      ...screen.getByTestId('project-start-section').querySelectorAll('text'),
    ].map((text) => text.textContent);
    expect(texts).toEqual(['40°', '25°', '800 cm']);
  });

  it('says what is missing instead of drawing nothing', () => {
    render(
      <RoofSectionPreview
        label="Przekrój"
        invalidLabel="Uzupełnij wymiary"
        widthLabel="—"
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Uzupełnij wymiary');
  });
});
