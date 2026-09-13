import { z } from 'zod';
import {
  roofProjectDocumentV1Schema,
  type RoofProjectDocumentV1,
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
export type ProjectSummary = Pick<
  ProjectRecordV1,
  'id' | 'name' | 'createdAt' | 'updatedAt'
>;

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectRecordV1 | undefined>;
  save(record: ProjectRecordV1): Promise<void>;
  delete(id: string): Promise<void>;
}

export function projectSummary(record: ProjectRecordV1): ProjectSummary {
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

export function renameProject(
  record: ProjectRecordV1,
  name: string,
  now = new Date().toISOString(),
): ProjectRecordV1 {
  return projectRecordV1Schema.parse({ ...record, name, updatedAt: now });
}

export function duplicateProject(
  record: ProjectRecordV1,
  id = newProjectId(),
  now = new Date().toISOString(),
): ProjectRecordV1 {
  return createProjectRecord(
    record.document,
    `${record.name} — kopia`,
    id,
    now,
  );
}

export function nextProjectName(summaries: ProjectSummary[]): string {
  const names = new Set(summaries.map((item) => item.name));
  let number = 1;
  while (names.has(`Projekt ${number}`)) number++;
  return `Projekt ${number}`;
}

export function exportProject(record: ProjectRecordV1): string {
  return JSON.stringify(projectRecordV1Schema.parse(record), null, 2);
}

export function importProject(
  serialized: string,
  id = newProjectId(),
  now = new Date().toISOString(),
): ProjectRecordV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Niepoprawny plik JSON.');
  }
  const archive = projectRecordV1Schema.safeParse(parsed);
  if (archive.success)
    return createProjectRecord(
      archive.data.document,
      archive.data.name,
      id,
      now,
    );
  const document = roofProjectDocumentV1Schema.safeParse(parsed);
  if (document.success)
    return createProjectRecord(document.data, 'Importowany projekt', id, now);
  throw new Error('Nieobsługiwany lub uszkodzony format projektu.');
}
