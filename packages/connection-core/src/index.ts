/**
 * @cieslacalc/connection-core — roof timber connections (VNext-2).
 *
 *   catalogue   member roles, node kinds (węzły) and connection types —
 *               carpentry, dowel-type fasteners, steel connectors — each
 *               with its PN-EN references
 *   standards   the standards and editions those references point to
 *   spacing     EN 1995-1-1 Table 8.4 (bolts) / 8.5 (dowels) minimum
 *               spacings and a row-fit detailing check
 *   plan        the canonical, persisted connection plan + its schema
 *   schedule    census + plan → the connection schedule (plan połączeń)
 *   nodes       where solved member axes actually meet (VNext-3)
 *   junctions   roof-to-roof junction vocabulary for ADR-008 (research)
 *
 * Geometry and detailing only. Capacity, the number of fasteners a node
 * needs, and code compliance are a structural design result
 * (PN-EN 1995-1-1); nothing here claims them. Pure: no React, DOM,
 * network, database, translation or roof solver.
 */
export * from './standards';
export * from './catalogue';
export * from './spacing';
export * from './plan';
export * from './schedule';
export * from './nodes';
export * from './junctions';
