import { describe, expect, it } from 'vitest';
import { resolveMonoPitchRoofSystem } from '@cieslacalc/calculator-core';
import { MemoryStorage } from '../projects/memory-storage';
import {
  defaultMonoPitchDraft,
  loadMonoPitchDraft,
  monoPitchDraftIssues,
  monoPitchSystemInput,
  saveMonoPitchDraft,
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
