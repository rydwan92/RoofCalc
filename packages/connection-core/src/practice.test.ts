import { describe, expect, it } from 'vitest';
import {
  CONNECTION_TYPES,
  ROOF_NODE_ORDER,
  type RoofNodeKind,
} from './catalogue';
import { parseRoofConnectionPlan, type RoofConnectionPlan } from './plan';
import {
  applyConnectionPractice,
  proposeConnectionPractice,
  type AnchorageChoice,
  type JoiningStyle,
} from './practice';

const STYLES: JoiningStyle[] = ['carpentry', 'connectors'];
const ANCHORAGE: AnchorageChoice[] = [
  'anchor-rod',
  'perforated-strap',
  'undecided',
];

describe('carpentry practice proposal', () => {
  it('proposes only types the catalogue offers at each node, for every answer', () => {
    for (const style of STYLES)
      for (const anchorage of ANCHORAGE)
        for (const proposal of proposeConnectionPractice(ROOF_NODE_ORDER, {
          style,
          anchorage,
        })) {
          for (const id of [
            proposal.planned?.fastening?.type,
            proposal.planned?.connector,
          ])
            if (id)
              expect({
                kind: proposal.kind,
                id,
                offered: CONNECTION_TYPES[id].nodes.includes(proposal.kind),
              }).toMatchObject({ offered: true });
          expect(proposal.sources.length).toBeGreaterThan(0);
        }
  });

  it('never proposes a diameter, a count or a note (ADR-014)', () => {
    for (const style of STYLES)
      for (const proposal of proposeConnectionPractice(ROOF_NODE_ORDER, {
        style,
        anchorage: 'anchor-rod',
      })) {
        expect(proposal.planned?.fastening?.diameterMm).toBeUndefined();
        expect(proposal.planned?.fastening?.perNode).toBeUndefined();
        expect(proposal.planned?.note).toBeUndefined();
      }
  });

  it('follows the chosen style at the rafter seat and the jack–hip node', () => {
    const kinds: RoofNodeKind[] = [
      'rafter-wall-plate',
      'jack-rafter-hip-rafter',
      'collar-tie-rafter',
    ];
    const carpentry = proposeConnectionPractice(kinds, {
      style: 'carpentry',
      anchorage: 'undecided',
    });
    expect(carpentry.map((item) => item.planned)).toEqual([
      { fastening: { type: 'nails' } },
      { fastening: { type: 'nails' } },
      { fastening: { type: 'bolts' } },
    ]);
    const connectors = proposeConnectionPractice(kinds, {
      style: 'connectors',
      anchorage: 'undecided',
    });
    expect(connectors.map((item) => item.planned)).toEqual([
      { fastening: { type: 'nails' }, connector: 'rafter-tie' },
      { fastening: { type: 'nails' }, connector: 'joist-hanger' },
      { fastening: { type: 'screws' } },
    ]);
  });

  it('leaves the purlin–hip node and an undecided anchorage to the designer', () => {
    const [purlinHip, anchorage] = proposeConnectionPractice(
      ['purlin-hip-rafter', 'wall-plate-anchorage'],
      { style: 'connectors', anchorage: 'undecided' },
    );
    expect(purlinHip).toMatchObject({ rationale: 'designer-detail' });
    expect(purlinHip!.planned).toBeUndefined();
    expect(anchorage).toMatchObject({ rationale: 'designer-detail' });
    expect(
      proposeConnectionPractice(['wall-plate-anchorage'], {
        style: 'carpentry',
        anchorage: 'anchor-rod',
      })[0]!.planned,
    ).toEqual({ connector: 'anchor-rod' });
  });

  it('lists alternatives without the proposed types and without carpentry interfaces', () => {
    const [seat] = proposeConnectionPractice(['rafter-wall-plate'], {
      style: 'connectors',
      anchorage: 'undecided',
    });
    expect(seat!.alternatives).not.toContain('rafter-tie');
    expect(seat!.alternatives).not.toContain('nails');
    expect(seat!.alternatives).not.toContain('seat-notch');
    expect(seat!.alternatives).toContain('angle-bracket');
  });

  it('applies as one valid plan, keeping decided nodes and notes unless asked', () => {
    const existing: RoofConnectionPlan = {
      version: 1,
      nodes: {
        'rafter-wall-plate': {
          fastening: { type: 'screws', diameterMm: 8, perNode: 2 },
        },
        'collar-tie-rafter': { note: 'M12 wg projektu' },
      },
    };
    const proposals = proposeConnectionPractice(
      ['rafter-wall-plate', 'collar-tie-rafter', 'rafter-ridge'],
      { style: 'carpentry', anchorage: 'undecided' },
    );
    const kept = applyConnectionPractice(existing, proposals)!;
    expect(kept.nodes['rafter-wall-plate']).toEqual(
      existing.nodes['rafter-wall-plate'],
    );
    expect(kept.nodes['collar-tie-rafter']).toEqual({
      fastening: { type: 'bolts' },
      note: 'M12 wg projektu',
    });
    expect(kept.nodes['rafter-ridge']).toEqual({
      fastening: { type: 'nails' },
    });
    expect(parseRoofConnectionPlan(kept)).toEqual(kept);
    const replaced = applyConnectionPractice(existing, proposals, {
      replaceDecided: true,
    })!;
    expect(replaced.nodes['rafter-wall-plate']).toEqual({
      fastening: { type: 'nails' },
    });
    // Nothing accepted → the plan is unchanged (same reference).
    expect(applyConnectionPractice(existing, [])).toBe(existing);
  });
});
