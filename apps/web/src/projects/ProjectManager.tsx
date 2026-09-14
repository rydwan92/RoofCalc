import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Plus, Trash2, X } from 'lucide-react';
import { MobileSheet } from '../assembly/MobileSheet';
import type {
  ProjectSession,
  ProjectSessionState,
  SaveStatus,
} from './session';

const messages = {
  pl: {
    projects: 'Projekty',
    new: 'Nowy projekt',
    editBasics: 'Edytuj podstawowe wymiary',
    rename: 'Zmień nazwę',
    duplicate: 'Duplikuj',
    export: 'Eksportuj',
    import: 'Importuj projekt',
    delete: 'Usuń',
    confirm: 'Potwierdź usunięcie',
    cancel: 'Anuluj',
    close: 'Zamknij',
    name: 'Nazwa projektu',
    saveName: 'Zapisz nazwę',
    emptyName: 'Wpisz nazwę projektu.',
    actionError: 'Nie udało się wykonać operacji. Spróbuj ponownie.',
    importError: 'Plik nie jest poprawnym projektem CieślaCalc.',
    storageError:
      'Zapis lokalny nie działa. Wyeksportuj projekt, aby zachować kopię.',
    saved: 'Zapisano lokalnie',
    saving: 'Zapisywanie…',
    dirty: 'Niezapisane zmiany',
    error: 'Błąd zapisu',
  },
  en: {
    projects: 'Projects',
    new: 'New project',
    editBasics: 'Edit basic dimensions',
    rename: 'Rename',
    duplicate: 'Duplicate',
    export: 'Export',
    import: 'Import project',
    delete: 'Delete',
    confirm: 'Confirm deletion',
    cancel: 'Cancel',
    close: 'Close',
    name: 'Project name',
    saveName: 'Save name',
    emptyName: 'Enter a project name.',
    actionError: 'Could not complete the action. Please try again.',
    importError: 'This file is not a valid CieślaCalc project.',
    storageError: 'Local saving failed. Export the project to keep a copy.',
    saved: 'Saved locally',
    saving: 'Saving…',
    dirty: 'Unsaved changes',
    error: 'Save error',
  },
};

export function projectStatusLabel(status: SaveStatus, language: string) {
  return messages[language.startsWith('pl') ? 'pl' : 'en'][status];
}

export function ProjectManager({
  session,
  state,
  mobile,
  onStartNew,
  onEditBasics,
}: {
  session: ProjectSession;
  state: ProjectSessionState;
  mobile: boolean;
  onStartNew?: () => void;
  onEditBasics?: () => void;
}) {
  const { i18n } = useTranslation();
  const m = messages[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const [open, setOpen] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState('');
  const [deleteId, setDeleteId] = useState<string>();
  const [feedback, setFeedback] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const desktopDialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    desktopDialog.current?.focus();
    return () => previous?.focus();
  }, [open, mobile]);

  async function action(run: () => Promise<void>) {
    setFeedback('');
    try {
      await run();
      setRename(false);
      setDeleteId(undefined);
    } catch {
      setFeedback(m.actionError);
    }
  }

  function download() {
    const file = session.exportActive();
    if (!file) return;
    try {
      const url = URL.createObjectURL(
        new Blob([file.contents], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setFeedback(m.actionError);
    }
  }

  const body = (
    <div className="a-project-manager-body">
      {state.active && (
        <div className="a-project-current">
          <strong>{state.active.name}</strong>
          <span>{projectStatusLabel(state.saveStatus, i18n.language)}</span>
        </div>
      )}
      {state.saveStatus === 'error' && (
        <p role="alert" className="a-project-error">
          {m.storageError}
        </p>
      )}
      <button
        className="a-project-primary"
        onClick={() => {
          if (onStartNew) {
            setOpen(false);
            onStartNew();
          } else void action(() => session.create());
        }}
      >
        <Plus size={17} /> {m.new}
      </button>
      <div className="a-project-list">
        {state.projects.map((project) => (
          <div className="a-project-row" key={project.id}>
            <button
              className={project.id === state.active?.id ? 'is-active' : ''}
              aria-current={
                project.id === state.active?.id ? 'true' : undefined
              }
              onClick={() => void action(() => session.open(project.id))}
            >
              <FolderOpen size={16} />
              <span>{project.name}</span>
              <small>
                {new Date(project.updatedAt).toLocaleDateString(i18n.language)}
              </small>
            </button>
            <button
              className="a-project-row-delete"
              aria-label={`${m.delete}: ${project.name}`}
              onClick={() => setDeleteId(project.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      {state.active && (
        <div className="a-project-actions">
          {onEditBasics && (
            <button
              onClick={() => {
                setOpen(false);
                onEditBasics();
              }}
            >
              {m.editBasics}
            </button>
          )}
          <button
            onClick={() => {
              setName(state.active?.name ?? '');
              setRename(true);
            }}
          >
            {m.rename}
          </button>
          <button onClick={() => void action(() => session.duplicate())}>
            {m.duplicate}
          </button>
          <button onClick={download}>{m.export}</button>
          <button onClick={() => setDeleteId(state.active?.id)}>
            {m.delete}
          </button>
        </div>
      )}
      {rename && (
        <form
          className="a-project-rename"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setFeedback(m.emptyName);
              return;
            }
            void action(() => session.rename(name));
          }}
        >
          <label htmlFor="a-project-name">{m.name}</label>
          <input
            id="a-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">{m.saveName}</button>
          <button type="button" onClick={() => setRename(false)}>
            {m.cancel}
          </button>
        </form>
      )}
      {deleteId && (
        <div className="a-project-confirm">
          <strong>{m.confirm}?</strong>
          <button onClick={() => void action(() => session.delete(deleteId))}>
            {m.delete}
          </button>
          <button onClick={() => setDeleteId(undefined)}>{m.cancel}</button>
        </div>
      )}
      <button
        className="a-project-import"
        onClick={() => input.current?.click()}
      >
        {m.import}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.cieslacalc.json,application/json"
        className="a-project-file"
        aria-label={m.import}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            await session.import(await file.text());
            setFeedback('');
          } catch {
            setFeedback(m.importError);
          } finally {
            event.target.value = '';
          }
        }}
      />
      {feedback && (
        <p role="alert" className="a-project-error">
          {feedback}
        </p>
      )}
    </div>
  );

  return (
    <div className="a-project-control">
      <button
        className="a-project-trigger"
        aria-label={m.projects}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{state.active?.name ?? m.projects}</span>
        <small>
          {state.active
            ? projectStatusLabel(state.saveStatus, i18n.language)
            : ''}
        </small>
      </button>
      {open &&
        (mobile ? (
          <MobileSheet title={m.projects} onClose={() => setOpen(false)}>
            {body}
          </MobileSheet>
        ) : (
          <div className="a-project-layer">
            <button
              className="a-project-backdrop"
              aria-label={m.close}
              onClick={() => setOpen(false)}
            />
            <section
              ref={desktopDialog}
              tabIndex={-1}
              className="a-project-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={m.projects}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false);
                  return;
                }
                if (event.key !== 'Tab') return;
                const focusable = Array.from(
                  desktopDialog.current?.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled])',
                  ) ?? [],
                ).filter(
                  (element) => getComputedStyle(element).display !== 'none',
                );
                const first = focusable[0],
                  last = focusable.at(-1);
                if (!first || !last) return;
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === desktopDialog.current)
                ) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }}
            >
              <header>
                <strong>{m.projects}</strong>
                <button
                  className="a-icon"
                  aria-label={m.close}
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </header>
              {body}
            </section>
          </div>
        ))}
    </div>
  );
}
