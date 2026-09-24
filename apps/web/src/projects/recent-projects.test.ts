// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { recentProjects, rememberProjectVisit } from './recent-projects';
import type { ProjectSummary } from '@cieslacalc/project-core';
const projects: ProjectSummary[] = [
  {
    id: 'older',
    name: 'Older',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'newer',
    name: 'Newer',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('orders visits ahead of edits, ignores deleted projects and does not mutate records', () => {
  const original = JSON.stringify(projects);
  expect(recentProjects(projects).map((project) => project.id)).toEqual([
    'newer',
    'older',
  ]);
  rememberProjectVisit('older');
  rememberProjectVisit('deleted');
  expect(recentProjects(projects).map((project) => project.id)).toEqual([
    'older',
    'newer',
  ]);
  rememberProjectVisit('newer');
  expect(recentProjects(projects).map((project) => project.id)).toEqual([
    'newer',
    'older',
  ]);
  expect(JSON.stringify(projects)).toBe(original);
});
it('survives unavailable or malformed local preferences', () => {
  localStorage.setItem('cieslacalc.recentProjects.v1', '{invalid');
  expect(recentProjects(projects)[0]?.id).toBe('newer');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(() => rememberProjectVisit('older')).not.toThrow();
});
