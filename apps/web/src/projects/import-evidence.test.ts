import { describe, expect, it } from 'vitest';
import {
  createImportEvidence,
  evidenceReport,
  LocalImportEvidenceRepository,
  withReview,
} from './import-evidence';
import { MemoryStorage } from './memory-storage';
import type { ImportIntakeReport } from '../assembly/project-preparation';

const REPORT: ImportIntakeReport = {
  source: 'pdf',
  fileName: 'projekt-domu.pdf',
  fingerprint: 'a'.repeat(64),
  values: {
    buildingLength: 'document',
    spacing: 'roofcalc-default',
  },
  pagesRead: 3,
  pagesSkipped: 1,
  readMs: 112,
};
const START = { buildingLength: 12_400, spacing: 800 };
const NOW = '2026-10-21T20:00:00.000Z';

describe('VNext-6.1 import evidence sidecar', () => {
  it('keeps only provenance — never document content', () => {
    const evidence = createImportEvidence({
      report: REPORT,
      startValues: START,
      now: NOW,
    });
    expect(evidence).toEqual({
      schemaVersion: 1,
      source: 'pdf',
      fileName: 'projekt-domu.pdf',
      fingerprint: 'a'.repeat(64),
      importedAt: NOW,
      values: { buildingLength: 'document', spacing: 'roofcalc-default' },
      startValues: START,
      pagesRead: 3,
      pagesSkipped: 1,
      readMs: 112,
      review: { opened: false, confirmed: {} },
    });
    expect(evidenceReport(evidence)).toEqual(REPORT);
  });

  it('round-trips through storage and survives a reload', () => {
    const storage = new MemoryStorage();
    const repository = new LocalImportEvidenceRepository(storage);
    const evidence = withReview(
      createImportEvidence({ report: REPORT, startValues: START, now: NOW }),
      { opened: true, confirmed: { spacing: 800 } },
      NOW,
    );
    expect(repository.save('project-1', evidence)).toBe(true);
    expect(new LocalImportEvidenceRepository(storage).get('project-1')).toEqual(
      {
        ...evidence,
        review: { opened: true, confirmed: { spacing: 800 }, confirmedAt: NOW },
      },
    );
  });

  it('ignores damaged or foreign data instead of trusting it', () => {
    const storage = new MemoryStorage();
    storage.setItem('cieslacalc.importEvidence.v1.p', '{"schemaVersion":2}');
    storage.setItem('cieslacalc.importEvidence.v1.q', 'not json');
    const repository = new LocalImportEvidenceRepository(storage);
    expect(repository.get('p')).toBeUndefined();
    expect(repository.get('q')).toBeUndefined();
    // Extra keys (e.g. someone storing page text) are stripped by the schema.
    const evidence = createImportEvidence({
      report: REPORT,
      startValues: START,
      now: NOW,
    });
    repository.save('r', { ...evidence, text: 'secret' } as typeof evidence);
    expect(storage.getItem('cieslacalc.importEvidence.v1.r')).not.toContain(
      'secret',
    );
  });

  it('removes the evidence of deleted projects', () => {
    const storage = new MemoryStorage();
    const repository = new LocalImportEvidenceRepository(storage);
    const evidence = createImportEvidence({
      report: REPORT,
      startValues: START,
      now: NOW,
    });
    repository.save('kept', evidence);
    repository.save('deleted', evidence);
    storage.setItem('unrelated', 'x');
    repository.prune(['kept']);
    expect(repository.get('kept')).toBeDefined();
    expect(repository.get('deleted')).toBeUndefined();
    expect(storage.getItem('unrelated')).toBe('x');
  });

  it('never throws when the browser storage refuses to write', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    };
    const repository = new LocalImportEvidenceRepository(full);
    expect(
      repository.save(
        'p',
        createImportEvidence({ report: REPORT, startValues: START, now: NOW }),
      ),
    ).toBe(false);
  });
});
