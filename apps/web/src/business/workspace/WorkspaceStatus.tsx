import { useState } from 'react';
import { useBusiness } from '../context';
import type { RemoteSaveStatus } from './autosave';

export function WorkspaceStatus({
  status,
  locale,
  onRetry,
  onReload,
  onExport,
  onQuote,
  onHome,
  onMaterials,
}: {
  status: RemoteSaveStatus;
  locale: string;
  onRetry: () => Promise<void>;
  onReload: () => Promise<void>;
  onExport: () => void;
  onQuote: () => void;
  onHome: () => Promise<void>;
  onMaterials: () => void;
}) {
  const business = useBusiness(),
    pl = locale.startsWith('pl');
  const [failed, setFailed] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    }
  };
  return (
    <div
      className="bz-workspace-status"
      data-testid="business-save-bar"
      data-state={business.sessionExpired ? 'error' : status}
    >
      <button className="bz-back-link" onClick={() => void run(onHome)}>
        {pl ? '← Wyceny' : '← Estimations'}
      </button>
      {business.estimation && (
        <div
          className="bz-estimation-context"
          data-testid="business-estimation-context"
        >
          <strong>{business.estimation.projectName}</strong>
          <span>
            {business.estimation.customer.companyName ||
              business.estimation.customer.name}
          </span>
        </div>
      )}
      <span role="status" data-testid="business-save-status">
        {business.sessionExpired
          ? pl
            ? 'Sesja wygasła. Zaloguj się ponownie, aby zapisać dane handlowe.'
            : 'Session expired. Sign in again to save business data.'
          : status === 'conflict'
            ? pl
              ? 'Wycena została zmieniona w innym miejscu.'
              : 'This estimation changed elsewhere.'
            : status === 'error'
              ? pl
                ? 'Błąd zapisu — zmiany pozostają na tym urządzeniu.'
                : 'Save failed — changes remain on this device.'
              : status === 'saving'
                ? pl
                  ? 'Zapisywanie…'
                  : 'Saving…'
                : pl
                  ? 'Zapisano'
                  : 'Saved'}
      </span>
      {business.sessionExpired ? (
        <button className="a-button" onClick={() => business.setHomeOpen(true)}>
          {pl ? 'Zaloguj ponownie' : 'Sign in again'}
        </button>
      ) : (
        status === 'error' && (
          <button className="a-button" onClick={() => void run(onRetry)}>
            {pl ? 'Ponów zapis' : 'Retry save'}
          </button>
        )
      )}
      {status === 'conflict' && (
        <button className="a-button" onClick={() => void run(onReload)}>
          {pl ? 'Wczytaj wersję z serwera' : 'Load server version'}
        </button>
      )}
      {(status === 'conflict' || status === 'error') && (
        <button className="a-button" onClick={onExport}>
          {pl ? 'Pobierz moją kopię JSON' : 'Download my JSON copy'}
        </button>
      )}
      {failed && (
        <span role="alert">
          {pl
            ? 'Nie udało się połączyć. Twoje zmiany pozostają otwarte.'
            : 'Connection failed. Your edits remain open.'}
        </span>
      )}
      <button className="a-button" onClick={onMaterials}>
        {pl ? 'Materiały' : 'Materials'}
      </button>
      <button
        className="a-button"
        onClick={onQuote}
        disabled={!business.session}
      >
        {pl ? 'Oferta' : 'Quote'}
      </button>
    </div>
  );
}
