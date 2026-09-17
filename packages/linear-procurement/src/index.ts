/**
 * Commercial assembly of linear roof build-up timber (V48).
 *
 * `resolved run → join policy → installable pieces → RequiredPiece[]`.
 * The layer above `procurement-core` that exists so a batten row, which may
 * legitimately consist of several commercial pieces, never masquerades as one
 * indivisible fabrication blank.
 *
 * Pure and dependency-free apart from `procurement-core`'s piece contract:
 * it knows nothing about roofs, catalogues, prices or the UI.
 */
export { planLinearAssembly } from './assembly';
export { installablePiecesToRequiredPieces } from './required-pieces';
export type {
  InstallablePiece,
  LinearAssemblyResult,
  LinearAssemblySettings,
  LinearAssemblySummary,
  LinearEndKind,
  LinearJoinPolicy,
  LinearRun,
  LinearStaggerRule,
  LinearSupport,
  LinearUnresolvedReason,
  LinearUnresolvedRun,
} from './model';
