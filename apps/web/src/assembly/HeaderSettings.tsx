import { useTranslation } from 'react-i18next';
import { switchLanguage } from '../i18n';
import { Redo2, RotateCcw, SlidersHorizontal, Undo2 } from 'lucide-react';
import { lengthUnits } from '@cieslacalc/roof-math';
import { BusinessModeToggle } from '../business/BusinessHeader';
import { ShortcutHelp } from './PerspectiveBar';
import { useAssembly } from './store';

/**
 * The header's application settings: display unit, Undo/Redo, language,
 * "Przywróć przykład" and the Business switch — on a phone folded into one
 * settings menu. Display preferences only, except the example, which is an
 * ordinary undoable edit of the open project (VNext-6.2): the caller shows
 * its "Cofnij" notice.
 */
export function HeaderSettings({
  mobile,
  onExampleRestored,
  workbenchControls = true,
}: {
  mobile: boolean;
  onExampleRestored: () => void;
  /**
   * VNext-11: units and Undo/Redo belong to the workbench; the sales desk
   * and the administration show only language and mode.
   */
  workbenchControls?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const unit = useAssembly((state) => state.unit);
  const setUnit = useAssembly((state) => state.setUnit);
  const builder = useAssembly((state) => state.workbench.mode === 'builder');
  const canUndo = useAssembly((state) => state.historyPast.length > 0);
  const canRedo = useAssembly((state) => state.historyFuture.length > 0);
  const undo = useAssembly((state) => state.undo);
  const redo = useAssembly((state) => state.redo);
  const restoreExample = () => {
    const state = useAssembly.getState();
    state.restoreExample();
    state.setFocusId(undefined);
    if (state.workbench.mode === 'builder') onExampleRestored();
  };
  const toggleLanguage = () =>
    void switchLanguage(i18n.language === 'pl' ? 'en' : 'pl');
  const units = (className?: string) =>
    lengthUnits.map((option) => (
      <button
        key={option}
        className={className}
        aria-pressed={unit === option}
        onClick={() => setUnit(option)}
      >
        {option}
      </button>
    ));
  return (
    <div className="a-settings">
      {workbenchControls && (
        <div className="a-units" role="group" aria-label={t('assembly.unit')}>
          {units()}
        </div>
      )}
      {builder && workbenchControls && (
        <div
          className="a-history"
          role="group"
          aria-label={t('assembly.history')}
        >
          <button
            className="a-icon"
            aria-label={t('assembly.undoChange')}
            title={`${t('assembly.undoChange')} (Ctrl+Z)`}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="a-icon"
            aria-label={t('assembly.redoChange')}
            title={`${t('assembly.redoChange')} (Ctrl+Y)`}
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
        </div>
      )}
      {builder && !mobile && <ShortcutHelp />}
      {mobile ? (
        <details className="a-header-overflow">
          <summary
            className="a-icon"
            aria-label={t('assembly.settings')}
            title={t('assembly.settings')}
          >
            <SlidersHorizontal size={18} />
          </summary>
          <div>
            <div
              className="a-overflow-units"
              role="group"
              aria-label={t('assembly.unit')}
            >
              {units('a-button')}
            </div>
            <button className="a-button" onClick={restoreExample}>
              <RotateCcw size={18} />
              {t('assembly.reset')}
            </button>
            <button className="a-button" onClick={toggleLanguage}>
              {t('assembly.language')} · {i18n.language.toUpperCase()}
            </button>
            <BusinessModeToggle />
          </div>
        </details>
      ) : (
        <>
          <button
            className="a-icon a-desktop-setting"
            aria-label={t('assembly.reset')}
            title={t('assembly.reset')}
            onClick={restoreExample}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="a-icon a-desktop-setting"
            aria-label={t('assembly.language')}
            title={t('assembly.language')}
            onClick={toggleLanguage}
          >
            {i18n.language.toUpperCase()}
          </button>
          {/* An application capability, beside unit and language (§14). On
              a phone it lives in the settings menu to keep one header row. */}
          <BusinessModeToggle />
        </>
      )}
    </div>
  );
}
