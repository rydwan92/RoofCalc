// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRoofProjectDocument } from '@cieslacalc/calculator-core';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { IfcRoofConfirmation } from './IfcRoofConfirmation';
import type { IfcReferenceModel } from './ifc-runtime-types';
import i18n from '../../i18n';
import {
  createDefaultProjectDocument,
  useAssembly,
} from '../../assembly/store';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
} from '../../assembly/project-start';

const candidate = {
  expressId: 77,
  name: 'Selected roof',
  sourceClass: 'IfcRoof',
  evidence: [],
};
function model(): IfcReferenceModel {
  const h = 4 * Math.tan((35 * Math.PI) / 180);
  return {
    summary: {
      metadata: {
        fileName: 'model.ifc',
        fileSize: 10,
        schema: 'IFC4',
        sourceLengthUnit: 'METRE',
        sourceToMillimetres: 1000,
        sourceCoordinationMatrix: [],
      },
      elements: [],
      roofCandidates: [candidate],
      spatialNodes: [],
      issues: [],
    },
    meshes: [],
    displayOrigin: [123, 456, 789],
    analysisGeometry: {
      77: [
        {
          positions: [
            -4,
            -6,
            0,
            0,
            -6,
            h,
            0,
            6,
            h,
            -4,
            6,
            0,
            4,
            -6,
            0,
            4,
            6,
            0,
          ],
          indices: [0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2],
        },
      ],
    },
  };
}
beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

it('requires explicit confirmation, shares manual creation and blocks duplicate submits', async () => {
  const onCreate = vi.fn<(template: RoofTemplateSpec) => Promise<void>>(
    () => new Promise<void>(() => undefined),
  );
  const stateBefore = useAssembly.getState().projectDocument;
  render(
    <IfcRoofConfirmation
      model={model()}
      candidate={candidate}
      onCreate={onCreate}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Analyze roof' }));
  expect(onCreate).not.toHaveBeenCalled();
  const create = screen.getByRole('button', {
    name: 'Create RoofCalc project',
  }) as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  const input = screen.getByTestId('ifc-buildingLength');
  fireEvent.change(input, { target: { value: '13500' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(create);
  fireEvent.click(create);
  expect(onCreate).toHaveBeenCalledTimes(1);
  const base = createDefaultProjectDocument().project.roof;
  const manual = createProjectStartTemplate(
    {
      ...projectStartValuesFromTemplate(base),
      roofType: 'gable',
      buildingLengthMm: 13500,
      buildingWidthMm: 8000,
      pitchDeg: Number(
        (screen.getByTestId('ifc-pitch') as HTMLInputElement).value,
      ),
    },
    base,
  );
  expect(createRoofProjectDocument(onCreate.mock.calls[0]![0]!)).toEqual(
    createRoofProjectDocument(manual),
  );
  expect(useAssembly.getState().projectDocument).toBe(stateBefore);
});

it('invalid input and edits revoke confirmation; persistence failure is recoverable', async () => {
  const onCreate = vi.fn(async () => {
    throw new Error('storage unavailable');
  });
  render(
    <IfcRoofConfirmation
      model={model()}
      candidate={candidate}
      onCreate={onCreate}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Analyze roof' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByTestId('ifc-pitch'), {
    target: { value: 'NaN' },
  });
  const create = screen.getByRole('button', {
    name: 'Create RoofCalc project',
  }) as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent.change(screen.getByTestId('ifc-pitch'), {
    target: { value: '35,5' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(create);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'could not be saved',
    ),
  );
  expect(create.disabled).toBe(false);
});

it('unknown source units block confirmation despite valid geometry', () => {
  const data = model();
  delete data.summary.metadata.sourceToMillimetres;
  render(
    <IfcRoofConfirmation
      model={data}
      candidate={candidate}
      onCreate={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Analyze roof' }));
  expect(screen.getByRole('alert').textContent).toContain('unit is unknown');
  expect(
    screen.queryByRole('button', { name: 'Create RoofCalc project' }),
  ).toBeNull();
});
