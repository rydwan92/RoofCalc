import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type {
  ImportIntakeReport,
  IntakeReviewState,
  IntakeValueKey,
} from '../assembly/project-preparation';

/**
 * VNext-6.1 import evidence — the minimum a project needs to keep showing
 * "z dokumentu / wpisane / wartość domyślna RoofCalc" and what the user
 * explicitly confirmed, after a reload or reopening.
 *
 * A project-owned sidecar (like the cost estimate): outside
 * `RoofProjectDocumentV1` and `ProjectRecordV1`, so the technical document,
 * its exports and its fingerprint are unchanged, and roof Undo/Redo never
 * touches it. It holds NO document content: no file bytes, no text, no
 * page image — the file name, the device-computed fingerprint, where each
 * start value came from, the values at creation and the review state.
 * Stored only in this browser; removed with the project.
 */

const KEYS = [
  'buildingLength',
  'buildingWidth',
  'pitch',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
] as const satisfies readonly IntakeValueKey[];

const key = z.enum(KEYS);
const finite = z.number().finite();
const isoDate = z.string().datetime({ offset: true });

export const importEvidenceV1Schema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(['pdf', 'image', 'dxf', 'ifc']),
  fileName: z.string().min(1).max(260),
  fingerprint: z
    .string()
    .regex(/^[0-9a-f]{8,128}$/i)
    .optional(),
  importedAt: isoDate,
  values: z.record(key, z.enum(['document', 'user', 'roofcalc-default'])),
  /** The project-start values the project was created with. */
  startValues: z.record(key, finite),
  pagesRead: z.number().int().min(0).max(1000).optional(),
  pagesSkipped: z.number().int().min(0).max(1000).optional(),
  readMs: z.number().min(0).max(3_600_000).optional(),
  review: z.object({
    opened: z.boolean(),
    confirmed: z.record(key, finite),
    confirmedAt: isoDate.optional(),
  }),
});

export type ImportEvidenceV1 = z.infer<typeof importEvidenceV1Schema>;

export function createImportEvidence(input: {
  report: ImportIntakeReport;
  startValues: Partial<Record<IntakeValueKey, number>>;
  now?: string;
}): ImportEvidenceV1 {
  const { report } = input;
  return importEvidenceV1Schema.parse({
    schemaVersion: 1,
    source: report.source,
    fileName: report.fileName.slice(0, 260) || 'dokument',
    ...(report.fingerprint && /^[0-9a-f]{8,128}$/i.test(report.fingerprint)
      ? { fingerprint: report.fingerprint }
      : {}),
    importedAt: input.now ?? new Date().toISOString(),
    values: report.values,
    startValues: input.startValues,
    ...(report.pagesRead !== undefined ? { pagesRead: report.pagesRead } : {}),
    ...(report.pagesSkipped !== undefined
      ? { pagesSkipped: report.pagesSkipped }
      : {}),
    ...(report.readMs !== undefined ? { readMs: report.readMs } : {}),
    review: { opened: false, confirmed: {} },
  });
}

/** The report shape the preparation card reads. */
export function evidenceReport(evidence: ImportEvidenceV1): ImportIntakeReport {
  return {
    source: evidence.source,
    fileName: evidence.fileName,
    ...(evidence.fingerprint ? { fingerprint: evidence.fingerprint } : {}),
    values: evidence.values,
    ...(evidence.pagesRead !== undefined
      ? { pagesRead: evidence.pagesRead }
      : {}),
    ...(evidence.pagesSkipped !== undefined
      ? { pagesSkipped: evidence.pagesSkipped }
      : {}),
    ...(evidence.readMs !== undefined ? { readMs: evidence.readMs } : {}),
  };
}

export function withReview(
  evidence: ImportEvidenceV1,
  review: IntakeReviewState,
  now = new Date().toISOString(),
): ImportEvidenceV1 {
  const confirmedChanged =
    JSON.stringify(review.confirmed) !==
    JSON.stringify(evidence.review.confirmed);
  return {
    ...evidence,
    review: {
      opened: review.opened,
      confirmed: review.confirmed,
      ...(confirmedChanged
        ? { confirmedAt: now }
        : evidence.review.confirmedAt
          ? { confirmedAt: evidence.review.confirmedAt }
          : {}),
    },
  };
}

const namespace = 'cieslacalc.importEvidence.v1';
const recordKey = (projectId: string) => `${namespace}.${projectId}`;

type EvidenceStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

function browserStorage(): EvidenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export class LocalImportEvidenceRepository {
  constructor(
    private readonly storage: EvidenceStorage | undefined = browserStorage(),
  ) {}

  get(projectId: string): ImportEvidenceV1 | undefined {
    try {
      const raw = this.storage?.getItem(recordKey(projectId));
      if (!raw) return undefined;
      const parsed = importEvidenceV1Schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  /** Never throws: evidence is helpful context, not project data. */
  save(projectId: string, evidence: ImportEvidenceV1): boolean {
    try {
      this.storage?.setItem(
        recordKey(projectId),
        JSON.stringify(importEvidenceV1Schema.parse(evidence)),
      );
      return !!this.storage;
    } catch {
      return false;
    }
  }

  delete(projectId: string): void {
    try {
      this.storage?.removeItem(recordKey(projectId));
    } catch {
      /* Storage unavailable: nothing to remove. */
    }
  }

  /** Removes evidence of projects that no longer exist. */
  prune(existingIds: readonly string[]): void {
    const storage = this.storage;
    if (!storage) return;
    const keep = new Set(existingIds.map(recordKey));
    const stale: string[] = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const name = storage.key(index);
        if (name?.startsWith(`${namespace}.`) && !keep.has(name))
          stale.push(name);
      }
      for (const name of stale) storage.removeItem(name);
    } catch {
      /* Storage unavailable: nothing to prune. */
    }
  }
}

/**
 * The evidence of the active project. `save(projectId, …)` names the
 * project explicitly, so an import that has just created a new record
 * cannot write onto the previous one.
 */
export function useImportEvidence(
  projectId: string | undefined,
): [
  ImportEvidenceV1 | undefined,
  (projectId: string, evidence: ImportEvidenceV1) => void,
] {
  const repository = useRef(new LocalImportEvidenceRepository());
  const current = useRef(projectId);
  const [evidence, setEvidence] = useState<ImportEvidenceV1>();
  useEffect(() => {
    current.current = projectId;
    setEvidence(projectId ? repository.current.get(projectId) : undefined);
  }, [projectId]);
  const save = useCallback((id: string, next: ImportEvidenceV1) => {
    repository.current.save(id, next);
    if (current.current === id) setEvidence(next);
  }, []);
  return [evidence, save];
}
