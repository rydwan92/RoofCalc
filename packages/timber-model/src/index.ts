/** All points and stations are millimetres. No renderer or application dependencies. */
export interface Point2D {
  x: number;
  y: number;
}
export interface Frame2D {
  origin: Point2D;
  angleDeg: number;
}
export interface TimberSection {
  widthMm: number;
  depthMm: number;
}
export type MemberEdge = 'top' | 'bottom';
export type DatumId = string;
export interface DatumPoint {
  id: DatumId;
  edge: MemberEdge;
  point: Point2D;
  meaning: 'eave-end' | 'heel-plumb' | 'seat-toe-reference' | 'ridge-end';
}
export interface TimberMember2D {
  id: string;
  section: TimberSection;
  frame: Frame2D;
  referenceLengthMm: number;
  minimumStockLengthMm: number;
  stockProfile: Point2D[];
  profile: Point2D[];
  datums: DatumPoint[];
}
export interface Support2D {
  id: string;
  kind: 'wall-plate' | 'ridge' | 'purlin';
  worldProfile: Point2D[];
  topReference: [Point2D, Point2D];
  visualExtentOnly: boolean;
}
export interface EndCut {
  kind: 'end-cut';
  id: string;
  supportId?: string;
  end: 'eave' | 'ridge';
  edge: MemberEdge;
  line: [Point2D, Point2D];
  angleToMemberDeg: number;
  stationFromAmm: number;
}
export interface SeatNotch {
  kind: 'seat-notch';
  id: string;
  supportId: string;
  edge: 'bottom';
  removedProfile: Point2D[];
  seatLine: [Point2D, Point2D];
  plumbLine: [Point2D, Point2D];
  seatLengthMm: number;
  normalDepthMm: number;
  remainingDepthMm: number;
  removedDepthRatio: number;
  seatAngleToMemberDeg: number;
  plumbAngleToMemberDeg: number;
}
export type FabricationOperation = EndCut | SeatNotch;
export interface MarkingStation {
  id: string;
  from: DatumId;
  to: DatumId;
  edge: MemberEdge;
  distanceMm: number;
}
export interface FabricationInstruction {
  id: string;
  operationId: string;
  action: 'mark-plumb' | 'mark-seat';
  from: DatumId;
  target: DatumId;
  edge: MemberEdge;
  stationMm: number;
  angleDeg: number;
  seatLengthMm?: number;
}

export type EntityId = string;
export interface Datum {
  id: DatumId;
  entityId: EntityId;
  edge: MemberEdge;
  localPoint: Point2D;
  semanticRole: 'member-start' | 'member-end' | 'support-heel' | 'support-toe';
}
export type JointPreference =
  | { kind: 'seat-notch'; control: 'seat'; valueMm: number }
  | { kind: 'seat-notch'; control: 'depth'; valueMm: number };
export interface SupportSpec {
  id: EntityId;
  kind: 'wall-plate' | 'purlin';
  section: { widthMm: number; heightMm: number };
  placement: { mode: 'horizontal-from-wall'; xMm: number };
  joint: JointPreference;
}
/** Editable intent only. All positions and lengths are canonical millimetres. */
export interface AssemblySpec {
  roof: { runMm: number; pitchDeg: number; overhangMm: number };
  member: { id: EntityId; section: TimberSection };
  supports: SupportSpec[];
  ridge: { id: EntityId; thicknessMm: number; depthMm?: number };
}
export type RafterSpacingMode =
  'max-even-spacing' | 'target-even-spacing' | 'fixed-module';
export type EndStationPolicy = 'require-both-ends' | 'allow-open-end';
export type RafterSpacingSpec =
  | {
      mode: 'max-even-spacing' | 'target-even-spacing';
      spacingMm: number;
    }
  | {
      mode: 'fixed-module';
      spacingMm: number;
      endPolicy: EndStationPolicy;
    };
/** Editable intent for a symmetric gable roof. The cross section resolves through AssemblySpec. */
export interface GableRoofTemplateSpec {
  id: EntityId;
  type: 'gable';
  buildingLengthMm: number;
  halfRunMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacing: RafterSpacingSpec;
  rafterSection: TimberSection;
  wallPlate: SupportSpec;
  ridge: AssemblySpec['ridge'];
  intermediateSupports: SupportSpec[];
}
/** Editable intent for the V6 regular rectangular equal-pitch hip roof. */
export interface HipRoofTemplateSpec {
  id: EntityId;
  type: 'hip';
  buildingLengthMm: number;
  halfRunMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacing: RafterSpacingSpec;
  /** Shared common-rafter K1 section. */
  rafterSection: TimberSection;
  /** Shared diagonal hip-rafter H1 section. */
  hipRafterSection: TimberSection;
  wallPlate: SupportSpec;
  ridge: AssemblySpec['ridge'];
  intermediateSupports: SupportSpec[];
}
export type RoofTemplateSpec = GableRoofTemplateSpec | HipRoofTemplateSpec;

export interface HipRafterSpec {
  id: EntityId;
  section: TimberSection;
  commonRunMm: number;
  pitchDeg: number;
  overhangMm: number;
  ridgeThicknessMm: number;
}
export interface HipRafterResult {
  commonRiseMm: number;
  planRunMm: number;
  tailPlanRunMm: number;
  theoreticalLineLengthMm: number;
  tailLineLengthMm: number;
  totalTheoreticalLineLengthMm: number;
  ridgePlanDeductionMm: number;
  ridgeAxisDeductionMm: number;
  lineLengthToRidgeFaceMm: number;
  outerEaveToRidgeFaceMm: number;
  hipSlopeDeg: number;
  plumbToMemberDeg: number;
  seatToMemberDeg: number;
  cheekAngleDeg: number;
  backingAngleDeg: number;
}
export interface CompoundEndCut {
  kind: 'compound-end-cut';
  id: EntityId;
  memberId: EntityId;
  end: 'ridge' | 'tail';
  plumbToMemberDeg: number;
  cheekAngleDeg: number;
  doubleCheek: boolean;
  referenceStationMm: number;
  reference: 'outer-eave-to-ridge-face';
  ridgePlanDeductionMm: number;
  ridgeAxisDeductionMm: number;
}
export interface HipBackingDetail {
  kind: 'hip-backing';
  id: EntityId;
  memberId: EntityId;
  angleDeg: number;
  reference: 'top-arris-to-roof-plane';
  fabricationChoice: 'back-or-drop-not-decided';
}
export interface HipFabricationPlan {
  memberId: EntityId;
  section: TimberSection;
  referenceDatum: 'outer-eave';
  theoreticalRidgeCenterStationMm: number;
  ridgeFaceStationMm: number;
  ridgeCut: CompoundEndCut;
  backing: HipBackingDetail;
}
export interface ResolvedHipRafter {
  spec: HipRafterSpec;
  result: HipRafterResult;
  fabrication: HipFabricationPlan;
}
export type JackRafterRoofPlane = 'left' | 'right' | 'front' | 'rear';
export type HipCorner =
  'front-left' | 'front-right' | 'rear-left' | 'rear-right';
export interface JackRafterWallJoint {
  supportId: EntityId;
  stationFromOuterEaveMm: number;
  seatLengthMm: number;
  normalDepthMm: number;
  remainingDepthMm: number;
}
/** One physical regular-hip jack. Its station is measured on the wall plate from the hip corner. */
export interface JackRafterSpec {
  id: EntityId;
  prototypeId: EntityId;
  section: TimberSection;
  roofPlane: JackRafterRoofPlane;
  hipCorner: HipCorner;
  hipRafterInstanceId: EntityId;
  ordinalFromCorner: number;
  stationFromHipCornerMm: number;
  commonRunMm: number;
  pitchDeg: number;
  overhangMm: number;
  wallJoint?: JackRafterWallJoint;
  hasIntermediateSupports: boolean;
}
export interface JackRafterResult {
  wallToHipCenterHorizontalRunMm: number;
  outerEaveToHipCenterHorizontalRunMm: number;
  wallToHipCenterLineLengthMm: number;
  tailLineLengthMm: number;
  outerEaveToHipCenterLineLengthMm: number;
  riseFromOuterEaveMm: number;
  roofSlopeDeg: number;
  plumbLineToMemberAxisDeg: number;
  planCutLineToMemberAxisDeg: 45;
  topFaceCutLineToMemberAxisDeg: number;
}
export interface JackRafterMeetingCut {
  kind: 'jack-to-hip-center-plane';
  id: EntityId;
  memberId: EntityId;
  hipRafterInstanceId: EntityId;
  referencePlane: 'vertical-hip-center-plane';
  plumbLineToMemberAxisDeg: number;
  planCutLineToMemberAxisDeg: 45;
  topFaceCutLineToMemberAxisDeg: number;
  hipFaceDeduction: 'not-applied';
}
export type JackRafterFabricationStep =
  | {
      action: 'measure-to-hip-center-plane';
      distanceMm: number;
      reference: 'outer-eave-axis';
    }
  | {
      action: 'mark-wall-seat';
      joint: JackRafterWallJoint;
    }
  | {
      action: 'mark-hip-plumb';
      angleDeg: number;
      reference: 'member-axis-on-side-face';
    }
  | {
      action: 'mark-hip-top-face-line';
      angleDeg: number;
      reference: 'member-axis-on-top-face';
    };
export interface JackRafterFabricationPlan {
  memberId: EntityId;
  prototypeId: EntityId;
  section: TimberSection;
  lengthBasis: 'outer-eave-axis-to-theoretical-hip-center-plane';
  referenceLengthMm: number;
  meetingCut: JackRafterMeetingCut;
  wallJoint?: JackRafterWallJoint;
  intermediateSupportJoinery: 'resolved-none' | 'not-resolved';
  allowanceAndKerf: 'not-included';
  steps: JackRafterFabricationStep[];
}
export interface ResolvedJackRafter {
  spec: JackRafterSpec;
  result: JackRafterResult;
  fabrication: JackRafterFabricationPlan;
}
export interface ResolvedJackRafterInstance extends ResolvedJackRafter {
  from: Point3D;
  to: Point3D;
}
export type MemberPrototypeKind =
  'common-rafter' | 'hip-rafter' | 'jack-rafter';
export interface ResolvedMemberPrototype {
  id: EntityId;
  code: 'K1' | 'H1' | 'J1';
  kind: MemberPrototypeKind;
  section: TimberSection;
  instanceIds: EntityId[];
  count: number;
  lengthRangeMm: { min: number; max: number };
  fabricationMode: 'shared' | 'variable-by-instance';
}
export interface RafterStation {
  id: EntityId;
  alongBuildingMm: number;
}
export interface ResolvedRafterSpacing {
  mode: RafterSpacingMode;
  requestedSpacingMm: number;
  actualSpacingMm: number;
  endBaySpacingMm?: number;
  remainderToEndMm?: number;
  deviationMm?: number;
  deviationRatio?: number;
  endPolicy?: EndStationPolicy;
  bayCount: number;
  stationCount: number;
  stations: RafterStation[];
}
export interface Point3D {
  x: number;
  y: number;
  z: number;
}
/** Canonical coordinates on a resolved roof plane: u follows the eave, v rises up-slope. */
export interface RoofPlanePosition {
  uMm: number;
  vMm: number;
}
export interface RoofWindowFeature {
  id: EntityId;
  kind: 'roof-window';
  roofPlaneId: string;
  widthMm: number;
  heightMm: number;
  position: RoofPlanePosition;
  clearanceMm?: number;
}
export type RoofFeature = RoofWindowFeature;
/** Canonical intent for a geometric response to one roof opening. */
export interface RoofOpeningFramingSpec {
  id: EntityId;
  kind: 'roof-opening-framing';
  featureId: EntityId;
  headerSection: TimberSection;
  /** Clear plane-local distance from the opening edge to the header axis. */
  edgeOffsetMm: number;
  /** Signature of the roof/member field explicitly accepted by the user. */
  acceptedGeometrySignature: string;
}
export interface BattenLayoutSpec {
  enabled: boolean;
  roofPlaneIds?: string[];
  battenHeightMm: number;
  battenWidthMm: number;
  gaugeMm: number;
  eaveOffsetMm: number;
  ridgeOffsetMm?: number;
}
export interface MembraneLayerSpec {
  enabled: boolean;
  roofPlaneIds?: string[];
}
export interface CounterBattenLayoutSpec {
  enabled: boolean;
  roofPlaneIds?: string[];
  widthMm: number;
  heightMm: number;
}
export interface RoofBuildUp {
  membrane?: MembraneLayerSpec;
  counterBattens?: CounterBattenLayoutSpec;
  battenLayout?: BattenLayoutSpec;
}
/** Renderer-neutral canonical roof composition, ready for future attachments/subassemblies. */
export interface RoofAssembly {
  roof: RoofTemplateSpec;
  features: RoofFeature[];
  openingFraming: RoofOpeningFramingSpec[];
  buildUp: RoofBuildUp;
}
export type SkeletonMemberKind =
  | 'wall-plate'
  | 'ridge'
  | 'rafter'
  | 'hip-rafter'
  | 'jack-rafter'
  | 'purlin'
  | 'opening-header'
  | 'rafter-segment';
export type SkeletonMemberSide =
  | 'left'
  | 'right'
  | 'center'
  | 'front'
  | 'rear'
  | 'front-left'
  | 'front-right'
  | 'rear-left'
  | 'rear-right';
export interface SkeletonMember3D {
  /** Stable physical placement ID, e.g. instance:rafter-pair-4:left. Opaque: never parse it. */
  id: EntityId;
  /**
   * Physical member this one was derived from, when it is a derived part such
   * as an opening rafter segment. Absent on original members. Consumers must
   * use this instead of parsing `id` (ADR-007).
   */
  sourceMemberId?: EntityId;
  /** Opening feature this member was generated for, when it is opening framing. */
  sourceFeatureId?: EntityId;
  /** Which side of an opening a generated header or rafter segment sits on. */
  openingRole?: 'upper' | 'lower';
  /** Shared fabrication/source definition used by this physical member. */
  prototypeId: EntityId;
  /** UI semantic selection. Purlin rails intentionally select one support. */
  selectionId: EntityId;
  kind: SkeletonMemberKind;
  from: Point3D;
  to: Point3D;
  section: TimberSection;
  side: SkeletonMemberSide;
  stationMm?: number;
}
export interface SkeletonGuide3D {
  id: EntityId;
  kind: 'roof-plane';
  points: Point3D[];
}
export interface GableRoofSkeleton {
  ridgeHeightMm: number;
  members: SkeletonMember3D[];
  guides?: SkeletonGuide3D[];
}
export interface HipRoofSkeleton {
  ridgeHeightMm: number;
  ridgeLengthMm: number;
  members: SkeletonMember3D[];
  guides: SkeletonGuide3D[];
}
export type RoofSkeleton = GableRoofSkeleton | HipRoofSkeleton;
export interface ResolvedJoint extends SeatNotch {
  memberId: EntityId;
  heelDatumId: DatumId;
  toeDatumId: DatumId;
  stationMm: number;
}
export interface ResolvedAssembly {
  member: Omit<TimberMember2D, 'datums'> & { datums: Datum[] };
  supports: Support2D[];
  joints: ResolvedJoint[];
  endCuts: ResolvedEndCut[];
}
export interface ResolvedEndCut extends Omit<EndCut, 'stationFromAmm'> {
  fromDatumId: DatumId;
  stationMm: number;
}
export type FabricationStep =
  | {
      action: 'mark-plumb' | 'mark-seat';
      operationId: EntityId;
      from: DatumId;
      target: DatumId;
      edge: MemberEdge;
      distanceMm: number;
      angleDeg: number;
      seatLengthMm?: number;
    }
  | {
      action: 'check-depth';
      operationId: EntityId;
      normalDepthMm: number;
      remainingDepthMm: number;
    };
export interface FabricationPlan {
  memberId: EntityId;
  section: TimberSection;
  minimumStockLengthMm: number;
  referenceLengthMm: number;
  referenceDatumId: DatumId;
  datums: Datum[];
  joints: ResolvedJoint[];
  endCuts: ResolvedEndCut[];
  stations: MarkingStation[];
  steps: FabricationStep[];
}
