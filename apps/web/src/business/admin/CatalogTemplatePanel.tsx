import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import type { CatalogProductDetail } from '@cieslacalc/catalog-core';
import type { CatalogClient } from '../../catalog/client';
import { catalogTemplateCsv } from './catalog-template';

const copy = {
  pl: {
    title: 'Szablon asortymentu z katalogu RoofCalc',
    intro:
      'Pobierz listę produktów wybranego producenta z ID RoofCalc. Uzupełnij swój kod i cenę netto, a potem wczytaj plik przez „Importuj” — pozycje połączą się z katalogiem automatycznie, bez ręcznego dopasowania.',
    manufacturer: 'Producent',
    choose: '— wybierz —',
    download: 'Pobierz szablon CSV',
    busy: 'Przygotowywanie szablonu…',
    done: (rows: number) =>
      `Pobrano szablon: ${rows} ${rows === 1 ? 'pozycja' : 'pozycji'}.`,
    without: (names: string) =>
      `Bez wariantu handlowego (dodaj je ręcznie, jeśli je sprzedajesz): ${names}.`,
    steps: [
      'Wpisz swój kod w kolumnie „Kod” i cenę w „Cena netto” (VAT opcjonalnie).',
      'Usuń wiersze, których nie sprzedajesz.',
      'Wczytaj plik przez „Importuj” i sprawdź podgląd.',
    ],
    unavailable: 'Katalog jest niedostępny — szablonu nie można teraz pobrać.',
    close: 'Zamknij',
    failed: 'Nie udało się pobrać produktów z katalogu.',
  },
  en: {
    title: 'Assortment template from the RoofCalc catalogue',
    intro:
      "Download the chosen manufacturer's products with their RoofCalc IDs. Fill in your code and net price, then load the file with “Import” — the rows link to the catalogue automatically, with no manual matching.",
    manufacturer: 'Manufacturer',
    choose: '— choose —',
    download: 'Download CSV template',
    busy: 'Preparing the template…',
    done: (rows: number) => `Template downloaded: ${rows} rows.`,
    without: (names: string) =>
      `Without a commercial variant (add them manually if you sell them): ${names}.`,
    steps: [
      'Enter your code in “Kod” and your price in “Cena netto” (VAT optional).',
      'Delete the rows you do not sell.',
      'Load the file with “Import” and check the preview.',
    ],
    unavailable: 'The catalogue is unavailable — the template cannot be downloaded now.',
    close: 'Close',
    failed: 'The catalogue products could not be loaded.',
  },
};

/**
 * Every product of one manufacturer, page by page (the API caps at 50).
 * Only products with commercial variants are fetched in detail.
 */
async function manufacturerProducts(
  catalog: CatalogClient,
  manufacturerId: string,
): Promise<{ details: CatalogProductDetail[]; without: string[] }> {
  const ids: string[] = [];
  const without: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await catalog.searchProducts({
      manufacturerId,
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of result.items)
      if (item.variantCount > 0) ids.push(item.id);
      else without.push(`${item.manufacturer.name} ${item.name}`);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return {
    details: await Promise.all(ids.map((id) => catalog.getProduct(id))),
    without,
  };
}

export function CatalogTemplatePanel({
  catalog,
  onClose,
}: {
  catalog: CatalogClient;
  onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const c = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const manufacturers = useQuery({
    queryKey: ['catalog', 'manufacturers'],
    queryFn: ({ signal }) => catalog.listManufacturers(signal),
    retry: false,
    staleTime: 60_000,
  });
  const [manufacturerId, setManufacturerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ rows: number; without: string[] }>();
  const [error, setError] = useState(false);

  async function download() {
    if (!manufacturerId) return;
    setBusy(true);
    setError(false);
    setResult(undefined);
    try {
      const { details, without } = await manufacturerProducts(
        catalog,
        manufacturerId,
      );
      const template = catalogTemplateCsv(details);
      const name =
        manufacturers.data?.find((item) => item.id === manufacturerId)?.slug ??
        'katalog';
      const url = URL.createObjectURL(
        new Blob([template.csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `roofcalc-szablon-${name}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setResult({
        rows: template.rows,
        without: [...without, ...template.withoutVariants],
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bz-template" data-testid="admin-catalog-template">
      <header>
        <h3>{c.title}</h3>
        <button
          type="button"
          className="a-button a-ghost"
          aria-label={c.close}
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <p>{c.intro}</p>
      {manufacturers.isError ? (
        <p role="status" className="bz-unavailable">
          {c.unavailable}
        </p>
      ) : (
        <div className="bz-template-row">
          <label>
            {c.manufacturer}
            <select
              value={manufacturerId}
              data-testid="admin-template-manufacturer"
              onChange={(event) => setManufacturerId(event.target.value)}
            >
              <option value="">{c.choose}</option>
              {(manufacturers.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="a-button a-primary"
            data-testid="admin-template-download"
            disabled={!manufacturerId || busy}
            onClick={() => void download()}
          >
            <Download size={15} aria-hidden="true" />
            {busy ? c.busy : c.download}
          </button>
        </div>
      )}
      <ol>
        {c.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {result && (
        <p role="status" data-testid="admin-template-result">
          {c.done(result.rows)}
          {result.without.length > 0 && <> {c.without(result.without.join(', '))}</>}
        </p>
      )}
      {error && <p role="alert">{c.failed}</p>}
    </section>
  );
}
