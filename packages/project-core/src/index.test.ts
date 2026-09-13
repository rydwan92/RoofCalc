import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import {
  createProjectRecord,
  duplicateProject,
  exportProject,
  importProject,
  nextProjectName,
  projectRecordV1Schema,
  projectSummary,
  renameProject,
  type ProjectRepository,
} from './index';

const document = createRoofProjectDocument(
  gableTemplateFromAssembly(assemblyDefaults),
);
const now = '2026-09-13T12:00:00.000Z';
const record = createProjectRecord(document, 'Dach domu', 'project-1', now);

describe('project lifecycle contract', () => {
  it('validates a separate envelope and preserves the nested technical document', () => {
    const parsed = projectRecordV1Schema.parse(
      JSON.parse(exportProject(record)),
    );
    expect(parsed.document).toEqual(document);
    expect(parsed.document).not.toHaveProperty('name');
    expect(parsed.document).not.toHaveProperty('updatedAt');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.document.schemaVersion).toBe(1);
  });

  it('rejects empty identity/name, invalid timestamp and unsupported envelope version', () => {
    expect(projectRecordV1Schema.safeParse({ ...record, id: '' }).success).toBe(
      false,
    );
    expect(
      projectRecordV1Schema.safeParse({ ...record, name: '  ' }).success,
    ).toBe(false);
    expect(
      projectRecordV1Schema.safeParse({ ...record, createdAt: 'yesterday' })
        .success,
    ).toBe(false);
    expect(
      projectRecordV1Schema.safeParse({ ...record, schemaVersion: 2 }).success,
    ).toBe(false);
  });

  it('renames without changing identity or geometry and duplicates into a deep copy', () => {
    const renamed = renameProject(
      record,
      '  Nowa nazwa  ',
      '2026-09-14T00:00:00.000Z',
    );
    expect(renamed.id).toBe(record.id);
    expect(renamed.name).toBe('Nowa nazwa');
    expect(renamed.document).toEqual(record.document);
    const duplicate = duplicateProject(
      record,
      'Dach domu — copy',
      'project-2',
      now,
    );
    expect(duplicate.id).toBe('project-2');
    expect(duplicate.name).toBe('Dach domu — copy');
    expect(duplicate.document).toEqual(document);
    expect(duplicate.document).not.toBe(record.document);
  });

  it('imports archive or bare legacy document under a new local ID', () => {
    const archive = importProject(exportProject(record), {
      id: 'new-id',
      now,
      legacyName: 'Imported project',
    });
    expect(archive.id).toBe('new-id');
    expect(archive.document).toEqual(document);
    const legacy = importProject(JSON.stringify(document), {
      id: 'legacy-id',
      now,
      legacyName: 'Imported project',
    });
    expect(legacy.id).toBe('legacy-id');
    expect(legacy.document).toEqual(document);
    expect(() =>
      importProject('{broken', { legacyName: 'Imported project' }),
    ).toThrowError('invalid-json');
    expect(() =>
      importProject('{"schemaVersion":99}', {
        legacyName: 'Imported project',
      }),
    ).toThrowError('unsupported-project-format');
  });

  it('keeps repository contract async and lists metadata without geometry', async () => {
    const records = new Map([[record.id, record]]);
    const repository: ProjectRepository = {
      list: async () => [...records.values()].map(projectSummary),
      get: async (id) => records.get(id),
      save: async (item) => {
        records.set(item.id, item);
      },
      delete: async (id) => {
        records.delete(id);
      },
    };
    expect(await repository.list()).toEqual([projectSummary(record)]);
    expect(await repository.get(record.id)).toEqual(record);
    await repository.delete(record.id);
    expect(await repository.get(record.id)).toBeUndefined();
    expect(nextProjectName([projectSummary(record)], 'Project')).toBe(
      'Project 1',
    );
  });
});
