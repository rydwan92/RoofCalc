import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseRoofProjectDocument,
  serializeRoofProjectDocument,
} from '@cieslacalc/calculator-core';
import { withPlannedConnection } from '@cieslacalc/connection-core';
import { useAssembly } from '../store';

beforeEach(() => useAssembly.getState().reset());

const PLAN = withPlannedConnection(undefined, 'rafter-wall-plate', {
  fastening: { type: 'nails', diameterMm: 4, perNode: 4 },
  connector: 'rafter-tie',
});

describe('connection plan in the project document', () => {
  it('is one undoable history entry', () => {
    const before = useAssembly.getState().historyPast.length;
    useAssembly.getState().setConnectionPlan(PLAN);
    const state = useAssembly.getState();
    expect(state.projectDocument.project.connectionPlan).toEqual(PLAN);
    expect(state.historyPast).toHaveLength(before + 1);
    state.undo();
    expect(
      useAssembly.getState().projectDocument.project.connectionPlan,
    ).toBeUndefined();
    useAssembly.getState().redo();
    expect(
      useAssembly.getState().projectDocument.project.connectionPlan,
    ).toEqual(PLAN);
  });

  it('survives every other kind of project edit', () => {
    const state = useAssembly.getState();
    state.setConnectionPlan(PLAN);
    state.setRoofStructureSystem('rafter-collar-tie');
    state.setRidgeConnection('direct-meeting');
    state.setCanonicalField('roof.pitchDeg', 40);
    state.setRoofSystem(undefined);
    state.setCoveringAssignments([]);
    state.setRoofType('hip');
    expect(
      useAssembly.getState().projectDocument.project.connectionPlan,
    ).toEqual(PLAN);
  });

  it('round-trips through serialization; an older project has none', () => {
    useAssembly.getState().setConnectionPlan(PLAN);
    const document = useAssembly.getState().projectDocument;
    expect(
      parseRoofProjectDocument(serializeRoofProjectDocument(document)).project
        .connectionPlan,
    ).toEqual(PLAN);
    const older = JSON.parse(serializeRoofProjectDocument(document));
    delete older.project.connectionPlan;
    expect(
      parseRoofProjectDocument(JSON.stringify(older)).project,
    ).not.toHaveProperty('connectionPlan');
  });

  it('rejects a stored plan that pairs a node with a foreign connector', () => {
    const document = JSON.parse(
      serializeRoofProjectDocument(useAssembly.getState().projectDocument),
    );
    document.project.connectionPlan = {
      version: 1,
      nodes: { 'wall-plate-anchorage': { connector: 'joist-hanger' } },
    };
    expect(() => parseRoofProjectDocument(JSON.stringify(document))).toThrow();
  });
});
