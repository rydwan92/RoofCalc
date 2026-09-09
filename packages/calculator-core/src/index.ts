import type { z } from 'zod';
import {
  calculateCommonRafter,
  commonRafterInputSchema,
  type CommonRafterInput,
  type CommonRafterResult,
} from '@cieslacalc/roof-math';
import type { DrawingModel } from '@cieslacalc/drawing-engine';
import type { FeatureKey } from '@cieslacalc/shared';
import { rafterWorkbench } from './workbench';

export interface CalculatorDefinition<I, O> {
  id: string;
  version: string;
  category: string;
  titleKey: string;
  inputSchema: z.ZodType<I>;
  calculate: (input: I) => O;
  createDrawing: (input: I, output: O) => DrawingModel;
  requiredEntitlement?: FeatureKey;
}

export const commonRafter: CalculatorDefinition<
  CommonRafterInput,
  CommonRafterResult
> = {
  id: 'common-rafter',
  version: '1.0.0',
  category: 'rafters',
  titleKey: 'commonRafter',
  inputSchema: commonRafterInputSchema,
  calculate: calculateCommonRafter,
  requiredEntitlement: 'calculator.common-rafter',
  createDrawing(input, result) {
    const origin = { x: 0, y: 0 };
    const ridge = { x: input.runMm, y: result.riseMm };
    const foot = { x: input.runMm, y: 0 };
    const tail = { x: -input.overhangMm, y: -result.tailDropMm };
    return {
      bounds: { minX: tail.x, minY: tail.y, maxX: ridge.x, maxY: ridge.y },
      lines: [
        { id: 'body', from: origin, to: ridge, role: 'member' },
        { id: 'tail', from: tail, to: origin, role: 'tail' },
        { id: 'run', from: origin, to: foot, role: 'reference' },
        { id: 'rise', from: foot, to: ridge, role: 'reference' },
      ],
      dimensions: [
        {
          id: 'total',
          from: tail,
          to: ridge,
          valueMm: result.totalLengthMm,
          kind: 'aligned',
        },
        {
          id: 'run',
          from: origin,
          to: foot,
          valueMm: input.runMm,
          kind: 'horizontal',
        },
        {
          id: 'rise',
          from: foot,
          to: ridge,
          valueMm: result.riseMm,
          kind: 'vertical',
        },
        ...(input.overhangMm > 0
          ? [
              {
                id: 'overhang',
                from: tail,
                to: origin,
                valueMm: input.overhangMm,
                kind: 'horizontal' as const,
              },
            ]
          : []),
      ],
      angles: [{ id: 'pitch', at: origin, degrees: input.pitchDeg }],
    };
  },
};

export const calculatorRegistry = { 'common-rafter': rafterWorkbench } as const;
export const calculatorVersions = {
  'common-rafter@1.0.0': commonRafter,
  'common-rafter@2.0.0': rafterWorkbench,
} as const;
export * from './workbench';
export interface AccessPolicy {
  canUse(feature: FeatureKey): boolean;
}
export const freeAccessPolicy: AccessPolicy = {
  canUse: (feature) => feature === commonRafter.requiredEntitlement,
};
