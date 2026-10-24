import { z } from 'zod';
import {
  roofProjectDocumentV1FromV2,
  roofProjectDocumentV1Schema,
  roofProjectDocumentV2Schema,
  type RoofProjectDocumentV1,
  type RoofProjectDocumentV2,
} from '@cieslacalc/calculator-core';

const nonBlank = z.string().trim().min(1);
const isoDate = z.string().datetime({ offset: true });

export const projectRecordV1Schema = z.object({
  schemaVersion: z.literal(1),
  id: nonBlank,
  name: nonBlank,
  createdAt: isoDate,
  updatedAt: isoDate,
  document: roofProjectDocumentV1Schema,
});

export type ProjectRecordV1 = z.infer<typeof projectRecordV1Schema>;

/**
 * VNext-10 (ADR-017): a project of several roof structures. Written only
 * when the document needs V2; a project of one roof in its own frame stays
 * a V1 record.
 */
export const projectRecordV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: nonBlank,
  name: nonBlank,
  createdAt: isoDate,
  updatedAt: isoDate,
  document: roofProjectDocumentV2Schema,
});
export type ProjectRecordV2 = z.infer<typeof projectRecordV2Schema>;

/** Every record a reader accepts. */
export const projectRecordSchema = z.discriminatedUnion('schemaVersion', [
  projectRecordV1Schema,
  projectRecordV2Schema,
]);
export type ProjectRecord = ProjectRecordV1 | ProjectRecordV2;
export type ProjectDocument = RoofProjectDocumentV1 | RoofProjectDocumentV2;

export type ProjectSummary = Pick<
  ProjectRecord,
  'id' | 'name' | 'createdAt' | 'updatedAt'
>;

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectRecord | undefined>;
  save(record: ProjectRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

/**
 * The document as it is saved: a V2 document that holds one structure in
 * its own frame goes back to V1, so a project of one roof never changes
 * format (ADR-017 §1).
 */
export function canonicalProjectDocument(
  document: ProjectDocument,
): ProjectDocument {
  if (document.schemaVersion === 1) return document;
  const single = roofProjectDocumentV1FromV2(document);
  return single.ok ? single.document : document;
}

/** A record of any version, holding a document of any version. */
export function createProjectRecordFor(
  document: ProjectDocument,
  name: string,
  id = newProjectId(),
  now = new Date().toISOString(),
): ProjectRecord {
  const canonical = canonicalProjectDocument(document);
  return projectRecordSchema.parse({
    schemaVersion: canonical.schemaVersion,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    document: structuredClone(canonical),
  });
}

/** The same record with another document (the version follows it). */
export function projectRecordWithDocument(
  record: ProjectRecord,
  document: ProjectDocument,
  now = new Date().toISOString(),
): ProjectRecord {
  const canonical = canonicalProjectDocument(document);
  return projectRecordSchema.parse({
    schemaVersion: canonical.schemaVersion,
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: now,
    document: structuredClone(canonical),
  });
}

export function projectSummary(record: ProjectRecord): ProjectSummary {
  const { id, name, createdAt, updatedAt } = record;
  return { id, name, createdAt, updatedAt };
}

export function sortProjectSummaries(
  items: ProjectSummary[],
): ProjectSummary[] {
  return [...items].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export function newProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function')
    return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function')
    globalThis.crypto.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createProjectRecord(
  document: RoofProjectDocumentV1,
  name: string,
  id = newProjectId(),
  now = new Date().toISOString(),
): ProjectRecordV1 {
  return projectRecordV1Schema.parse({
    schemaVersion: 1,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    document: structuredClone(document),
  });
}

export function renameProject<Record extends ProjectRecord>(
  record: Record,
  name: string,
  now = new Date().toISOString(),
): Record {
  return projectRecordSchema.parse({
    ...record,
    name,
    updatedAt: now,
  }) as Record;
}

export function duplicateProject<Record extends ProjectRecord>(
  record: Record,
  name: string,
  id = newProjectId(),
  now = new Date().toISOString(),
): Record {
  return projectRecordSchema.parse({
    ...structuredClone(record),
    id,
    name,
    createdAt: now,
    updatedAt: now,
  }) as Record;
}

export function nextProjectName(
  summaries: ProjectSummary[],
  prefix: string,
): string {
  const names = new Set(summaries.map((item) => item.name));
  let number = 1;
  while (names.has(`${prefix} ${number}`)) number++;
  return `${prefix} ${number}`;
}

export function exportProject(record: ProjectRecord): string {
  return JSON.stringify(projectRecordSchema.parse(record), null, 2);
}

export type ProjectImportErrorCode =
  'invalid-json' | 'unsupported-project-format';

export class ProjectImportError extends Error {
  override readonly name = 'ProjectImportError';

  constructor(readonly code: ProjectImportErrorCode) {
    super(code);
  }
}

export function importProject(
  serialized: string,
  options: {
    id?: string;
    now?: string;
    legacyName: string;
  },
): ProjectRecord {
  const id = options.id ?? newProjectId();
  const now = options.now ?? new Date().toISOString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ProjectImportError('invalid-json');
  }
  const archive = projectRecordSchema.safeParse(parsed);
  if (archive.success)
    return createProjectRecordFor(
      archive.data.document,
      archive.data.name,
      id,
      now,
    );
  const document = roofProjectDocumentV1Schema.safeParse(parsed);
  if (document.success)
    return createProjectRecord(document.data, options.legacyName, id, now);
  // VNext-10: a bare V2 document (several structures) too.
  const structures = roofProjectDocumentV2Schema.safeParse(parsed);
  if (structures.success)
    return createProjectRecordFor(structures.data, options.legacyName, id, now);
  throw new ProjectImportError('unsupported-project-format');
}
