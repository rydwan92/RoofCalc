/**
 * V51 roof-system core: ROOF FEATURES + SELECTED SYSTEM COMPONENT SPECS +
 * USER INTENT → PHYSICAL ROOF-SYSTEM REQUIREMENTS.
 *
 * Pure, price-free (ADR-005), UI-free and database-free. It is not a generic
 * BOM framework: it knows roof-system roles, a small finite set of technical
 * quantity rules, commercial section assembly for straight runs, and the first
 * drainage planner. Roof features arrive as structural inputs copied from the
 * resolved topology in `roof-math`; nothing here re-derives geometry.
 */
export * from './roles';
export * from './spacing';
export * from './sections';
export * from './drainage-spec';
export * from './drainage-planner';
export * from './line-components';
