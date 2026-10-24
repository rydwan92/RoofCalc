import type { RoofProjectDocumentV2 } from '@cieslacalc/calculator-core';
import {
  resolveRoofFeatureTopology,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import {
  assessRoofScene,
  mergeRoofScenes,
  transformRoofScene,
  type RoofSceneGraph,
} from '@cieslacalc/roof-topology-core';
import { deriveProjectRoofScene } from '../assembly/roof-scene';

/** One structure's roof, placed on the site (world mm, z up). */
export interface SiteStructure {
  id: string;
  scene: RoofSceneGraph;
}

export interface SiteScene {
  structures: SiteStructure[];
  /** Pairs of structures whose roofs share plan area with no junction. */
  overlaps: [string, string][];
}

/**
 * VNext-10D (ADR-017 §5–6): every structure's roof on the site. Each
 * structure is the same scene the workbench checks (ADR-015), placed by its
 * transform with the topology core's own `transformRoofScene`; two roofs
 * that share plan area are reported by the core's assessment
 * (`junction-unresolved`), pair by pair — no second geometry and no ID is
 * parsed to tell which pair.
 */
export function deriveSiteScene(document: RoofProjectDocumentV2): SiteScene {
  const structures = document.structures.map((structure) => {
    const template = structure.project.roof;
    const surface = resolveRoofSurfaceGeometry({
      template,
      features: structure.project.features,
    });
    const { scene } = deriveProjectRoofScene({
      template,
      surface,
      topology: resolveRoofFeatureTopology(surface),
      structureId: structure.id,
      ...(structure.name ? { name: structure.name } : {}),
    });
    return {
      id: structure.id,
      scene: transformRoofScene(scene, {
        translation: structure.transform.translationMm,
        rotationAboutVerticalDeg: structure.transform.rotationAboutVerticalDeg,
      }),
    };
  });
  const overlaps: [string, string][] = [];
  structures.forEach((a, index) =>
    structures.slice(index + 1).forEach((b) => {
      const assessment = assessRoofScene(mergeRoofScenes(a.scene, b.scene));
      if (
        assessment.issues.some((issue) => issue.code === 'junction-unresolved')
      )
        overlaps.push([a.id, b.id]);
    }),
  );
  return { structures, overlaps };
}
