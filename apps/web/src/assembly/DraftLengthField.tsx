import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toMillimetres } from '@cieslacalc/roof-math';
import { editableLength, parseDecimal } from '../format';
import { useAssembly } from './store';

/**
 * An exact length typed in the display unit and committed as one project
 * edit (a transaction: Escape or an invalid value restores it). Shared by
 * the Inspector and the batten section (VNext-14).
 */
export function DraftLengthField({
  label,
  value,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  onCommit: (value: number) => void;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const [raw, setRaw] = useState(editableLength(value, state.unit));
  useEffect(
    () => setRaw(editableLength(value, state.unit)),
    [state.unit, value],
  );
  const parsed = parseDecimal(raw);
  const canonicalValue =
    parsed === null ? Number.NaN : toMillimetres(parsed, state.unit);
  const invalid = !Number.isFinite(canonicalValue) || canonicalValue < min;
  const restore = () => setRaw(editableLength(value, state.unit));
  const commit = () => {
    if (invalid) {
      state.cancelTransaction();
      restore();
      return;
    }
    // Unchanged text is the rounded display of the exact canonical value:
    // committing it would silently round the project (V44).
    if (raw === editableLength(value, state.unit)) {
      state.cancelTransaction();
      return;
    }
    onCommit(canonicalValue);
    state.commitTransaction();
  };
  return (
    <label className="a-field">
      <span>{label}</span>
      <div>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={invalid}
          value={raw}
          onFocus={state.beginTransaction}
          onChange={(event) => setRaw(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              state.cancelTransaction();
              restore();
              event.currentTarget.blur();
            }
          }}
        />
        <span>{state.unit}</span>
      </div>
      {invalid && <small>{t('assembly.invalidField')}</small>}
    </label>
  );
}
