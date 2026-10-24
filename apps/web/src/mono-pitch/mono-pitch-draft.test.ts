import { describe, expect, it } from 'vitest';
import {
  createRoofProjectDocument,
  resolveMonoPitchRoofSystem,
} from '@cieslacalc/calculator-core';
import { resolveRoofTemplate } from '@cieslacalc/roof-math';
import { MemoryStorage } from '../projects/memory-storage';
import {
  defaultMonoPitchDraft,
  loadMonoPitchDraft,
  monoPitchDraftIssues,
  monoPitchProjectFromDraft,
  monoPitchSystemInput,
  resolveDraftPitch,
  saveMonoPitchDraft,
  type MonoPitchDraft,
} from './mono-pitch-draft';

describe('mono-pitch workspace draft', () => {
  it('maps the example to the F1 reference roof (docs/domain/MONO_PITCH_ROOF.md §8)', () => {
    const system = resolveMonoPitchRoofSystem(
      monoPitchSystemInput(defaultMonoPitchDraft),
    );
    expect(system.framing.calculation.plan.minimumStockLengthMm).toBeCloseTo(
      5022.915504,
      5,
    );
    expect(system.framing.plates.differenceMm).toBeCloseTo(1034.283883, 5);
    expect(system.framing.rafterSpacing.stationCount).toBe(8);
    expect(system.battens?.status).toBe('resolved');
    expect(system.counterBattens?.status).toBe('resolved');
    expect(system.membrane?.courseCount).toBe(4);
  });

  it('against a wall: a ledger, and the roof ends at the wall face', () => {
    const input = monoPitchSystemInput({
      ...defaultMonoPitchDraft,
      topEdge: 'abutment',
      highOverhangMm: 300,
    });
    expect(input.framing.highSupport.kind).toBe('ledger');
    expect(input.framing.roof.highOverhangMm).toBe(0);
    expect(resolveMonoPitchRoofSystem(input).framing.topEndXmm).toBe(4000);
  });

  it('leaves out the layers that are switched off', () => {
    const input = monoPitchSystemInput({
      ...defaultMonoPitchDraft,
      battensEnabled: false,
      counterBattensEnabled: false,
      membraneEnabled: false,
    });
    expect(input.battens).toBeUndefined();
    expect(input.counterBattens).toBeUndefined();
    expect(input.membrane).toBeUndefined();
  });

  it('names the field that blocks the calculation and why', () => {
    expect(monoPitchDraftIssues(defaultMonoPitchDraft)).toEqual({});
    expect(
      monoPitchDraftIssues({ ...defaultMonoPitchDraft, lowSeatMm: 200 }),
    ).toEqual({ lowSeatMm: 'seat_exceeds_support' });
    expect(
      monoPitchDraftIssues({ ...defaultMonoPitchDraft, pitchDeg: 85 }),
    ).toEqual({ pitchDeg: 'out-of-range' });
    expect(
      monoPitchDraftIssues({ ...defaultMonoPitchDraft, runMm: 250 }),
    ).toEqual({ highSupportWidthMm: 'supports_overlap' });
  });

  it('remembers the draft in this browser and survives damaged storage', () => {
    const storage = new MemoryStorage();
    saveMonoPitchDraft({ ...defaultMonoPitchDraft, pitchDeg: 22 }, storage);
    expect(loadMonoPitchDraft(storage).pitchDeg).toBe(22);
    storage.setItem('cieslacalc.monoPitchDraft.v1', '{"schemaVersion":1}');
    expect(loadMonoPitchDraft(storage)).toEqual(defaultMonoPitchDraft);
    storage.setItem('cieslacalc.monoPitchDraft.v1', 'not json');
    expect(loadMonoPitchDraft(storage)).toEqual(defaultMonoPitchDraft);
    expect(loadMonoPitchDraft(undefined)).toEqual(defaultMonoPitchDraft);
    expect(() =>
      saveMonoPitchDraft(defaultMonoPitchDraft, {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      }),
    ).not.toThrow();
  });
});

describe('pitch from the plate tops (VNext-7C)', () => {
  const tops: MonoPitchDraft = {
    ...defaultMonoPitchDraft,
    pitchSource: 'plate-tops',
  };

  it('is the exact inverse of the plate difference the framing reports', () => {
    const { framing } = resolveMonoPitchRoofSystem(
      monoPitchSystemInput(defaultMonoPitchDraft),
    );
    const draft = {
      ...tops,
      highPlateTopMm: tops.lowPlateTopMm + framing.plates.differenceMm,
    };
    expect(resolveDraftPitch(draft)).toEqual({
      pitchDeg: expect.closeTo(15, 9),
    });
    expect(monoPitchSystemInput(draft).framing.roof.pitchDeg).toBeCloseTo(
      15,
      9,
    );
  });

  it('the example measured on site: 1034 mm up over 3860 mm', () => {
    // run − high support width + high seat − low seat = 4000 − 140 + 100 − 100
    expect(resolveDraftPitch(tops)).toEqual({
      pitchDeg: expect.closeTo((Math.atan(1034 / 3860) * 180) / Math.PI, 9),
    });
    // The typed angle is ignored while the tops decide.
    expect(
      monoPitchSystemInput({ ...tops, pitchDeg: 40 }).framing.roof.pitchDeg,
    ).toBeCloseTo(14.996, 3);
  });

  it('names the high top when it is not higher or gives a pitch outside 1–80°', () => {
    expect(monoPitchDraftIssues({ ...tops, highPlateTopMm: 2600 })).toEqual({
      highPlateTopMm: 'not_rising',
    });
    expect(monoPitchDraftIssues({ ...tops, highPlateTopMm: 2650 })).toEqual({
      highPlateTopMm: 'pitch_out_of_range',
    });
    expect(monoPitchDraftIssues(tops)).toEqual({});
  });

  it('opens a draft saved before VNext-7C with the new fields at their defaults', () => {
    const storage = new MemoryStorage();
    const old: Partial<MonoPitchDraft> = {
      ...defaultMonoPitchDraft,
      pitchDeg: 20,
    };
    delete old.pitchSource;
    delete old.lowPlateTopMm;
    delete old.highPlateTopMm;
    storage.setItem(
      'cieslacalc.monoPitchDraft.v1',
      JSON.stringify({ schemaVersion: 1, draft: old }),
    );
    expect(loadMonoPitchDraft(storage)).toEqual({
      ...defaultMonoPitchDraft,
      pitchDeg: 20,
    });
  });
});

describe('the calculation as a project (VNext-8, ADR-016)', () => {
  it('gives the project the same roof the workspace computed, layers included', () => {
    const { template, buildUp } = monoPitchProjectFromDraft(
      defaultMonoPitchDraft,
    );
    expect(template.type).toBe('mono-pitch');
    const document = createRoofProjectDocument(template, { buildUp });
    expect(document.project.roof).toEqual(template);
    expect(resolveRoofTemplate(template).calculation).toEqual(
      resolveMonoPitchRoofSystem(monoPitchSystemInput(defaultMonoPitchDraft))
        .framing.calculation,
    );
    expect(buildUp).toEqual({
      battenLayout: {
        enabled: true,
        mode: 'manual',
        gaugeMm: 340,
        eaveOffsetMm: 50,
        battenWidthMm: 60,
        battenHeightMm: 40,
      },
      counterBattens: { enabled: true, widthMm: 50, heightMm: 25 },
      membrane: { enabled: true },
    });
  });

  it('leaves out switched-off layers and keeps an abutment', () => {
    const { template, buildUp } = monoPitchProjectFromDraft({
      ...defaultMonoPitchDraft,
      topEdge: 'abutment',
      battensEnabled: false,
      counterBattensEnabled: false,
      membraneEnabled: false,
    });
    expect(buildUp).toEqual({});
    expect(template).toMatchObject({
      topEdge: 'abutment',
      highOverhangMm: 0,
      highSupport: { kind: 'ledger' },
    });
  });
});
