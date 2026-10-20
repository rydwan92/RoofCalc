/**
 * @cieslacalc/roof-topology-core — VNext-6 / ADR-015 roof topology graph.
 *
 * Three layers, never merged:
 *   (a) a recognised plan outline          classifyPlanOutline, outlineSupport
 *   (b) a proposed / derived roof graph    RoofSceneGraph, assessRoofScene,
 *                                          outlineStructureCandidates
 *   (c) the canonical calculation model    RoofProjectDocumentV1 (unchanged,
 *                                          calculator-core), adapted into (b)
 *                                          by roofSceneFromResolvedRoof
 *
 * Pure TypeScript: no solver, no renderer, no React, no network.
 */
export * from './model';
export * from './geometry';
export * from './build';
export * from './assess';
export * from './adapter';
export * from './outline';
