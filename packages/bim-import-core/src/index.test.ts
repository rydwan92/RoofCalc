import { describe, expect, it } from 'vitest';
import {
  classifyIfcElement,
  discoverRoofCandidates,
  siLengthUnitToMillimetres,
  validateIfcFile,
} from './index';

describe('IFC reference semantics', () => {
  it('normalizes declared SI length units', () => {
    expect(siLengthUnitToMillimetres('METRE')).toBe(1000);
    expect(siLengthUnitToMillimetres('METRE', 'MILLI')).toBe(1);
    expect(siLengthUnitToMillimetres('METRE', 'CENTI')).toBe(10);
  });

  it('discovers explicit roofs, including roof slabs, without promoting proxies', () => {
    const elements = [
      {
        expressId: 1,
        ifcClass: 'IfcRoof',
        group: classifyIfcElement('IfcRoof'),
      },
      {
        expressId: 2,
        ifcClass: 'IfcSlab',
        predefinedType: 'ROOF',
        group: classifyIfcElement('IfcSlab', 'ROOF'),
      },
      {
        expressId: 3,
        ifcClass: 'IfcBuildingElementProxy',
        group: classifyIfcElement('IfcBuildingElementProxy'),
      },
      {
        expressId: 4,
        ifcClass: 'IfcCovering',
        group: classifyIfcElement('IfcCovering'),
      },
    ];
    expect(
      discoverRoofCandidates(elements).map(({ expressId }) => expressId),
    ).toEqual([1, 2]);
  });

  it('rejects empty, non-IFC and oversized files', () => {
    expect(validateIfcFile('roof.ifc', 0)).toBe('invalid-ifc');
    expect(validateIfcFile('roof.zip', 10)).toBe('invalid-ifc');
    expect(validateIfcFile('roof.ifc', 101 * 1024 * 1024)).toBe(
      'file-too-large',
    );
  });
});
