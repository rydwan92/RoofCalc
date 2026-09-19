/**
 * Roof-system core (V51, extended in V52): ROOF FEATURES + SELECTED SYSTEM
 * COMPONENT SPECS + USER INTENT → PHYSICAL ROOF-SYSTEM REQUIREMENTS.
 *
 * Pure, price-free (ADR-005), UI-free and database-free. It is not a generic
 * BOM framework: it knows roof-system roles, a small finite set of technical
 * quantity rules, commercial section assembly for straight runs, the drainage
 * planner, line-bound components and roof-opening flashings. Roof features
 * arrive as structural inputs copied from the resolved topology in
 * `roof-math`; nothing here re-derives geometry. Gutter purchase with reuse
 * delegates to `procurement-core` — there is no second cutting engine.
 */
export * from './roles';
export * from './spacing';
export * from './sections';
export * from './gutter-purchase';
export * from './drainage-spec';
export * from './drainage-planner';
export * from './system-component-spec';
export * from './line-components';
export * from './openings';
export * from './intent';
