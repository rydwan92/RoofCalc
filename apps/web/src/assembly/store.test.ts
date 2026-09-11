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
it('applies an equal-gap purlin proposal as one canonical undo step', () => {
  useAssembly.getState().add();
  useAssembly.getState().add();
  useAssembly.getState().add();
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const before = structuredClone(useAssembly.getState().template);
  const documentBefore = structuredClone(
    useAssembly.getState().projectDocument,
  );

  useAssembly.getState().distributePurlins();

  const positions = useAssembly
    .getState()
    .template.intermediateSupports.map((support) => support.placement.xMm);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  expect(useAssembly.getState().projectDocument).not.toEqual(documentBefore);
  useAssembly.getState().undo();
  expect(useAssembly.getState().template).toEqual(before);
  useAssembly.getState().redo();
  expect(
    useAssembly
      .getState()
      .template.intermediateSupports.map((support) => support.placement.xMm),
  ).toEqual(positions);
});
it('stores roof windows and batten settings in complete undoable project snapshots', () => {
  const before = structuredClone(useAssembly.getState().projectDocument);
  useAssembly.getState().addRoofWindow();
  const feature = useAssembly.getState().projectDocument.project.features[0]!;
  expect(feature.position.uMm).toBeGreaterThanOrEqual(0);
  expect(useAssembly.getState().workbench.viewPreset).toBe('openings');
  useAssembly.getState().setBattenLayout({
    enabled: true,
    battenHeightMm: 40,
    battenWidthMm: 60,
    gaugeMm: 350,
    eaveOffsetMm: 250,
  });
  expect(
    useAssembly.getState().projectDocument.project.buildUp.battenLayout,
  ).toMatchObject({ gaugeMm: 350 });
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument.project.buildUp).toEqual({});
  expect(useAssembly.getState().projectDocument.project.features).toEqual([
    feature,
  ]);
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument).toEqual(before);
  useAssembly.getState().redo();
  useAssembly.getState().redo();
  expect(useAssembly.getState().projectDocument.project.features).toEqual([
    feature,
  ]);
  expect(
    useAssembly.getState().projectDocument.project.buildUp.battenLayout
      ?.enabled,
  ).toBe(true);
});
it('coalesces a roof-window drag transaction and restores its canonical local position', () => {
  useAssembly.getState().addRoofWindow();
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const feature = useAssembly.getState().projectDocument.project.features[0]!;
  useAssembly.getState().beginTransaction();
  useAssembly.getState().moveRoofWindow(feature.id, {
    uMm: feature.position.uMm + 100,
    vMm: feature.position.vMm + 100,
  });
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  useAssembly.getState().cancelTransaction();
  expect(
    useAssembly.getState().projectDocument.project.features[0]!.position,
  ).toEqual(feature.position);
});
it('cancels roof-window placement without history and creates one canonical edit on click', () => {
  const before = structuredClone(useAssembly.getState().projectDocument);
  useAssembly.getState().beginRoofWindowPlacement();
  expect(useAssembly.getState().workbench.placementTool).toMatchObject({
    kind: 'roof-window',
    step: 'choose-plane',
  });
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  useAssembly.getState().cancelRoofWindowPlacement();
  expect(useAssembly.getState().projectDocument).toEqual(before);

  useAssembly.getState().beginRoofWindowPlacement();
  const id = useAssembly
    .getState()
    .placeRoofWindowAt('roof-plane:left', { uMm: 4000, vMm: 2200 });
  expect(id).toBe('feature:roof-window-1');
  expect(useAssembly.getState().workbench.placementTool).toBeUndefined();
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  expect(useAssembly.getState().projectDocument.project.features).toHaveLength(
    1,
  );
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument).toEqual(before);
});
it('keeps a too-wide bay placement unchanged and reports exact geometric feedback', () => {
  useAssembly.getState().addRoofWindow();
  const id = 'feature:roof-window-1';
  useAssembly.getState().updateRoofWindow(id, {
    position: { uMm: 100, vMm: 1200 },
  });
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const before = structuredClone(
    useAssembly.getState().projectDocument.project.features[0]!,
  );
  expect(useAssembly.getState().placeRoofWindowBetweenRafters(id)).toBe(false);
  expect(useAssembly.getState().projectDocument.project.features[0]).toEqual(
    before,
  );
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  expect(useAssembly.getState().workbench.placementFeedback).toMatchObject({
    featureId: id,
    status: 'failed',
    reason: 'opening-too-wide',
    requiredWidthMm: 780,
    availableWidthMm: 720,
    memberInstanceIds: [
      'instance:rafter-pair-1:left',
      'instance:rafter-pair-2:left',
    ],
  });
});
it('previews, applies, undoes and cascade-removes opening framing as canonical transactions', () => {
  useAssembly.getState().addRoofWindow();
  const id = 'feature:roof-window-1';
  useAssembly.getState().updateRoofWindow(id, {
    widthMm: 600,
    position: { uMm: 700, vMm: 1200 },
  });
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const before = structuredClone(useAssembly.getState().projectDocument);

  useAssembly.getState().planOpeningFraming(id);
  expect(useAssembly.getState().workbench.openingFramingProposalFeatureId).toBe(
    id,
  );
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  useAssembly.getState().cancelOpeningFramingProposal();
  expect(useAssembly.getState().historyPast).toHaveLength(0);

  useAssembly.getState().planOpeningFraming(id);
  expect(useAssembly.getState().applyOpeningFraming(id)).toBe(true);
  const applied = structuredClone(useAssembly.getState().projectDocument);
  expect(applied.project.openingFraming).toHaveLength(1);
  expect(applied.project.openingFraming[0]!.acceptedGeometrySignature).not.toBe(
    '',
  );
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument).toEqual(before);
  useAssembly.getState().redo();
  expect(useAssembly.getState().projectDocument).toEqual(applied);

  useAssembly.setState({ historyPast: [], historyFuture: [] });
  useAssembly.getState().removeRoofWindow(id);
  expect(useAssembly.getState().projectDocument.project.features).toEqual([]);
  expect(useAssembly.getState().projectDocument.project.openingFraming).toEqual(
    [],
  );
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument).toEqual(applied);
});
it('switches contextual presets without persisting transient view state', () => {
  useAssembly.getState().addRoofWindow();
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const before = structuredClone(useAssembly.getState().projectDocument);
  const featureId =
    useAssembly.getState().projectDocument.project.features[0]!.id;
  useAssembly.getState().setViewPreset('construction');
  useAssembly.getState().select(featureId);
  expect(useAssembly.getState().workbench.viewPreset).toBe('openings');
  useAssembly.getState().select('batten:roof-plane:left:1');
  expect(useAssembly.getState().workbench.viewPreset).toBe('layers');
  const member = memberInstances()[0]!;
  useAssembly.getState().select(member.instanceId, member.prototypeId);
  expect(useAssembly.getState().workbench.viewPreset).toBe('layers');
  useAssembly.getState().select('roof');
  expect(useAssembly.getState().workbench.viewPreset).toBe('construction');
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});

it('stores membrane and counter-battens canonically while keeping layer navigation transient', () => {
  const before = structuredClone(useAssembly.getState().projectDocument);
  useAssembly.getState().setMode('builder');
  useAssembly.getState().setViewPreset('layers');
  useAssembly.getState().setBuildUpView('membrane');
  useAssembly.getState().setMaterialsView('drawing');
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().historyPast).toHaveLength(0);

  useAssembly.getState().setMembraneLayer({
    enabled: true,
    roofPlaneIds: ['roof-plane:left'],
  });
  expect(useAssembly.getState().historyPast).toHaveLength(1);
  expect(
    useAssembly.getState().projectDocument.project.buildUp.membrane,
  ).toEqual({ enabled: true, roofPlaneIds: ['roof-plane:left'] });

  useAssembly.getState().beginTransaction();
  useAssembly.getState().setCounterBattenLayout({
    enabled: true,
    widthMm: 45,
    heightMm: 25,
  });
  useAssembly.getState().setCounterBattenLayout({
    enabled: true,
    widthMm: 50,
    heightMm: 30,
  });
  useAssembly.getState().commitTransaction();
  expect(useAssembly.getState().historyPast).toHaveLength(2);
  expect(
    useAssembly.getState().projectDocument.project.buildUp.counterBattens,
  ).toMatchObject({ widthMm: 50, heightMm: 30 });

  useAssembly.getState().undo();
  expect(
    useAssembly.getState().projectDocument.project.buildUp.counterBattens,
  ).toBeUndefined();
  useAssembly.getState().undo();
  expect(useAssembly.getState().projectDocument).toEqual(before);
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
it('keeps material schedule selection transient and outside undo history', () => {
  const before = structuredClone(useAssembly.getState().projectDocument);
  useAssembly.getState().setMode('builder');
  useAssembly
    .getState()
    .setScheduleSelection('schedule:K1:5000', 'instance:rafter-pair-1:left');
  expect(useAssembly.getState().workbench).toMatchObject({
    viewPreset: 'materials',
    selectedScheduleRowId: 'schedule:K1:5000',
    selectedScheduleInstanceId: 'instance:rafter-pair-1:left',
    inspectorOpen: true,
  });
  expect(useAssembly.getState().projectDocument).toEqual(before);
  expect(useAssembly.getState().historyPast).toHaveLength(0);

  useAssembly.getState().setViewPreset('construction');
  expect(
    useAssembly.getState().workbench.selectedScheduleRowId,
  ).toBeUndefined();
  expect(
    useAssembly.getState().workbench.selectedScheduleInstanceId,
  ).toBeUndefined();
  expect(useAssembly.getState().projectDocument).toEqual(before);
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
    activeOperationId: operation.operationId,
    detailDrawer: { mode: 'collapsed', open: false },
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

it('restores the previous meaningful preset when the detail dock is closed', () => {
  const instance = memberInstances()[0]!;
  const operation = instance.operations.find(
    (candidate) => candidate.detailPreviewId,
  )!;
  useAssembly.getState().setViewPreset('openings');
  useAssembly.getState().activateOperation({
    operationId: operation.operationId,
    prototypeId: instance.prototypeId,
    instanceId: instance.instanceId,
    previewId: operation.detailPreviewId,
  });
  expect(useAssembly.getState().workbench.viewPreset).toBe('cuts');
  useAssembly.getState().closeDetailDrawer();
  expect(useAssembly.getState().workbench.viewPreset).toBe('openings');
  expect(useAssembly.getState().workbench.detailDrawer.mode).toBe('collapsed');
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

it('keeps the display-unit preference transient across reset', () => {
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const project = structuredClone(useAssembly.getState().projectDocument);

  useAssembly.getState().setUnit('cm');
  useAssembly.getState().reset();

  expect(useAssembly.getState().unit).toBe('cm');
  expect(useAssembly.getState().projectDocument).toEqual(project);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
});

it('measures exact canonical 3D points without changing the project or history', () => {
  useAssembly.getState().setMode('builder');
  useAssembly.setState({ historyPast: [], historyFuture: [] });
  const project = structuredClone(useAssembly.getState().projectDocument);

  useAssembly.getState().toggleMeasurement();
  useAssembly.getState().chooseMeasurementPoint({
    id: 'a',
    label: 'A',
    point: { x: 0, y: 0, z: 0 },
  });
  useAssembly.getState().chooseMeasurementPoint({
    id: 'b',
    label: 'B',
    point: { x: 300, y: 400, z: 1200 },
  });

  expect(useAssembly.getState().workbench.measurement?.result?.distanceMm).toBe(
    1300,
  );
  expect(useAssembly.getState().projectDocument).toEqual(project);
  expect(useAssembly.getState().historyPast).toHaveLength(0);
  useAssembly.getState().cancelMeasurement();
  expect(useAssembly.getState().workbench.measurement).toBeUndefined();
  useAssembly.getState().toggleMeasurement();
  useAssembly.getState().setViewPreset('materials');
  expect(useAssembly.getState().workbench.measurement).toBeUndefined();
  useAssembly.getState().toggleMeasurement();
  useAssembly.getState().beginRoofWindowPlacement();
  expect(useAssembly.getState().workbench.measurement).toBeUndefined();
  useAssembly.getState().toggleMeasurement();
  expect(useAssembly.getState().workbench.placementTool).toBeUndefined();
});

it('edits, clears and undoes the optional ridge depth canonically', () => {
  expect(useAssembly.getState().template.ridge.depthMm).toBeUndefined();
  useAssembly.setState({ historyPast: [], historyFuture: [] });

  useAssembly.getState().setField('ridge.depthMm', '22');
  expect(useAssembly.getState().template.ridge.depthMm).toBe(22);
  expect(
    useAssembly.getState().projectDocument.project.roof.ridge.depthMm,
  ).toBe(22);
  expect(useAssembly.getState().historyPast).toHaveLength(1);

  useAssembly.getState().undo();
  expect(useAssembly.getState().template.ridge.depthMm).toBeUndefined();
  useAssembly.getState().setField('ridge.depthMm', '22');
  useAssembly.getState().setField('ridge.depthMm', '');
  expect(useAssembly.getState().template.ridge.depthMm).toBeUndefined();
});
