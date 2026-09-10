import { calculateHipRafter, hipRafterSpecSchema } from '@cieslacalc/roof-math';
import type {
  HipRafterSpec,
  ResolvedHipRafter,
} from '@cieslacalc/timber-model';
import type { CalculatorDefinition } from './index';

/** Versioned H1 module; the workbench and Quick view consume the same calculation. */
export const hipRafter: CalculatorDefinition<HipRafterSpec, ResolvedHipRafter> =
  {
    id: 'hip-rafter',
    version: '1.0.0',
    category: 'rafters',
    titleKey: 'hipRafter',
    inputSchema: hipRafterSpecSchema,
    calculate: calculateHipRafter,
    requiredEntitlement: 'calculator.hip-rafter',
    createDrawing(input, output) {
      const origin = { x: 0, y: 0 };
      const ridge = { x: input.commonRunMm, y: input.commonRunMm };
      const ridgeFaceRatio =
        output.result.ridgePlanDeductionMm /
        Math.max(output.result.planRunMm, 1);
      const ridgeFace = {
        x: ridge.x * (1 - ridgeFaceRatio),
        y: ridge.y * (1 - ridgeFaceRatio),
      };
      return {
        bounds: {
          minX: -input.overhangMm,
          minY: -input.overhangMm,
          maxX: input.commonRunMm,
          maxY: input.commonRunMm,
        },
        lines: [
          { id: 'hip-axis', from: origin, to: ridge, role: 'member' },
          {
            id: 'ridge-face',
            from: { x: ridgeFace.x - input.section.widthMm, y: ridgeFace.y },
            to: { x: ridgeFace.x, y: ridgeFace.y - input.section.widthMm },
            role: 'cut',
          },
        ],
        dimensions: [
          {
            id: 'hip-plan-run',
            from: origin,
            to: ridge,
            valueMm: output.result.planRunMm,
            kind: 'aligned',
          },
        ],
        angles: [{ id: 'plan-angle', at: origin, degrees: 45 }],
      };
    },
  };
