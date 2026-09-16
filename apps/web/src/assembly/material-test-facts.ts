import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import { createWorkbenchProjectResolver } from './workbench-project';
import { createK1CuttingRequirement } from './k1-cutting-adapter';
import type { ExportFacts } from './export-adapter';

/** Shared test fixture: a default gable with no layers enabled. */
export function materialTestFacts(): ExportFacts {
  const template = gableTemplateFromAssembly(assemblyDefaults);
  const project = createWorkbenchProjectResolver().resolve(template);
  const schedule = createRoofMemberSchedule({ skeleton: project.skeleton });
  return {
    source: {
      projectId: 'test',
      projectName: 'Test',
      projectCreatedAt: '2026-01-01T00:00:00.000Z',
      projectUpdatedAt: '2026-01-01T00:00:00.000Z',
      projectSchemaVersion: 1,
    },
    template,
    resolved: project.resolved,
    skeleton: project.skeleton,
    surface: resolveRoofSurfaceGeometry({ template, features: [] }),
    windows: [],
    schedule,
    details: [],
    k1: createK1CuttingRequirement(project.resolved, schedule),
    membraneEnabled: false,
    counterBattensEnabled: false,
    battensEnabled: false,
    battens: {
      status: 'disabled',
      mode: 'manual',
      battens: [],
      totalLengthMm: 0,
      planes: [],
      issues: [],
    },
    battenAutoSource: { status: 'missing' },
    counterBattens: {
      status: 'disabled',
      rows: [],
      totalVisibleLengthMm: 0,
      warnings: [],
      issues: [],
      resolvedAxisCount: 0,
      interiorAxisCount: 0,
      hipBoundaryRunCount: 0,
      hipBoundaries: [],
      unresolvedHipBoundaryCount: 0,
      visibleSegmentCount: 0,
      roofPlaneIds: [],
    },
    coverings: [],
    coveringStatuses: [],
  };
}
