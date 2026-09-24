import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Calculator,
  FileBox,
  FolderOpen,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import type { ProjectSummary } from '@cieslacalc/project-core';
import { sessionClient } from '../business/auth/client';
import { BusinessClientError } from '../business/client';
import './home.css';

const copy = {
  pl: {
    tagline: 'Dach od geometrii do kosztorysu',
    standard: 'Standard',
    standardHint:
      'Praca techniczna nad dachem — bez logowania, na tym urządzeniu.',
    newProject: 'Nowy projekt',
    newProjectHint: 'Wymiary budynku, kąt, konstrukcja',
    importIfc: 'Importuj IFC',
    importIfcHint: 'Model architekta jako punkt wyjścia',
    quick: 'Szybki kalkulator',
    quickHint: 'Jedna krokiew, wynik od razu',
    recent: 'Ostatnie projekty',
    empty: 'Brak zapisanych projektów. Zacznij od Nowego projektu.',
    all: 'Wszystkie projekty',
    examples: 'Przykładowe projekty',
    updated: 'Zmieniono',
    business: 'Business',
    businessHint: 'Sprzedaż hurtowni: klienci, wyceny, oferty, cenniki.',
    checking: 'Sprawdzanie…',
    signIn: 'Zaloguj się',
    signInHint: 'Serwer i baza działają. Zaloguj się kontem firmy.',
    setup: 'Konfiguracja wymagana',
    setupOffline: 'Serwer Business nie odpowiada. Standard działa bez niego.',
    setupDatabase: 'Brak połączenia z bazą danych Business.',
    setupAuth: 'Logowanie nie jest skonfigurowane na serwerze.',
    setupOwner: 'Utwórz pierwsze konto właściciela kodem konfiguracji.',
    openDesk: 'Otwórz pulpit sprzedaży',
    signedAs: 'Zalogowano: {{name}}',
    platform: 'Panel systemowy',
  },
  en: {
    tagline: 'Roof from geometry to estimate',
    standard: 'Standard',
    standardHint: 'Technical roof work — no sign-in, on this device.',
    newProject: 'New project',
    newProjectHint: 'Building size, pitch, structure',
    importIfc: 'Import IFC',
    importIfcHint: 'Architect model as a starting point',
    quick: 'Quick calculator',
    quickHint: 'One rafter, instant result',
    recent: 'Recent projects',
    empty: 'No saved projects yet. Start with a New project.',
    all: 'All projects',
    examples: 'Example projects',
    updated: 'Changed',
    business: 'Business',
    businessHint: 'Wholesaler sales: customers, estimates, quotes, prices.',
    checking: 'Checking…',
    signIn: 'Sign in',
    signInHint: 'Server and database are up. Sign in with a company account.',
    setup: 'Setup required',
    setupOffline:
      'The Business server does not respond. Standard works without it.',
    setupDatabase: 'The Business database is not connected.',
    setupAuth: 'Sign-in is not configured on the server.',
    setupOwner: 'Create the first owner account with the setup code.',
    openDesk: 'Open sales desk',
    signedAs: 'Signed in: {{name}}',
    platform: 'System console',
  },
};
type Copy = (typeof copy)['pl'];

export type BusinessEntryState =
  | { kind: 'checking' }
  | { kind: 'setup'; reason: 'offline' | 'database' | 'auth' | 'owner' }
  | { kind: 'sign-in' }
  | { kind: 'open'; userName: string; platformAdmin: boolean };

/**
 * One public status probe and one session probe, only on the home screen.
 * No calculation path depends on either; an unreachable server resolves to
 * "setup required" and Standard stays fully usable (§65, ADR-006).
 */
export function useBusinessEntryState(enabled = true): BusinessEntryState {
  const setup = useQuery({
    queryKey: ['home', 'setup-status'],
    queryFn: sessionClient.setupStatus,
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  const ready =
    setup.data?.database === 'connected' &&
    setup.data.auth === 'configured' &&
    setup.data.firstOwner !== 'required';
  const session = useQuery({
    queryKey: ['business', 'session'],
    queryFn: sessionClient.session,
    enabled: enabled && ready,
    retry: false,
    staleTime: 30_000,
  });
  if (setup.isPending) return { kind: 'checking' };
  if (setup.isError) return { kind: 'setup', reason: 'offline' };
  if (setup.data.database !== 'connected')
    return { kind: 'setup', reason: 'database' };
  if (setup.data.auth !== 'configured')
    return { kind: 'setup', reason: 'auth' };
  if (setup.data.firstOwner === 'required')
    return { kind: 'setup', reason: 'owner' };
  if (session.isPending) return { kind: 'checking' };
  if (session.isError)
    return session.error instanceof BusinessClientError &&
      session.error.code !== 'authentication-required'
      ? { kind: 'setup', reason: 'offline' }
      : { kind: 'sign-in' };
  return {
    kind: 'open',
    userName: session.data.user.name,
    platformAdmin: !!session.data.platformAdmin,
  };
}

function BusinessCard({
  state,
  m,
  onOpen,
  onPlatform,
}: {
  state: BusinessEntryState;
  m: Copy;
  onOpen: () => void;
  onPlatform?: () => void;
}) {
  const hint =
    state.kind === 'setup'
      ? {
          offline: m.setupOffline,
          database: m.setupDatabase,
          auth: m.setupAuth,
          owner: m.setupOwner,
        }[state.reason]
      : state.kind === 'sign-in'
        ? m.signInHint
        : state.kind === 'open'
          ? m.signedAs.replace('{{name}}', state.userName)
          : m.checking;
  const label =
    state.kind === 'setup'
      ? m.setup
      : state.kind === 'sign-in'
        ? m.signIn
        : state.kind === 'open'
          ? m.openDesk
          : m.checking;
  return (
    <section
      className="h-workspace is-business"
      data-testid="home-business"
      data-state={state.kind === 'setup' ? `setup-${state.reason}` : state.kind}
    >
      <header>
        <Building2 size={20} aria-hidden="true" />
        <div>
          <h2>{m.business}</h2>
          <p>{m.businessHint}</p>
        </div>
      </header>
      <p className="h-business-status" role="status">
        <i data-state={state.kind} aria-hidden="true" />
        {hint}
      </p>
      <button
        type="button"
        className={`h-business-action${state.kind === 'open' ? ' is-primary' : ''}`}
        data-testid="home-business-action"
        disabled={state.kind === 'checking'}
        onClick={onOpen}
      >
        {label}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
      {state.kind === 'open' && state.platformAdmin && onPlatform && (
        <button
          type="button"
          className="h-platform-link"
          data-testid="home-platform-entry"
          onClick={onPlatform}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          {m.platform}
        </button>
      )}
    </section>
  );
}

export function AppHome({
  brand,
  projects,
  onNewProject,
  onImportIfc,
  onQuick,
  onOpenProject,
  onExamples,
  onBusiness,
  onPlatform,
}: {
  brand: string;
  projects: readonly ProjectSummary[];
  onNewProject: () => void;
  onImportIfc: () => void;
  onQuick: () => void;
  onOpenProject: (id: string) => void;
  onExamples: () => void;
  onBusiness: () => void;
  onPlatform?: () => void;
}) {
  const { i18n } = useTranslation();
  const pl = i18n.language.startsWith('pl');
  const m = pl ? copy.pl : copy.en;
  const business = useBusinessEntryState();
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const recent = projects.slice(0, 6);
  const older = projects.slice(6);
  const projectButton = (project: ProjectSummary) => (
    <li key={project.id}>
      <button
        type="button"
        data-testid="home-recent-project"
        onClick={() => onOpenProject(project.id)}
      >
        <FolderOpen size={18} aria-hidden="true" />
        <strong>{project.name}</strong>
        <small>
          {m.updated} {date.format(new Date(project.updatedAt))}
        </small>
      </button>
    </li>
  );
  return (
    <main className="h-home" data-testid="app-home">
      <header className="h-top">
        <div className="h-brand">
          <span className="h-logo" aria-hidden="true">
            <FileBox size={22} />
          </span>
          <div>
            <h1>{brand}</h1>
            <p>{m.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          className="h-language"
          onClick={() => void i18n.changeLanguage(pl ? 'en' : 'pl')}
        >
          {i18n.language.toUpperCase()}
        </button>
      </header>
      <div className="h-grid">
        <section
          className="h-workspace is-standard"
          data-testid="home-standard"
        >
          <header>
            <Calculator size={20} aria-hidden="true" />
            <div>
              <h2>{m.standard}</h2>
              <p>{m.standardHint}</p>
            </div>
          </header>
          <div className="h-actions">
            <button
              type="button"
              className="h-action is-primary"
              data-testid="home-new-project"
              onClick={onNewProject}
            >
              <Plus size={22} aria-hidden="true" />
              <strong>{m.newProject}</strong>
              <small>{m.newProjectHint}</small>
            </button>
            <button
              type="button"
              className="h-action"
              data-testid="home-import-ifc"
              onClick={onImportIfc}
            >
              <BookOpen size={22} aria-hidden="true" />
              <strong>{m.importIfc}</strong>
              <small>{m.importIfcHint}</small>
            </button>
            <button
              type="button"
              className="h-action"
              data-testid="home-quick"
              onClick={onQuick}
            >
              <Calculator size={22} aria-hidden="true" />
              <strong>{m.quick}</strong>
              <small>{m.quickHint}</small>
            </button>
          </div>
          <div className="h-recent">
            <h3>{m.recent}</h3>
            {projects.length === 0 ? (
              <p className="h-empty">{m.empty}</p>
            ) : (
              <ul data-testid="home-recent-projects">
                {recent.map(projectButton)}
              </ul>
            )}
            {older.length > 0 && (
              <details>
                <summary>
                  {m.all} ({projects.length})
                </summary>
                <ul>{older.map(projectButton)}</ul>
              </details>
            )}
            <button
              type="button"
              className="h-link"
              data-testid="home-examples"
              onClick={onExamples}
            >
              {m.examples}
            </button>
          </div>
        </section>
        <BusinessCard
          state={business}
          m={m}
          onOpen={onBusiness}
          {...(onPlatform ? { onPlatform } : {})}
        />
      </div>
    </main>
  );
}
