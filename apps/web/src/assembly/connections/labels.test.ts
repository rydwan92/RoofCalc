import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import {
  createRoofSkeleton,
  resolveOpeningFramingSet,
} from '@cieslacalc/roof-math';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';
import { connectionsCopy, memberLabelText } from './copy';
import { memberLabelIndex } from './labels';
import { memberInstanceCode } from '../workbench';

const project = (name: string) =>
  (
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../fixtures/projects', name),
        'utf8',
      ),
    ) as { document: RoofProjectDocumentV1 }
  ).document.project;
const pl = connectionsCopy('pl');

describe('member labels', () => {
  it('number K1 like the schedule does, along the building per side', () => {
    const members = createRoofSkeleton(
      project('01-basic-gable.cieslacalc.json').roof,
    ).members;
    const labels = memberLabelIndex(members);
    for (const rafter of members.filter((member) => member.kind === 'rafter'))
      expect(memberLabelText(pl, labels.get(rafter.id))).toBe(
        `${memberInstanceCode(rafter.id)} (połać ${rafter.side === 'left' ? 'lewa' : 'prawa'})`,
      );
  });

  it('number J1 from their hip corner and name the corner', () => {
    const members = createRoofSkeleton(
      project('02-basic-hip.cieslacalc.json').roof,
    ).members;
    const labels = memberLabelIndex(members);
    const jacks = members.filter((member) => member.kind === 'jack-rafter');
    for (const jack of jacks) {
      const text = memberLabelText(pl, labels.get(jack.id));
      // Same J1-NN as the drawing HUD and the schedule.
      expect(text.startsWith(memberInstanceCode(jack.id))).toBe(true);
      expect(text).toMatch(/naroże (przednie|tylne) (lewe|prawe)\)$/);
    }
    // With the corner, every jack label is unique.
    expect(
      new Set(jacks.map((jack) => memberLabelText(pl, labels.get(jack.id))))
        .size,
    ).toBe(jacks.length);
  });

  it('give both pieces of an interrupted rafter the axis number of their rafter', () => {
    const p = project('04-hip-opening-framing.cieslacalc.json');
    const base = createRoofSkeleton(p.roof);
    const members = resolveOpeningFramingSet({
      template: p.roof,
      skeleton: base,
      features: p.features.filter(
        (feature): feature is RoofWindowFeature =>
          feature.kind === 'roof-window',
      ),
      framingSpecs: p.openingFraming,
    }).composedSkeleton.members;
    const labels = memberLabelIndex(members);
    const segments = members.filter(
      (member) => member.kind === 'rafter-segment',
    );
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      const text = memberLabelText(pl, labels.get(segment.id));
      expect(text.startsWith(memberInstanceCode(segment.sourceMemberId!))).toBe(
        true,
      );
      expect(text).toMatch(/odcinek (dolny|górny)\)$/);
    }
  });
});
