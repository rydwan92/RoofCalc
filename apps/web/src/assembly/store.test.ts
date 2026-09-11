import { beforeEach, expect, it } from 'vitest';
import {
  calculateAssembly,
  assemblySpecSchema,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import {
  createMemberInstanceContexts,
  createRoofFabricationPackage,
  detailPreviewsFromFabricationPackage,
} from '@cieslacalc/calculator-core';
import { supportField, useAssembly } from './store';
import { createRoofSkeleton } from '@cieslacalc/roof-math';

function memberInstances() {
  const template = useAssembly.getState().template;
  const resolved = resolveRoofTemplate(template);
  return createMemberInstanceContexts({
    resolved,
    skeleton: createRoofSkeleton(template),
    roofPackage: createRoofFabricationPackage(resolved),
  });
}
beforeEach(() => {
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('mm');
  useAssembly.getState().setMode('quick');
});
it('Quick and Builder retain one canonical template and fabrication plan', () => {
  useAssembly.getState().setField('roof.runMm', '4231,123456');
  const { spec, template } = useAssembly.getState(),
    plan = calculateAssembly(spec);
  useAssembly.getState().setMode('builder');
  expect(useAssembly.getState().spec).toBe(spec);
  expect(useAssembly.getState().template).toBe(template);
  expect(calculateAssembly(useAssembly.getState().spec)).toEqual(plan);
  useAssembly.getState().add();
  const withPurlin = useAssembly.getState().spec;
  useAssembly.getState().setMode('quick');
  expect(useAssembly.getState().spec).toBe(withPurlin);
});
it('projects identical fabrication operations and details in Quick and Builder', () => {
  const quickPackage = createRoofFabricationPackage(
    resolveRoofTemplate(useAssembly.getState().template),
  );
  const quickDetails = detailPreviewsFromFabricationPackage(quickPackage);
  useAssembly.getState().setMode('builder');
  const builderPackage = createRoofFabricationPackage(
    resolveRoofTemplate(useAssembly.getState().template),
  );
  expect(builderPackage).toEqual(quickPackage);
  expect(detailPreviewsFromFabricationPackage(builderPackage)).toEqual(
    quickDetails,
  );
});
it('unit changes preserve precision and numeric positions, and raw editing uses the display unit', () => {
  useAssembly.getState().add();
  const field = supportField('support:purlin-1', 'xMm');
  useAssembly.getState().setField(field, '2100,123456789');
  const spec = useAssembly.getState().spec;
  for (const unit of ['m', 'cm', 'mm'] as const) {
    useAssembly.getState().setUnit(unit);
    expect(useAssembly.getState().spec).toBe(spec);
  }
  useAssembly.getState().setUnit('m');
  useAssembly.getState().setField(field, '2,5');
  expect(useAssembly.getState().spec.supports[1]!.placement.xMm).toBe(2500);
  useAssembly.getState().movePurlin('support:purlin-1', 2300);
  expect(useAssembly.getState().drafts[field]).toBe('2.3');
});
it('invalid drafts preserve the last valid template and disappear with a removed purlin', () => {
  useAssembly.getState().add();
  const before = useAssembly.getState().spec;
  useAssembly
    .getState()
    .setField(supportField('support:purlin-1', 'xMm'), 'wrong');
  expect(
    assemblySpecSchema.safeParse(useAssembly.getState().spec).success,
  ).toBe(true);
  expect(useAssembly.getState().spec).toBe(before);
  expect(
    useAssembly.getState().invalidFields[
      supportField('support:purlin-1', 'xMm')
    ],
  ).toBe(true);
  useAssembly.getState().remove('support:purlin-1');
  expect(
    assemblySpecSchema.safeParse(useAssembly.getState().spec).success,
  ).toBe(true);
  expect(useAssembly.getState().drafts).toEqual({});
  useAssembly.getState().add();
  expect(
    Number.isFinite(useAssembly.getState().spec.supports[1]!.placement.xMm),
  ).toBe(true);
});
it('template layout changes only repeated skeleton positions, not fabrication geometry', () => {
  const before = resolveRoofTemplate(useAssembly.getState().template);
  useAssembly.getState().setField('template.buildingLengthMm', '12000');
  useAssembly.getState().setField('template.rafterSpacingMm', '600');
  const after = resolveRoofTemplate(useAssembly.getState().template);
  expect(after.rafterSpacing?.stations).toHaveLength(21);
  expect(after.calculation).toEqual(before.calculation);
});
it('switches explicit spacing policies as undoable canonical template edits', () => {
  useAssembly.getState().setCanonicalField('template.buildingLengthMm', 940);
  useAssembly.getState().setCanonicalField('template.rafterSpacingMm', 800);
  useAssembly.setState({ historyPast: [], historyFuture: [] });

  const maximum = resolveRoofTemplate(useAssembly.getState().template);
  expect(maximum.rafterSpacing).toMatchObject({
    mode: 'max-even-spacing',
    requestedSpacingMm: 800,
    actualSpacingMm: 470,
    bayCount: 2,
    stationCount: 3,
  });

  useAssembly.getState().setSpacingMode('target-even-spacing');
  const target = resolveRoofTemplate(useAssembly.getState().template);
  expect(target.rafterSpacing).toMatchObject({
    mode: 'target-even-spacing',
    actualSpacingMm: 940,
    deviationMm: 140,
    deviationRatio: 0.175,
    bayCount: 1,
    stationCount: 2,
  });

  useAssembly.getState().setSpacingMode('fixed-module');
  expect(useAssembly.getState().template.rafterSpacing).toEqual({
    mode: 'fixed-module',
    spacingMm: 800,
    endPolicy: 'require-both-ends',
  });
  useAssembly.getState().setEndStationPolicy('allow-open-end');
  const openEnd = resolveRoofTemplate(useAssembly.getState().template);
  expect(openEnd.rafterSpacing).toMatchObject({
    mode: 'fixed-module',
    endPolicy: 'allow-open-end',
    remainderToEndMm: 140,
    bayCount: 1,
    stationCount: 2,
  });

  useAssembly.getState().undo();
  expect(useAssembly.getState().template.rafterSpacing).toMatchObject({
    mode: 'fixed-module',
    endPolicy: 'require-both-ends',
  });
  useAssembly.getState().redo();
  expect(useAssembly.getState().template.rafterSpacing).toMatchObject({
    mode: 'fixed-module',
    endPolicy: 'allow-open-end',
  });
});
it('converts the controlling joint parameter without changing the notch', () => {
  const id = useAssembly.getState().spec.supports[0]!.id;
  const before = calculateAssembly(useAssembly.getState().spec);
  useAssembly.getState().setJointControl(id, 'depth');
  const after = calculateAssembly(useAssembly.getState().spec);
  expect(after.assembly.joints[0]!.seatLengthMm).toBeCloseTo(
    before.assembly.joints[0]!.seatLengthMm,
    10,
  );
});

it('switches roof templates as one undoable transaction and preserves compatible values', () => {
  const before = structuredClone(useAssembly.getState().template);
  useAssembly.getState().setRoofType('hip');
  const hip = useAssembly.getState().template;
  expect(hip.type).toBe('hip');
  expect(hip.halfRunMm).toBe(before.halfRunMm);
  expect(hip.pitchDeg).toBe(before.pitchDeg);
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template.type).toBe('gable');
  expect(useAssembly.getState().template.halfRunMm).toBe(before.halfRunMm);
  useAssembly.getState().redo();
  expect(useAssembly.getState().template.type).toBe('hip');
});

it('keeps Quick and Builder on the same canonical H1 result', () => {
  useAssembly.getState().setRoofType('hip');
  const quick = resolveRoofTemplate(useAssembly.getState().template);
  expect('hipRafter' in quick).toBe(true);
  useAssembly.getState().setMode('builder');
  const builder = resolveRoofTemplate(useAssembly.getState().template);
  expect(builder).toEqual(quick);
});

it('updates K1, H1 and ridge geometry from shared hip dimensions', () => {
  useAssembly.getState().setRoofType('hip');
  useAssembly.getState().setCanonicalField('template.buildingLengthMm', 10000);
  const before = resolveRoofTemplate(useAssembly.getState().template);
  if (!('hipRafter' in before)) throw new Error('expected hip result');
  useAssembly.getState().setCanonicalField('roof.pitchDeg', 42);
  const pitched = resolveRoofTemplate(useAssembly.getState().template);
  if (!('hipRafter' in pitched)) throw new Error('expected hip result');
  expect(pitched.calculation.plan.referenceLengthMm).not.toBe(
    before.calculation.plan.referenceLengthMm,
  );
  expect(pitched.hipRafter.result.theoreticalLineLengthMm).not.toBe(
    before.hipRafter.result.theoreticalLineLengthMm,
  );
  useAssembly.getState().setCanonicalField('roof.runMm', 4500);
  const wider = resolveRoofTemplate(useAssembly.getState().template);
  if (!('hipRafter' in wider)) throw new Error('expected hip result');
  expect(wider.ridgeLengthMm).toBe(1000);
  expect(wider.hipRafter.result.planRunMm).toBeCloseTo(4500 * Math.SQRT2, 10);
});

it('changes hip ridge length without changing H1 when only building length changes', () => {
  useAssembly.getState().setRoofType('hip');
  const before = resolveRoofTemplate(useAssembly.getState().template);
  if (!('hipRafter' in before)) throw new Error('expected hip result');
  useAssembly.getState().setCanonicalField('template.buildingLengthMm', 12000);
  const after = resolveRoofTemplate(useAssembly.getState().template);
  if (!('hipRafter' in after)) throw new Error('expected hip result');
  expect(after.ridgeLengthMm).toBe(4000);
  expect(after.hipRafter).toEqual(before.hipRafter);
});

it('rejects a hip building length below span and keeps display units invariant', () => {
  useAssembly.getState().setRoofType('hip');
  const before = resolveRoofTemplate(useAssembly.getState().template);
  useAssembly.getState().setField('template.buildingLengthMm', '7999');
  expect(
    useAssembly.getState().invalidFields['template.buildingLengthMm'],
  ).toBe(true);
  expect(resolveRoofTemplate(useAssembly.getState().template)).toEqual(before);
  useAssembly.getState().setUnit('cm');
  expect(resolveRoofTemplate(useAssembly.getState().template)).toEqual(before);
});
it('undoes and redoes a committed numeric template edit without recording display state', () => {
  const before = useAssembly.getState().template;
  useAssembly.getState().setField('roof.pitchDeg', '42');
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().setUnit('m');
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template).toEqual(before);
  expect(useAssembly.getState().historyFuture).toHaveLength(1);
  useAssembly.getState().redo();
  expect(useAssembly.getState().template.pitchDeg).toBe(42);
});
it('updates canonical millimetres directly for drawing handles without display-unit conversion', () => {
  useAssembly.getState().setUnit('m');
  useAssembly.getState().setCanonicalField('roof.runMm', 4210.5);
  expect(useAssembly.getState().template.halfRunMm).toBe(4210.5);
  expect(useAssembly.getState().spec.roof.runMm).toBe(4210.5);
});
it('coalesces a purlin gesture and restores its start state when cancelled', () => {
  useAssembly.getState().add();
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const start =
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm;
  useAssembly.getState().beginTransaction();
  useAssembly.getState().movePurlin('support:purlin-1', start + 100);
  useAssembly.getState().movePurlin('support:purlin-1', start + 250);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  useAssembly.getState().commitTransaction();
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm,
  ).toBe(start);
  useAssembly.getState().redo();
  expect(
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm,
  ).toBe(start + 250);
  useAssembly.getState().beginTransaction();
  useAssembly.getState().movePurlin('support:purlin-1', start + 300);
  useAssembly.getState().cancelTransaction();
  expect(
    useAssembly.getState().template.intermediateSupports[0]!.placement.xMm,
  ).toBe(start + 250);
});
it('undoes and redoes adding and removing independently allocated purlins', () => {
  useAssembly.getState().add();
  useAssembly.getState().add();
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(2);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(1);
  useAssembly.getState().redo();
  useAssembly.getState().remove('support:purlin-2');
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template.intermediateSupports).toHaveLength(2);
});
it('keeps transient workbench changes outside project history and document', () => {
  const before = structuredClone(useAssembly.getState().projectDocument);
  useAssembly.getState().setMode('builder');
  useAssembly.getState().setViewPreset('cuts');
  useAssembly.getState().setDimensionLevel('full');
  useAssembly.getState().setToolGroupCollapsed('timber', true);
  useAssembly.getState().select('member:rafter-common-1');
  useAssembly.getState().setIsolation(true);
  useAssembly.getState().setFocusId('joint:support:wall-plate-1');
  useAssembly.getState().setDetailDrawer({
    open: true,
    pinned: true,
    activePreviewId: 'preview:joint:support:wall-plate-1',
  });
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().historyPast).toHaveLength(0);

  useAssembly.getState().setField('roof.pitchDeg', '42');
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  expect(useAssembly.getState().projectDocument.project.roof.pitchDeg).toBe(42);
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().workbench.viewPreset).toBe('cuts');
  expect(useAssembly.getState().workbench.isolateSelection).toBe(true);
  expect(useAssembly.getState().workbench.focusId).toBe(
    'joint:support:wall-plate-1',
  );
});
it('returns from isolation when the whole roof becomes the selection', () => {
  const before = structuredClone(useAssembly.getState().projectDocument);
  useAssembly.getState().select(useAssembly.getState().spec.member.id);
  useAssembly.getState().setIsolation(true);
  useAssembly.getState().select('roof');
  expect(useAssembly.getState().workbench.isolateSelection).toBe(false);
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});

it('selects and navigates physical member instances without editing the project', () => {
  useAssembly.getState().setRoofType('hip');
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const beforeDocument = structuredClone(
    useAssembly.getState().projectDocument,
  );
  const hips = memberInstances().filter(
    (instance) => instance.familyCode === 'H1',
  );
  const first = hips[0]!;
  const second = hips[1]!;

  useAssembly.getState().select(first.instanceId, first.prototypeId);
  expect(useAssembly.getState().workbench).toMatchObject({
    selectedId: first.instanceId,
    selectedInstanceId: first.instanceId,
    selectedPrototypeId: first.prototypeId,
  });
  useAssembly.getState().navigateToInstance({
    instanceId: second.instanceId,
    prototypeId: second.prototypeId,
    operationIds: second.relatedOperationIds,
  });
  expect(useAssembly.getState().workbench.selectedInstanceId).toBe(
    second.instanceId,
  );
  expect(useAssembly.getState().projectDocument).toEqual(beforeDocument);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});

it('preserves an operation across compatible instances and steps back by context', () => {
  useAssembly.getState().setRoofType('hip');
  const hips = memberInstances().filter(
    (instance) => instance.familyCode === 'H1',
  );
  const first = hips[0]!;
  const second = hips[1]!;
  const operation = first.operations.find(
    (candidate) => candidate.detailPreviewId,
  )!;

  useAssembly.getState().activateOperation({
    operationId: operation.operationId,
    prototypeId: first.prototypeId,
    instanceId: first.instanceId,
    previewId: operation.detailPreviewId,
  });
  expect(useAssembly.getState().workbench.detailDrawer.open).toBe(true);
  useAssembly.getState().navigateToInstance({
    instanceId: second.instanceId,
    prototypeId: second.prototypeId,
    operationIds: second.relatedOperationIds,
  });
  expect(useAssembly.getState().workbench).toMatchObject({
    selectedInstanceId: second.instanceId,
    activeOperationId: operation.operationId,
  });

  useAssembly.getState().stepBackContext();
  expect(useAssembly.getState().workbench).toMatchObject({
    selectedId: second.instanceId,
    selectedInstanceId: second.instanceId,
    activeOperationId: undefined,
  });
  useAssembly.getState().stepBackContext();
  expect(useAssembly.getState().workbench).toMatchObject({
    selectedId: 'roof',
    selectedInstanceId: undefined,
    selectedPrototypeId: undefined,
  });
});

it('opens no stale detail for a limited J1 operation', () => {
  useAssembly.getState().setRoofType('hip');
  const jack = memberInstances().find(
    (instance) => instance.familyCode === 'J1',
  )!;
  const operation = jack.operations.find(
    (candidate) => candidate.status === 'limited',
  )!;
  useAssembly.getState().setDetailDrawer({
    open: true,
    activePreviewId: 'stale-preview',
  });

  useAssembly.getState().activateOperation({
    operationId: operation.operationId,
    prototypeId: jack.prototypeId,
    instanceId: jack.instanceId,
    previewId: operation.detailPreviewId,
  });

  expect(useAssembly.getState().workbench).toMatchObject({
    selectedInstanceId: jack.instanceId,
    activeOperationId: operation.operationId,
    canvasView: 'skeleton',
    detailDrawer: { open: false, activePreviewId: undefined },
  });
});
