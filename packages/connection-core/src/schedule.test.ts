import { describe, expect, it } from 'vitest';
import { CONNECTION_TYPES, ROOF_NODE_ORDER, ROOF_NODES } from './catalogue';
import {
  parseRoofConnectionPlan,
  withPlannedConnection,
  type RoofConnectionPlan,
} from './plan';
import {
  deriveConnectionSchedule,
  summarizeConnectionSchedule,
  type RoofConnectionCensus,
} from './schedule';
import { STANDARDS } from './standards';

const GABLE_WITH_COLLARS: RoofConnectionCensus = {
  nodes: [
    { kind: 'wall-plate-anchorage', count: 2 },
    {
      kind: 'rafter-wall-plate',
      count: 22,
      modelled: { type: 'seat-notch', status: 'resolved' },
    },
    {
      kind: 'rafter-ridge',
      count: 22,
      modelled: { type: 'ridge-board-butt', status: 'resolved' },
    },
    {
      kind: 'collar-tie-rafter',
      count: 22,
      modelled: { type: 'collar-lap', status: 'named' },
    },
    { kind: 'hip-rafter-ridge', count: 0 },
  ],
  sections: {
    'common-rafter': { widthMm: 80, depthMm: 180 },
    'collar-tie': { widthMm: 50, depthMm: 150 },
  },
};

describe('the catalogue is internally consistent', () => {
  it('orders every node kind exactly once', () => {
    expect([...ROOF_NODE_ORDER].sort()).toEqual(Object.keys(ROOF_NODES).sort());
  });

  it('cites only catalogued standards, and every type names a node', () => {
    for (const type of Object.values(CONNECTION_TYPES)) {
      expect(type.nodes.length).toBeGreaterThan(0);
      for (const reference of type.references)
        expect(STANDARDS[reference.standard]).toBeDefined();
    }
  });

  it('never cites Section 8 for a carpentry joint', () => {
    // EN 1995-1-1 Section 8 covers connections with metal fasteners.
    for (const type of Object.values(CONNECTION_TYPES))
      if (type.family === 'carpentry')
        for (const reference of type.references)
          expect(reference.clause?.startsWith('8')).not.toBe(true);
  });
});

describe('connection schedule', () => {
  it('lists only the nodes the roof has, from the wall to the ridge', () => {
    const rows = deriveConnectionSchedule(GABLE_WITH_COLLARS);
    expect(rows.map((row) => row.kind)).toEqual([
      'wall-plate-anchorage',
      'rafter-wall-plate',
      'collar-tie-rafter',
      'rafter-ridge',
    ]);
    expect(rows.every((row) => row.status === 'not-planned')).toBe(true);
    expect(rows[1]!.options.connectors).toContain('rafter-tie');
    expect(rows[0]!.options.connectors).toEqual([
      'perforated-strap',
      'anchor-rod',
    ]);
  });

  it('checks a planned bolt row against the shallower member', () => {
    const plan = withPlannedConnection(undefined, 'collar-tie-rafter', {
      fastening: { type: 'bolts', diameterMm: 12, perNode: 2 },
    });
    const row = deriveConnectionSchedule(GABLE_WITH_COLLARS, plan).find(
      (item) => item.kind === 'collar-tie-rafter',
    )!;
    expect(row.status).toBe('planned');
    expect(row.plannedQuantity).toEqual({ fasteners: 44 });
    expect(row.detailing).toMatchObject({
      kind: 'row-fit',
      limitingRole: 'collar-tie', // 150 mm < 180 mm
      table: 'Tablica 8.4',
      fit: { status: 'fits', requiredDepthMm: 144, availableDepthMm: 150 },
    });
    expect(row.references.map((item) => item.clause)).toContain('Tablica 8.4');
  });

  it('flags a row that cannot fit, and never computes nails', () => {
    let plan = withPlannedConnection(undefined, 'collar-tie-rafter', {
      fastening: { type: 'bolts', diameterMm: 16, perNode: 3 },
    });
    plan = withPlannedConnection(plan, 'rafter-wall-plate', {
      fastening: { type: 'nails', diameterMm: 4, perNode: 4 },
      connector: 'rafter-tie',
    });
    const rows = deriveConnectionSchedule(GABLE_WITH_COLLARS, plan);
    const collar = rows.find((row) => row.kind === 'collar-tie-rafter')!;
    expect(collar.status).toBe('check-detailing');
    const seat = rows.find((row) => row.kind === 'rafter-wall-plate')!;
    expect(seat.detailing).toEqual({
      kind: 'not-computed',
      reason: 'nails-table-not-verified',
    });
    expect(seat.plannedQuantity).toEqual({ fasteners: 88, connectors: 22 });
    expect(summarizeConnectionSchedule(rows)).toEqual({
      nodeKinds: 4,
      occurrences: 68,
      planned: 2,
      checkDetailing: 1,
    });
  });
});

describe('connection plan persistence', () => {
  it('round-trips and drops emptied nodes', () => {
    const plan = withPlannedConnection(undefined, 'rafter-ridge', {
      fastening: { type: 'nails', diameterMm: 4, perNode: 2 },
      note: '  gwoździe pierścieniowe  ',
    });
    expect(parseRoofConnectionPlan(JSON.parse(JSON.stringify(plan)))).toEqual({
      version: 1,
      nodes: {
        'rafter-ridge': {
          fastening: { type: 'nails', diameterMm: 4, perNode: 2 },
          note: 'gwoździe pierścieniowe',
        },
      },
    });
    expect(withPlannedConnection(plan, 'rafter-ridge', {})).toBeUndefined();
  });

  it('rejects a connector the catalogue does not offer for the node', () => {
    const invalid: RoofConnectionPlan = {
      version: 1,
      nodes: { 'wall-plate-anchorage': { connector: 'joist-hanger' } },
    };
    expect(() => parseRoofConnectionPlan(invalid)).toThrow();
    expect(() =>
      parseRoofConnectionPlan({
        version: 1,
        nodes: { 'rafter-ridge': { fastening: { type: 'bolts', perNode: 0 } } },
      }),
    ).toThrow();
  });
});
