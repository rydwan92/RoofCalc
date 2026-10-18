// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import {
  createRoofSkeleton,
  resolveOpeningFramingSet,
} from '@cieslacalc/roof-math';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { roofConnectionModel } from './connections/census';
import {
  useConstructionProjection,
  type ConstructionInputs,
} from './construction-projection';

/**
 * VNext-3 P2: the construction projection moved out of Page unchanged —
 * same resolvers, same results — and each stage recomputes only when the
 * canonical inputs it reads change.
 */

function project(name: string): RoofProjectDocumentV1['project'] {
  return (
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../fixtures/projects', name),
        'utf8',
      ),
    ) as { document: RoofProjectDocumentV1 }
  ).document.project;
}

function inputs(name: string): ConstructionInputs {
  const p = project(name);
  return {
    template: p.roof,
    features: p.features,
    openingFraming: p.openingFraming,
    buildUp: p.buildUp,
  };
}

describe('construction projection', () => {
  it('returns what the resolvers return, composed exactly as before', () => {
    const input = inputs('04-hip-opening-framing.cieslacalc.json');
    const { result } = renderHook(() => useConstructionProjection(input));
    const base = createRoofSkeleton(input.template);
    const framing = resolveOpeningFramingSet({
      template: input.template,
      skeleton: base,
      features: input.features.filter(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window',
      ),
      framingSpecs: input.openingFraming,
    });
    expect(result.current.framingProjection.composedSkeleton).toEqual(
      framing.composedSkeleton,
    );
    expect(result.current.connectionModel).toEqual(
      roofConnectionModel({
        template: input.template,
        members: framing.composedSkeleton.members,
        buildUp: input.buildUp,
      }),
    );
    expect(result.current.openingSummary).toMatchObject({
      total: 1,
      acceptedFraming: 1,
    });
  });

  it('keeps every object identical while its canonical inputs are', () => {
    const input = inputs('01-basic-gable.cieslacalc.json');
    const { result, rerender } = renderHook(
      (props: ConstructionInputs) => useConstructionProjection(props),
      { initialProps: input },
    );
    const first = result.current;
    // A new render with the same canonical data (as after a selection change).
    rerender({ ...input });
    expect(result.current.skeleton).toBe(first.skeleton);
    expect(result.current.framingProjection).toBe(first.framingProjection);
    expect(result.current.connectionModel).toBe(first.connectionModel);
    expect(result.current.memberLabels).toBe(first.memberLabels);
    expect(result.current.fabricationPackage).toBe(first.fabricationPackage);
  });

  it('a build-up change recounts nodes without re-solving the skeleton', () => {
    const input = inputs('01-basic-gable.cieslacalc.json');
    const { result, rerender } = renderHook(
      (props: ConstructionInputs) => useConstructionProjection(props),
      { initialProps: input },
    );
    const first = result.current;
    rerender({
      ...input,
      buildUp: { ...input.buildUp, counterBattens: undefined },
    });
    expect(result.current.framingProjection).toBe(first.framingProjection);
    expect(result.current.skeleton).toBe(first.skeleton);
    expect(result.current.connectionModel).not.toBe(first.connectionModel);
  });

  it('a framing proposal is drawn but never counted or fabricated', () => {
    const input = inputs('03-gable-three-roof-windows.cieslacalc.json');
    const windowId = input.features.find(
      (feature) => feature.kind === 'roof-window',
    )!.id;
    // One unchanged (stable) framing list, as the store provides it.
    const noFraming: ConstructionInputs['openingFraming'] = [];
    const { result, rerender } = renderHook(
      (props: ConstructionInputs) => useConstructionProjection(props),
      { initialProps: { ...input, openingFraming: noFraming } },
    );
    const first = result.current;
    rerender({
      ...input,
      openingFraming: noFraming,
      proposalFeatureId: windowId,
    });
    expect(result.current.framingProposal?.status).toBe('resolved');
    expect(result.current.skeleton.members.length).toBeGreaterThan(
      first.skeleton.members.length,
    );
    expect(result.current.connectionModel).toBe(first.connectionModel);
    expect(result.current.fabricationPackage).toBe(first.fabricationPackage);
  });
});
