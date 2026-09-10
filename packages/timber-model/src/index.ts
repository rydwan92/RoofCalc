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
  ridge: { id: EntityId; thicknessMm: number };
}
export type RafterSpacingMode = 'fixed-spacing' | 'fit-evenly';
export interface RafterSpacingSpec {
  mode: RafterSpacingMode;
  spacingMm: number;
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
}
export interface RafterStation {
  id: EntityId;
  alongBuildingMm: number;
}
export interface ResolvedRafterSpacing {
  mode: RafterSpacingMode;
  requestedSpacingMm: number;
  actualSpacingMm: number;
  endBaySpacingMm: number;
  bayCount: number;
  stations: RafterStation[];
}
export interface Point3D {
  x: number;
  y: number;
  z: number;
}
export type SkeletonMemberKind =
  | 'wall-plate'
  | 'ridge'
  | 'rafter'
  | 'purlin';
export interface SkeletonMember3D {
  id: EntityId;
  selectionId: EntityId;
  kind: SkeletonMemberKind;
  from: Point3D;
  to: Point3D;
}
export interface GableRoofSkeleton {
  ridgeHeightMm: number;
  members: SkeletonMember3D[];
}
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
