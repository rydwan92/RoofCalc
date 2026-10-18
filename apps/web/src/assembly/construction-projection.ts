import { useMemo } from 'react';
import { withOpeningFramingFabrication } from '@cieslacalc/calculator-core';
import {
  createOpeningFramingDraft,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
  resolveRoofFeatureCollisions,
} from '@cieslacalc/roof-math';
import type {
  RoofBuildUp,
  RoofFeature,
  RoofOpeningFramingSpec,
  RoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { roofConnectionModel } from './connections/census';
import { memberLabelIndex } from './connections/labels';
import { workbenchProjectResolver } from './workbench-project';

/**
 * VNext-3 construction projection: the one place that turns the canonical
 * roof template, its features and the accepted opening framing into what
 * the workbench draws and counts from the structure — the resolved
 * template, the base and composed skeleton, opening framing results, a
 * transient framing proposal, the fabrication package, the connection nodes
 * and member labels. It calls the existing resolvers only (no math here).
 *
 * Each stage is memoised on exactly the canonical inputs it reads, so
 * selection, camera, panel and hover changes keep every object identical
 * and nothing downstream recomputes.
 */
export interface ConstructionInputs {
  template: RoofTemplateSpec;
  features: RoofFeature[];
  openingFraming: RoofOpeningFramingSpec[];
  buildUp: RoofBuildUp;
  /** View-only preview of one opening's framing; never canonical. */
  proposalFeatureId?: string;
}

export function useConstructionProjection({
  template,
  features,
  openingFraming,
  buildUp,
  proposalFeatureId,
}: ConstructionInputs) {
  const project = useMemo(
    () => workbenchProjectResolver.resolve(template),
    [template],
  );
  const {
    resolved: templateResult,
    skeleton: baseSkeleton,
    fabricationPackage: baseFabricationPackage,
  } = project;
  const roofWindows = useMemo(
    () =>
      features.filter(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window',
      ),
    [features],
  );
  const framingProjection = useMemo(
    () =>
      resolveOpeningFramingSet({
        template,
        skeleton: baseSkeleton,
        features: roofWindows,
        framingSpecs: openingFraming,
      }),
    [baseSkeleton, openingFraming, roofWindows, template],
  );
  const openingSummary = useMemo(
    () => ({
      total: roofWindows.length,
      collisions: roofWindows.filter(
        (feature) =>
          resolveRoofFeatureCollisions({
            template,
            skeleton: baseSkeleton,
            feature,
          }).length > 0,
      ).length,
      acceptedFraming: framingProjection.results.filter(
        (result) =>
          result.status === 'resolved' &&
          result.reviewStatus === 'valid' &&
          !!result.framingSpecId,
      ).length,
      needsReview: framingProjection.results.filter(
        (result) => !!result.framingSpecId && result.reviewStatus !== 'valid',
      ).length,
    }),
    [baseSkeleton, framingProjection.results, roofWindows, template],
  );
  const framingProposal = useMemo(() => {
    if (!proposalFeatureId) return undefined;
    const feature = roofWindows.find(
      (candidate) => candidate.id === proposalFeatureId,
    );
    if (!feature) return undefined;
    const existing = openingFraming.find(
      (spec) => spec.featureId === proposalFeatureId,
    );
    return resolveOpeningFraming({
      template,
      skeleton: baseSkeleton,
      feature,
      framingSpec: {
        ...(existing ?? createOpeningFramingDraft(template, proposalFeatureId)),
        acceptedGeometrySignature: '',
      },
    });
  }, [baseSkeleton, openingFraming, proposalFeatureId, roofWindows, template]);
  const proposalMembers = useMemo(
    () =>
      framingProposal?.status === 'resolved'
        ? [
            framingProposal.lowerFramingMember!.member,
            framingProposal.upperFramingMember!.member,
          ]
        : [],
    [framingProposal],
  );
  /** The accepted composition plus a previewed proposal, for the drawing. */
  const skeleton = useMemo(
    () => ({
      ...framingProjection.composedSkeleton,
      members: [
        ...framingProjection.composedSkeleton.members,
        ...proposalMembers.filter(
          (member) =>
            !framingProjection.composedSkeleton.members.some(
              (candidate) => candidate.id === member.id,
            ),
        ),
      ],
    }),
    [framingProjection.composedSkeleton, proposalMembers],
  );
  const fabricationPackage = useMemo(
    () =>
      withOpeningFramingFabrication(
        baseFabricationPackage,
        framingProjection.results,
      ),
    [baseFabricationPackage, framingProjection.results],
  );
  // Where the accepted composition's member axes meet (never the proposal).
  const connectionModel = useMemo(
    () =>
      roofConnectionModel({
        template,
        members: framingProjection.composedSkeleton.members,
        buildUp,
      }),
    [buildUp, framingProjection.composedSkeleton.members, template],
  );
  const memberLabels = useMemo(
    () =>
      memberLabelIndex(
        framingProjection.composedSkeleton.members,
        templateResult.memberPrototypes,
      ),
    [framingProjection.composedSkeleton.members, templateResult],
  );
  return {
    project,
    roofWindows,
    framingProjection,
    openingSummary,
    framingProposal,
    proposalMembers,
    skeleton,
    fabricationPackage,
    connectionModel,
    memberLabels,
  };
}
