import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { DatabaseZap, HardDrive } from 'lucide-react';
import { catalogClient, type CatalogClient } from './client';
import { bundledCatalogClient } from './offline-client';
import './catalog-source.css';

/**
 * Which technical catalogue the pickers read (ADR-013). `server` is the
 * default and the source of truth. `bundled` is the user's explicit choice
 * while the server catalogue is unavailable. Transient session state: never
 * in the project, never in history, never persisted.
 */
export type CatalogSource = 'server' | 'bundled';

export const useCatalogSource = create<{
  source: CatalogSource;
  setSource: (source: CatalogSource) => void;
}>((set) => ({
  source: 'server',
  setSource: (source) => set({ source }),
}));

/** An explicitly injected client (tests, business) always wins. */
export function useCatalogClient(explicit?: CatalogClient): CatalogClient {
  const source = useCatalogSource((state) => state.source);
  if (explicit) return explicit;
  return source === 'bundled' ? bundledCatalogClient : catalogClient;
}

/** Query keys scoped by source, so server and bundled results never mix. */
export function catalogQueryKey(
  client: CatalogClient,
  ...parts: readonly unknown[]
): unknown[] {
  return [
    'catalog',
    client === bundledCatalogClient ? 'bundled' : 'server',
    ...parts,
  ];
}

const copy = {
  pl: {
    useBundled: 'Użyj wbudowanego katalogu technicznego',
    useBundledHint: (date: string) =>
      `Działa bez serwera. Dane techniczne producentów ze stanu ${date}, bez cen.`,
    bundledActive: (date: string) =>
      `Katalog wbudowany (offline) — dane techniczne ze stanu ${date}. Wybrany produkt zapisze ten sam snapshot techniczny co z serwera.`,
    backToServer: 'Wróć do katalogu serwera',
  },
  en: {
    useBundled: 'Use the built-in technical catalogue',
    useBundledHint: (date: string) =>
      `Works without the server. Manufacturers’ technical data as of ${date}, no prices.`,
    bundledActive: (date: string) =>
      `Built-in catalogue (offline) — technical data as of ${date}. A chosen product stores the same technical snapshot as from the server.`,
    backToServer: 'Back to the server catalogue',
  },
};

/** The offer shown where the server catalogue is unavailable. */
export function UseBundledCatalog() {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const setSource = useCatalogSource((state) => state.setSource);
  return (
    <div className="a-catalog-bundled-offer">
      <button
        type="button"
        className="a-button a-primary"
        data-testid="catalog-use-bundled"
        onClick={() => setSource('bundled')}
      >
        <HardDrive size={16} aria-hidden="true" />
        {m.useBundled}
      </button>
      <small>{m.useBundledHint(bundledCatalogClient.dataAsOf)}</small>
    </div>
  );
}

/** Always visible while the bundled catalogue is in use. */
export function BundledCatalogNotice() {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const { source, setSource } = useCatalogSource();
  if (source !== 'bundled') return null;
  return (
    <div
      className="a-catalog-bundled-notice"
      role="status"
      data-testid="catalog-bundled-notice"
    >
      <HardDrive size={16} aria-hidden="true" />
      <span>{m.bundledActive(bundledCatalogClient.dataAsOf)}</span>
      <button type="button" onClick={() => setSource('server')}>
        <DatabaseZap size={14} aria-hidden="true" />
        {m.backToServer}
      </button>
    </div>
  );
}
