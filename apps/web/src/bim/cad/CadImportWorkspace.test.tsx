// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import i18n from '../../i18n';
import { useAssembly } from '../../assembly/store';
import { CadImportWorkspace } from './CadImportWorkspace';

const fixture = readFileSync(
  resolve(__dirname, '../../../../../fixtures/cad/hip-12x8-eave-50.dxf'),
  'utf8',
);

/** jsdom's Blob lacks text()/arrayBuffer(); the importer needs both. */
function fileOf(text: string, name: string): File {
  const bytes = new TextEncoder().encode(text);
  const file = new File([bytes], name);
  Object.defineProperty(file, 'text', { value: async () => text });
  Object.defineProperty(file, 'slice', {
    value: (start = 0, end = bytes.length) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
  });
  return file;
}

beforeEach(async () => {
  useAssembly.getState().reset();
  useAssembly.getState().setUnit('cm');
  await i18n.changeLanguage('pl');
});
afterEach(cleanup);

describe('CAD (DXF) plan import', () => {
  it('reads a hip plan with walls and eave outlines, asks for confirmation, creates the start template', async () => {
    const onCreate = vi.fn(async (_template: RoofTemplateSpec) => {});
    render(
      <CadImportWorkspace
        initialFile={fileOf(fixture, 'dom-kopertowy.dxf')}
        onClose={() => {}}
        onCreate={onCreate}
      />,
    );
    const form = await screen.findByTestId(
      'cad-confirmation',
      {},
      { timeout: 5000 },
    );
    expect(screen.getByTestId('cad-preview')).toBeTruthy();
    expect(
      screen.getByTestId('cad-roof-hip').getAttribute('aria-pressed'),
    ).toBe('true');
    const value = (id: string) =>
      (screen.getByTestId(id) as HTMLInputElement).value;
    expect(value('cad-buildingLength')).toBe('1200');
    expect(value('cad-buildingWidth')).toBe('800');
    expect(value('cad-eave')).toBe('50');
    expect(value('cad-pitch')).toBe('35');
    expect(form.textContent).toContain('Z dwóch obrysów');
    expect(form.textContent).toContain('potwierdzone wymiarem');
    // Nothing is created before the user confirms.
    const create = screen.getByTestId('cad-create') as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cad-confirm'));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);
    const [template, name] = onCreate.mock.calls[0]! as unknown as [
      RoofTemplateSpec,
      string,
    ];
    expect(name).toBe('Projekt z dom-kopertowy');
    expect(template).toMatchObject({
      type: 'hip',
      buildingLengthMm: 12000,
      halfRunMm: 4000,
      pitchDeg: 35,
      eaveOverhangMm: 500,
    });
  });

  it('infers a missing unit from a plausible building size and says so', async () => {
    const unitless = fixture.replace(/\$INSUNITS(\r?\n)70\r?\n4/, (_, eol) =>
      ['$INSUNITS', '70', '0'].join(eol),
    );
    render(
      <CadImportWorkspace
        initialFile={fileOf(unitless, 'plan.dxf')}
        onClose={() => {}}
        onCreate={async () => {}}
      />,
    );
    await screen.findByTestId('cad-confirmation', {}, { timeout: 5000 });
    expect(screen.getByTestId('cad-unit').textContent).toContain(
      'przyjęta — sprawdź',
    );
    expect(screen.getByTestId('cad-warnings').textContent).toContain(
      'nie podaje jednostek',
    );
    expect(
      (screen.getByTestId('cad-buildingLength') as HTMLInputElement).value,
    ).toBe('1200');
  });

  it('explains a DWG instead of failing silently', async () => {
    render(
      <CadImportWorkspace
        initialFile={fileOf('AC1032 binary drawing', 'plan.dwg')}
        onClose={() => {}}
        onCreate={async () => {}}
      />,
    );
    const error = await screen.findByTestId('cad-error', {}, { timeout: 5000 });
    expect(error.textContent).toContain('Zapisz rysunek jako DXF');
  });
});
