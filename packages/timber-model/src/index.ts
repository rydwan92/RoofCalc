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
/**
 * Explicit K1 ridge-termination intent. `ridge-board` is the pre-V32 default
 * (near-face butt against a centered vertical board). `direct-meeting` is the
 * same plumb-cut reference geometry with zero board thickness (opposing
 * rafters meet on the run axis). `half-lap` names an overlap/nakładka
 * connection whose cut geometry is not yet modeled; it never resolves a
 * fabrication blank (see `resolveK1FabricationBlank`). None of these variants
 * claim structural adequacy, fastener selection or code compliance.
 */
export type RidgeConnectionType = 'ridge-board' | 'direct-meeting' | 'half-lap';
/** Editable intent only. All positions and lengths are canonical millimetres. */
export interface AssemblySpec {
  roof: { runMm: number; pitchDeg: number; overhangMm: number };
  member: { id: EntityId; section: TimberSection };
  supports: SupportSpec[];
  ridge: {
    id: EntityId;
    thicknessMm: number;
    depthMm?: number;
    /** Absent means `ridge-board`, matching every project saved before V32. */
    connection?: RidgeConnectionType;
  };
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
/** One collar-tie (jętka) physical placement. Geometry only; no structural sizing. */
export interface CollarTieSpec {
  /** Vertical clearance above the wall-plate top / seat-plane reference. */
  heightAboveWallPlateMm: number;
  section: TimberSection;
}
/**
 * Explicit roof structural-system intent, distinct from roof shape (gable/hip)
 * and from K1 ridge-connection intent. `rafter-collar-tie` is currently
 * supported for gable roofs only.
 */
export interface RoofStructureIntent {
  system: 'rafter' | 'rafter-collar-tie';
  collarTie?: CollarTieSpec;
}
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
  /** Absent means the pre-V32 default: `{ system: 'rafter' }`. */
  structure?: RoofStructureIntent;
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
  /** V39 execution intent. Absent means undecided, as on every older project. */
  hipExecution?: HipExecutionIntent;
}
export type RoofTemplateSpec = GableRoofTemplateSpec | HipRoofTemplateSpec;

/**
 * V39 execution intent for the hip rafter's top treatment.
 *
 * Both real operations place the hip's upper arrises on the two roof planes,
 * so neither changes a plan position; they differ in the bearing surface the
 * hip presents. `not-decided` is the honest default for every project saved
 * before V39 and must never be silently replaced by a guess.
 */
export type HipTopTreatment = 'not-decided' | 'backed' | 'dropped';

/**
 * V39 execution intent for the jack-to-hip end.
 *
 * `theoretical-centre-plane` is the pre-V39 behaviour: the jack stops at the
 * vertical plane through the hip axis, which is layout geometry and not a
 * finished end. `hip-face-butt` is the one discriminated detail V39 resolves
 * physically — a square butt against the hip's vertical side face.
 * Hardware-assisted variants need a connector snapshot and are absent.
 */
export type JackToHipConnection = 'theoretical-centre-plane' | 'hip-face-butt';

/** Explicit hip execution choices. Absent means every choice is undecided. */
export interface HipExecutionIntent {
  hipTop?: HipTopTreatment;
  jackConnection?: JackToHipConnection;
}

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
  /**
   * V39. Absent means `theoretical-centre-plane`, the pre-V39 behaviour.
   * `hip-face-butt` additionally needs `hipSectionWidthMm`.
   */
  hipConnection?: JackToHipConnection;
  /** Hip section width, required to resolve a physical hip-face termination. */
  hipSectionWidthMm?: number;
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
/**
 * The jack's end against the hip.
 *
 * V39 keeps the theoretical centre-plane cut and adds, when the project
 * explicitly selects `hip-face-butt`, the finished square butt against the
 * hip's vertical side face. Both are reported: the reference geometry never
 * disappears, because 3D, dimension explanations and future connection
 * variants all need it.
 */
export interface JackRafterMeetingCut {
  kind: 'jack-to-hip-center-plane';
  id: EntityId;
  memberId: EntityId;
  hipRafterInstanceId: EntityId;
  referencePlane: 'vertical-hip-center-plane';
  plumbLineToMemberAxisDeg: number;
  planCutLineToMemberAxisDeg: 45;
  topFaceCutLineToMemberAxisDeg: number;
  /**
   * `not-applied` is the reference result. `applied-to-hip-side-face` means
   * the finished end below was resolved from an explicit connection intent.
   */
  hipFaceDeduction: 'not-applied' | 'applied-to-hip-side-face';
  /** Present only when the deduction was applied. */
  finished?: JackRafterFinishedEnd;
}

/**
 * The resolved finished jack end for the `hip-face-butt` connection.
 *
 * The cut plane is the hip's near vertical side face, which is parallel to the
 * centre plane the reference cut uses — so every angle is unchanged and only
 * the station moves. Backing or drop remove material from the hip's top only
 * and therefore never move this face
 * (`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md` §7).
 */
export interface JackRafterFinishedEnd {
  connection: 'hip-face-butt';
  cutPlane: 'hip-near-vertical-side-face';
  /** Horizontal deduction from the hip centre plane to its near side face. */
  hipFacePlanDeductionMm: number;
  /** The same deduction measured along the sloping jack axis. */
  hipFaceAxisDeductionMm: number;
  /** Outer-eave axis to the finished end, in millimetres. */
  finishedLengthMm: number;
  /** The hip section width the deduction was derived from. */
  hipWidthMm: number;
  /** No machining or kerf allowance is included — ADR-009/ADR-010. */
  allowance: 'not-included';
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
    }
  | {
      /** V39, only for the resolved `hip-face-butt` connection. */
      action: 'deduct-hip-side-face';
      deductionMm: number;
      finishedLengthMm: number;
      reference: 'hip-near-vertical-side-face';
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
  /**
   * V39 execution readiness. `reference-only` keeps the pre-V39 meaning:
   * useful layout geometry that is not a finished end and must never become a
   * procurement blank. `fabrication-resolved` is reached only when an explicit
   * connection intent resolved a physical finished end.
   */
  executionStatus: 'reference-only' | 'fabrication-resolved';
  /** Why the plan is still reference-only. Absent once resolved. */
  unresolvedReason?: 'hip-connection-not-selected';
  /** Finished axis length, present only when `fabrication-resolved`. */
  finishedLengthMm?: number;
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
/**
 * One resolved collar tie, paired with its rafter station. Length and
 * position are theoretical/centerline geometry (reference to the rafter
 * axis), not a finished, notch-aware fabrication result.
 */
export interface ResolvedCollarTie {
  id: EntityId;
  stationId: EntityId;
  alongBuildingMm: number;
  heightAboveWallPlateMm: number;
  positionAlongRafterMm: number;
  lengthMm: number;
  section: TimberSection;
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
  /** Absent on pre-V33 documents and therefore interpreted as manual. */
  mode?: 'manual' | 'auto-from-covering';
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
/**
 * V39 hip-boundary counter-batten detail.
 *
 * Research (`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md`) found two
 * well-evidenced, mutually exclusive arrangements and no basis for a default:
 *
 * - `no-dedicated-run` — the hip batten rides on adjustable holders fixed into
 *   the hip rafter, so no counter-batten runs at the hip. Adds no length.
 * - `paired-plane-runs` — one run on each adjoining plane, parallel to the hip,
 *   its inner face on the plane's hip boundary. Adds two runs per hip.
 *
 * `not-decided` keeps the honest partial result rather than inventing either.
 */
export type HipCounterBattenDetail =
  'not-decided' | 'no-dedicated-run' | 'paired-plane-runs';

export interface CounterBattenLayoutSpec {
  enabled: boolean;
  roofPlaneIds?: string[];
  widthMm: number;
  heightMm: number;
  /** Absent means `not-decided`, matching every project saved before V39. */
  hipBoundaryDetail?: HipCounterBattenDetail;
}
/** V48: one commercial length the user can buy, and how many are available. */
export interface CommercialLengthSpec {
  lengthMm: number;
  /** Absent means unlimited. */
  availability?: number;
}

/**
 * V48: the user's commercial decision for one linear build-up material.
 *
 * Geometry never depends on this — it only turns a resolved installation
 * requirement into a purchase plan. Cutting settings are optional so a project
 * that never opened the advanced panel keeps the application defaults.
 */
export interface LinearStockSelectionSpec {
  lengths: CommercialLengthSpec[];
  objective?:
    'minimum-waste' | 'minimum-purchased-length' | 'minimum-stock-count';
  kerfMm?: number;
  endTrimMm?: number;
  minimumReusableRemnantMm?: number;
  /**
   * Explicit fabrication allowance for a raking (hip/valley) end. Absent
   * means the user has not decided one, and such runs stay unplanned rather
   * than receiving a hidden guess.
   */
  angledEndAllowanceMm?: number;
}

export interface LinearStockPlanSpec {
  battens?: LinearStockSelectionSpec;
  counterBattens?: LinearStockSelectionSpec;
}

export interface RoofBuildUp {
  membrane?: MembraneLayerSpec;
  counterBattens?: CounterBattenLayoutSpec;
  battenLayout?: BattenLayoutSpec;
  /**
   * V48. Additive-optional: absent on every pre-V48 project, which simply
   * means no purchase plan has been prepared yet.
   */
  linearStock?: LinearStockPlanSpec;
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
  | 'rafter-segment'
  | 'collar-tie';
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
