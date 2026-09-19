import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogImportBatchV1Schema } from '@cieslacalc/catalog-core';
import {
  roofSystemComponentTechnicalSpecSchema,
  roofWindowComponentTechnicalSpecSchema,
} from '@cieslacalc/roof-system-core';
import { CatalogImporter } from './importer';
import { MemoryCatalogRepository } from './memory-repository';

/**
 * V52 roof-system catalogue: swissporTON ridge tape and ridge starter as
 * `roof-system-component`, and a first VELUX slice (two sizes, EDW/EDS
 * flashings) as `roof-window-component`. Compatibility is structural; values
 * exist only where the source states them; no prices are seeded.
 */
const read = (file: string) =>
  catalogImportBatchV1Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(`../data/import-batches/${file}`, import.meta.url),
        'utf8',
      ),
    ),
  );
const batch = read('roof-system-2026-09-v52.json');

describe('V52 roof-system catalogue', () => {
  it('seeds twice with no conflict and no drift, next to the V50 tiles', async () => {
    const repository = new MemoryCatalogRepository();
    const importer = new CatalogImporter(repository);
    await importer.import(read('tiles-commercial-2026-09-v50.json'), {
      apply: true,
    });
    for (const pass of [1, 2]) {
      const report = await importer.import(batch, { apply: true });
      expect(report.status).toBe('applied');
      expect(report.revisions.conflicts).toBe(0);
      if (pass === 2) {
        expect(report.revisions.new).toBe(0);
        expect(report.products.updated).toBe(0);
      }
    }
    const system = await repository.searchProducts({
      kind: 'roof-system-component',
      limit: 50,
      offset: 0,
    });
    expect(system.items).toHaveLength(3);
    const windows = await repository.searchProducts({
      kind: 'roof-window-component',
      limit: 50,
      offset: 0,
    });
    expect(windows.items).toHaveLength(6);
  });

  it('ridge tape states only its roll length; the rule is roll purchase', () => {
    const tapes = batch.revisions
      .map((revision) => revision.technicalSpec)
      .filter((spec) => spec.kind === 'roof-system-component')
      .map((spec) => roofSystemComponentTechnicalSpecSchema.parse(spec))
      .filter((spec) => spec.role === 'ridge-tape');
    expect(tapes).toHaveLength(2);
    for (const tape of tapes) {
      expect(tape.rollLengthMm).toBe(5000);
      expect(tape.quantityRule).toBe('roll-length');
      expect(tape.effectiveCoverLengthMm).toBeUndefined();
      expect(tape.compatibility.scope).toBe('covering-products');
    }
  });

  it('the ridge starter declares no quantity rule (the user confirms it)', () => {
    const starter = batch.revisions
      .map((revision) => revision.technicalSpec)
      .filter((spec) => spec.kind === 'roof-system-component')
      .map((spec) => roofSystemComponentTechnicalSpecSchema.parse(spec))
      .find((spec) => spec.role === 'ridge-end');
    expect(starter?.quantityRule).toBeUndefined();
  });

  it('flashing kits carry explicit system, size, covering and pitch facts', () => {
    const specs = batch.revisions
      .map((revision) => revision.technicalSpec)
      .filter((spec) => spec.kind === 'roof-window-component')
      .map((spec) => roofWindowComponentTechnicalSpecSchema.parse(spec));
    const kits = specs.filter((spec) => spec.role === 'window-flashing-kit');
    expect(kits).toHaveLength(4);
    for (const kit of kits) {
      expect(kit.windowSystemKey).toBe('velux-pitched');
      expect(kit.pitchRangeDeg).toEqual({ min: 15, max: 90 });
      expect(kit.covering).toBeDefined();
    }
    const windows = specs.filter((spec) => spec.role === 'roof-window');
    expect(
      windows.map((spec) => [
        spec.sizeCode,
        spec.nominalWidthMm,
        spec.nominalHeightMm,
      ]),
    ).toEqual([
      ['MK04', 780, 980],
      ['MK06', 780, 1180],
    ]);
  });

  it('every revision cites an official manufacturer page', () => {
    for (const revision of batch.revisions)
      expect(revision.source?.url).toMatch(
        /^https:\/\/(www\.swissporton\.pl|www\.velux\.pl|materialy\.velux\.pl)\//,
      );
  });
});
