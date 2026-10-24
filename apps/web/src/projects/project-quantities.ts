import type { RoofProjectDocumentV2 } from '@cieslacalc/calculator-core';
import {
  summarizeProjectTimber,
  type ProjectTimberSummary,
} from '@cieslacalc/quantity-core';
import { resolveRoofSurfaceGeometry } from '@cieslacalc/roof-math';
import { structuralTimberSchedule } from '../assembly/member-schedule';

/** Sloped roof area: gross, and net of openings. */
export interface RoofArea {
  grossMm2: number;
  netMm2: number;
}

export interface StructureQuantities {
  id: string;
  /** Absent when the roof surface does not resolve. */
  area?: RoofArea;
  timber: {
    quantity: number;
    totalLengthMm: number;
    /** Of the members with an exact section; absent when none has one. */
    volumeMm3?: number;
    /** Members left out of the volume: no exact section. */
    volumeExcludedQuantity: number;
  };
}

export interface ProjectQuantities {
  structures: StructureQuantities[];
  timber: ProjectTimberSummary;
  /** Absent when any structure's roof surface does not resolve. */
  area?: RoofArea;
}

/**
 * VNext-10E (ADR-017 §7): the quantities of a project of structures — each
 * structure's structural timber and roof area from the workbench's own
 * derivations, and the project's timber added by exact section in
 * `quantity-core`. Derived on demand, never stored; geometric evidence, not
 * a purchase quantity.
 */
export function deriveProjectQuantities(
  document: RoofProjectDocumentV2,
): ProjectQuantities {
  const parts = document.structures.map((structure) => {
    const schedule = structuralTimberSchedule(structure.project);
    const surface = resolveRoofSurfaceGeometry({
      template: structure.project.roof,
      features: structure.project.features,
    });
    const summary = schedule.timberSummary;
    const quantities: StructureQuantities = {
      id: structure.id,
      ...(surface.status === 'resolved'
        ? {
            area: {
              grossMm2: surface.grossAreaMm2,
              netMm2: surface.netAreaMm2,
            },
          }
        : {}),
      timber: {
        quantity: summary.quantity,
        totalLengthMm: summary.totalLengthMm,
        ...(summary.totalVolumeMm3 !== undefined
          ? { volumeMm3: summary.totalVolumeMm3 }
          : {}),
        volumeExcludedQuantity: summary.excludedVolumeQuantity,
      },
    };
    return { quantities, schedule };
  });
  const structures = parts.map((part) => part.quantities);
  const areas = structures.map((structure) => structure.area);
  return {
    structures,
    timber: summarizeProjectTimber(
      parts.map((part) => ({
        key: part.quantities.id,
        schedule: part.schedule,
      })),
    ),
    ...(areas.every((area): area is RoofArea => area !== undefined)
      ? {
          area: {
            grossMm2: areas.reduce((sum, area) => sum + area.grossMm2, 0),
            netMm2: areas.reduce((sum, area) => sum + area.netMm2, 0),
          },
        }
      : {}),
  };
}
