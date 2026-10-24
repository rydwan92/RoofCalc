import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { toMillimetres, type LengthUnit } from '@cieslacalc/roof-math';
import { editableLength, parseDecimal } from '../format';
import { ROOF_FAMILY_LABEL } from '../assembly/roof-family';
import type {
  ProjectSession,
  ProjectSessionState,
  StructurePlacement,
  StructureSummary,
} from './session';
import './structure-bar.css';

/** A structure's label: its name, else its place in the project. */
export function structureLabel(
  structure: Pick<StructureSummary, 'name'>,
  index: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return structure.name ?? t('assembly.structures.fallback', { n: index + 1 });
}

type Field = 'name' | 'x' | 'y' | 'z' | 'rotation';

/**
 * VNext-10 (ADR-017): the roof structures of one project. Choosing one opens
 * it in the workbench — construction, materials, cost and documents follow
 * the chosen structure. Shown only for a project of several structures.
 */
export function StructureBar({
  session,
  state,
  unit,
  canAdd,
  onAdd,
}: {
  session: ProjectSession;
  state: ProjectSessionState;
  unit: LengthUnit;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState<Record<Field, string>>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const structures = state.structures;
  if (!structures) return null;
  const activeIndex = structures.findIndex(
    (structure) => structure.id === state.activeStructureId,
  );
  const edited = structures.find((structure) => structure.id === editing);
  const editedIndex = structures.findIndex(
    (structure) => structure.id === editing,
  );

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch {
      setError(t('assembly.structures.actionError'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** The fields as shown: positions read to 0.1 mm. */
  const draftFor = (structure: StructureSummary): Record<Field, string> => {
    const shown = (mm: number) =>
      editableLength(Math.round(mm * 10) / 10, unit);
    return {
      name: structure.name ?? '',
      x: shown(structure.placement.cornerMm.x),
      y: shown(structure.placement.cornerMm.y),
      z: shown(structure.placement.elevationMm),
      rotation: String(
        Number(structure.placement.rotationAboutVerticalDeg.toFixed(4)),
      ),
    };
  };
  const openSettings = (structure: StructureSummary) => {
    setEditing(structure.id);
    setConfirmRemove(false);
    setError('');
    setDraft(draftFor(structure));
  };
  const close = () => {
    setEditing(undefined);
    setDraft(undefined);
    setConfirmRemove(false);
  };

  const length = (raw: string) => {
    const value = parseDecimal(raw);
    return value === null ? null : toMillimetres(value, unit);
  };
  const invalid = (field: Exclude<Field, 'name'>) => {
    if (!draft) return false;
    if (field === 'rotation') {
      const value = parseDecimal(draft.rotation);
      return value === null || value < -360 || value > 360;
    }
    return length(draft[field]) === null;
  };

  const save = async () => {
    if (!edited || !draft) return;
    if ((['x', 'y', 'z', 'rotation'] as const).some(invalid)) {
      setError(t('assembly.structures.invalid'));
      return;
    }
    const placement: StructurePlacement = {
      cornerMm: { x: length(draft.x)!, y: length(draft.y)! },
      elevationMm: length(draft.z)!,
      rotationAboutVerticalDeg: parseDecimal(draft.rotation)!,
    };
    // Only a typed position moves the structure: the shown values are
    // rounded, so saving a new name never nudges it.
    const shown = draftFor(edited);
    const moved = (['x', 'y', 'z', 'rotation'] as const).some(
      (field) => draft[field].trim() !== shown[field],
    );
    const renamed = draft.name.trim() !== (edited.name ?? '');
    const done = await run(async () => {
      if (renamed) await session.renameStructure(edited.id, draft.name);
      if (moved) await session.moveStructure(edited.id, placement);
    });
    if (done) close();
  };

  const field = (name: Exclude<Field, 'name'>, unitLabel: string) => (
    <label className="a-structure-field" key={name}>
      <span>{t(`assembly.structures.field.${name}`)}</span>
      <span className="a-structure-input">
        <input
          inputMode="decimal"
          autoComplete="off"
          data-structure-field={name}
          aria-invalid={invalid(name)}
          value={draft?.[name] ?? ''}
          onChange={(event) =>
            setDraft((current) =>
              current ? { ...current, [name]: event.target.value } : current,
            )
          }
        />
        <small>{unitLabel}</small>
      </span>
    </label>
  );

  return (
    <section
      className="a-structures"
      data-testid="structure-bar"
      aria-label={t('assembly.structures.title')}
    >
      <div className="a-structures-row">
        <span className="a-structures-title">
          {t('assembly.structures.title')}
        </span>
        <div className="a-structures-list" role="group">
          {structures.map((structure, index) => (
            <button
              key={structure.id}
              type="button"
              className="a-structure-chip"
              aria-pressed={structure.id === state.activeStructureId}
              data-structure-id={structure.id}
              // The family stays readable where the chip hides it (phones).
              title={t(ROOF_FAMILY_LABEL[structure.family])}
              disabled={busy}
              onClick={() =>
                void run(() => session.selectStructure(structure.id))
              }
            >
              <strong>{structureLabel(structure, index, t)}</strong>
              <small>{t(ROOF_FAMILY_LABEL[structure.family])}</small>
            </button>
          ))}
          {canAdd && (
            <button
              type="button"
              className="a-structure-add"
              data-testid="structure-add"
              disabled={busy}
              onClick={onAdd}
            >
              <Plus size={15} aria-hidden="true" />
              {t('assembly.structures.add')}
            </button>
          )}
        </div>
        {activeIndex >= 0 && (
          <button
            type="button"
            className="a-structure-settings"
            data-testid="structure-settings"
            aria-expanded={editing === state.activeStructureId}
            onClick={() =>
              editing ? close() : openSettings(structures[activeIndex]!)
            }
          >
            <Settings2 size={15} aria-hidden="true" />
            {t('assembly.structures.settings')}
          </button>
        )}
      </div>
      <p className="a-structures-hint">
        {t('assembly.structures.hint', {
          name: structureLabel(structures[activeIndex] ?? {}, activeIndex, t),
        })}
      </p>
      {edited && draft && (
        <form
          className="a-structure-panel"
          data-testid="structure-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="a-structure-field is-name">
            <span>{t('assembly.structures.field.name')}</span>
            <input
              data-structure-field="name"
              value={draft.name}
              placeholder={structureLabel({}, editedIndex, t)}
              maxLength={200}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
            />
          </label>
          <fieldset>
            <legend>{t('assembly.structures.placement')}</legend>
            {field('x', unit)}
            {field('y', unit)}
            {field('z', unit)}
            {field('rotation', '°')}
            <p className="a-structures-hint">
              {t('assembly.structures.placementHint')}
            </p>
          </fieldset>
          {error && (
            <p className="a-structures-error" role="alert">
              {error}
            </p>
          )}
          <div className="a-structure-actions">
            <button
              type="submit"
              className="a-button a-primary"
              disabled={busy}
            >
              {t('assembly.structures.save')}
            </button>
            <button type="button" className="a-button" onClick={close}>
              {t('assembly.structures.cancel')}
            </button>
            {structures.length > 1 && !confirmRemove && (
              <button
                type="button"
                className="a-button a-structure-remove"
                data-testid="structure-remove"
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {t('assembly.structures.remove')}
              </button>
            )}
          </div>
          {confirmRemove && (
            <div className="a-structure-confirm" role="alertdialog">
              <p>
                {t('assembly.structures.removeConfirm', {
                  name: structureLabel(edited, editedIndex, t),
                })}
              </p>
              <button
                type="button"
                className="a-button a-structure-remove"
                data-testid="structure-remove-confirm"
                disabled={busy}
                onClick={() =>
                  void run(() => session.removeStructure(edited.id)).then(
                    (done) => done && close(),
                  )
                }
              >
                {t('assembly.structures.removeYes')}
              </button>
              <button
                type="button"
                className="a-button"
                onClick={() => setConfirmRemove(false)}
              >
                {t('assembly.structures.cancel')}
              </button>
            </div>
          )}
        </form>
      )}
      {error && !edited && (
        <p className="a-structures-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
