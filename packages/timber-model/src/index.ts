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
export type DatumId = 'A' | 'B' | 'C' | 'D';
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
