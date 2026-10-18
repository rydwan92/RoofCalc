import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RoofProjectDocumentV1 } from '@cieslacalc/calculator-core';
import { nodesOfKind } from '@cieslacalc/connection-core';
import { createRoofSkeleton } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec, SupportSpec } from '@cieslacalc/timber-model';
import { structuralLimitations } from '../project-readiness';
import { roofConnectionModel } from './census';

/**
 * VNext-3 result integrity: an unresolved joint the structure really has
 * reaches the documents through the existing limitation facts — counted
 * where the member axes meet, absent when it does not occur.
 */
const project = (name: string) =>
  (
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../fixtures/projects', name),
        'utf8',
      ),
    ) as { document: RoofProjectDocumentV1 }
  ).document.project;

const k1 = { status: 'resolved' } as Parameters<
  typeof structuralLimitations
>[0]['k1'];

describe('structural limitations from located nodes', () => {
  it('a hip roof with a purlin states its unresolved J1 notches and purlin ends', () => {
    const p = project('02-basic-hip.cieslacalc.json');
    const roof = {
      ...p.roof,
      intermediateSupports: [
        {
          ...structuredClone(p.roof.wallPlate),
          id: 'support:purlin-1',
          kind: 'purlin',
          section: { widthMm: 140, heightMm: 160 },
          placement: { mode: 'horizontal-from-wall', xMm: 1500 },
        } as SupportSpec,
      ],
    } as RoofTemplateSpec;
    const { projection } = roofConnectionModel({
      template: roof,
      members: createRoofSkeleton(roof).members,
      buildUp: p.buildUp,
    });
    const jackPurlin = nodesOfKind(projection, 'jack-rafter-purlin').length;
    const purlinHip = nodesOfKind(projection, 'purlin-hip-rafter').length;
    expect(jackPurlin).toBeGreaterThan(0);
    expect(
      structuralLimitations({
        template: roof,
        k1,
        connectionNodes: { jackPurlin, purlinHip },
      }),
    ).toEqual(
      expect.arrayContaining([
        {
          code: 'jack-purlin-joinery-unresolved',
          params: { count: jackPurlin },
        },
        { code: 'purlin-hip-joint-unresolved', params: { count: 4 } },
      ]),
    );
  });

  it('says nothing about joints the roof does not have', () => {
    const p = project('02-basic-hip.cieslacalc.json');
    const codes = structuralLimitations({
      template: p.roof,
      k1,
      connectionNodes: { jackPurlin: 0, purlinHip: 0 },
    }).map((item) => item.code);
    expect(codes).not.toContain('jack-purlin-joinery-unresolved');
    expect(codes).not.toContain('purlin-hip-joint-unresolved');
  });
});
