import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import type { CoveringTechnicalSpec } from '@cieslacalc/covering-core';
import {
  resolveRoofSurfaceGeometry,
  resolveRoofTemplate,
  roofTemplateSpanMm,
} from '@cieslacalc/roof-math';
import type { RoofFamily } from '@cieslacalc/timber-model';

type StructureProject = RoofProjectDocumentV1['project'];

export interface TrussEnquiryCovering {
  kind: CoveringTechnicalSpec['kind'];
  manufacturer?: string;
  family?: string;
  material?: 'ceramic' | 'concrete' | 'other';
  weightKgPerPiece?: number;
  /**
   * The tile's stated mass times its stated consumption per m², only when
   * the product states both — a physical figure from the product card, not
   * a design load.
   */
  massKgPerM2?: { min: number; max: number };
}

export interface TrussEnquiryStructure {
  key: string;
  name: string;
  roofType: RoofFamily;
  /** One pitch, or both planes of an asymmetric gable (left, right). */
  pitchesDeg: number[];
  buildingLengthMm: number;
  spanMm: number;
  /** Horizontal eave overhang. */
  eaveOverhangMm: number;
  /** As the roof summary shows it: the ridge height, or a mono-pitch rise. */
  height?: { kind: 'ridge' | 'rise'; valueMm: number };
  /** Sloped area, gross and net of openings; absent if the surface fails. */
  area?: { grossMm2: number; netMm2: number };
  coverings: TrussEnquiryCovering[];
  membrane?: { manufacturer?: string; family?: string };
  battens?: { widthMm: number; heightMm: number };
  counterBattens?: { widthMm: number; heightMm: number };
  openings: { widthMm: number; heightMm: number }[];
}

function coveringOf(
  assignment: StructureProject['coverings'][number],
): TrussEnquiryCovering {
  const spec = assignment.product.technicalSpecSnapshot;
  const display = assignment.product.displaySnapshot;
  const named = {
    kind: spec.kind,
    ...(display?.manufacturer ? { manufacturer: display.manufacturer } : {}),
    ...(display?.familyName ? { family: display.familyName } : {}),
  };
  if (spec.kind !== 'roof-tile') return named;
  const modes = spec.installationModes;
  const mode =
    modes.find((entry) => entry.id === assignment.selectedInstallationModeId) ??
    (modes.length === 1 ? modes[0] : undefined);
  const weight = spec.weightKgPerPiece;
  const units = mode?.declaredUnitsPerM2;
  return {
    ...named,
    ...(spec.material ? { material: spec.material } : {}),
    ...(weight !== undefined ? { weightKgPerPiece: weight } : {}),
    ...(weight !== undefined && units
      ? { massKgPerM2: { min: weight * units.min, max: weight * units.max } }
      : {}),
  };
}

/**
 * VNext-14: what a truss manufacturer asks for before a quote, read from
 * the project as RoofCalc already resolves it — the roof's geometry from
 * the template resolver, the sloped area from the roof surface, the
 * covering and layers from the project. Derived on demand, never stored.
 * RoofCalc designs no truss and checks no load: this is the designer's
 * input, and it says so wherever it is shown.
 */
export function deriveTrussEnquiryStructure(
  key: string,
  name: string,
  project: StructureProject,
): TrussEnquiryStructure {
  const template = project.roof;
  let height: TrussEnquiryStructure['height'];
  try {
    const resolved = resolveRoofTemplate(template);
    height =
      'monoPitch' in resolved
        ? { kind: 'rise', valueMm: resolved.monoPitch.surface.riseMm }
        : { kind: 'ridge', valueMm: resolved.ridgeHeightMm };
  } catch {
    height = undefined;
  }
  const surface = resolveRoofSurfaceGeometry({
    template,
    features: project.features,
  });
  const { battenLayout, counterBattens } = project.buildUp;
  const membrane = project.membraneProduct?.displaySnapshot;
  return {
    key,
    name,
    roofType: template.type,
    pitchesDeg:
      template.type === 'asymmetric-gable'
        ? [template.pitchDeg, template.rightPitchDeg]
        : [template.pitchDeg],
    buildingLengthMm: template.buildingLengthMm,
    spanMm: roofTemplateSpanMm(template),
    eaveOverhangMm: template.eaveOverhangMm,
    ...(height && Number.isFinite(height.valueMm) ? { height } : {}),
    ...(surface.status === 'resolved'
      ? {
          area: {
            grossMm2: surface.grossAreaMm2,
            netMm2: surface.netAreaMm2,
          },
        }
      : {}),
    coverings: project.coverings.map(coveringOf),
    ...(project.membraneProduct
      ? {
          membrane: {
            ...(membrane?.manufacturer
              ? { manufacturer: membrane.manufacturer }
              : {}),
            ...(membrane?.familyName ? { family: membrane.familyName } : {}),
          },
        }
      : {}),
    ...(battenLayout?.enabled
      ? {
          battens: {
            widthMm: battenLayout.battenWidthMm,
            heightMm: battenLayout.battenHeightMm,
          },
        }
      : {}),
    ...(counterBattens?.enabled
      ? {
          counterBattens: {
            widthMm: counterBattens.widthMm,
            heightMm: counterBattens.heightMm,
          },
        }
      : {}),
    openings: project.features
      .filter((feature) => feature.kind === 'roof-window')
      .map((feature) => ({
        widthMm: feature.widthMm,
        heightMm: feature.heightMm,
      })),
  };
}
