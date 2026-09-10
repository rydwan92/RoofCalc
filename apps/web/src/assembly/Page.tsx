import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Columns3,
  House,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Triangle,
  X,
} from 'lucide-react';
import { lengthUnits, purlinRange, resolveGableRoofTemplate } from '@cieslacalc/roof-math';
import { useAssembly } from './store';
import {
  GeometryInputs,
  NumberField,
  SupportInputs,
  TimberInputs,
  type Calculation,
} from './Inputs';
import { AssemblyCanvas, entityLabel } from './Canvas';
import { SkeletonCanvas } from './SkeletonCanvas';
import { Fabrication, Results } from './Summary';
import './styles.css';

function Toolbox({ result }: { result: Calculation | null }) {
  const state = useAssembly(),
    { t } = useTranslation();
  const purlin = state.spec.supports.find((s) => s.kind === 'purlin');
  const range = purlinRange(state.spec, 140);
  const canAdd = !!result && range.max >= range.min;
  const selectButton = (id: string, icon: ReactNode, label: string) => (
    <button
      key={id}
      className="a-tool"
      title={t(`assembly.${label}`)}
      aria-label={t(`assembly.${label}`)}
      aria-pressed={state.selected === id}
      onClick={() => state.select(id)}
    >
      {icon}
      <span>{t(`assembly.${label}`)}</span>
    </button>
  );
  return (
    <aside
      className={`a-toolbox ${state.collapsed ? 'is-collapsed' : ''}`}
      aria-label={t('assembly.toolbox')}
    >
      <button
        className="a-collapse a-button"
        aria-label={t(`assembly.${state.collapsed ? 'expand' : 'collapse'}`)}
        onClick={() => useAssembly.setState({ collapsed: !state.collapsed })}
      >
        {state.collapsed ? (
          <PanelLeftOpen size={18} />
        ) : (
          <PanelLeftClose size={18} />
        )}
        <span>{t('assembly.toolbox')}</span>
      </button>
      <section>
        <h2>{t('assembly.geometry')}</h2>
        {selectButton('roof', <Triangle size={20} />, 'roof')}
      </section>
      <section>
        <h2>{t('assembly.timber')}</h2>
        {selectButton(state.spec.member.id, <Box size={20} />, 'rafter')}
      </section>
      <section>
        <h2>{t('assembly.supports')}</h2>
        {state.spec.supports.map((s) =>
          selectButton(s.id, <Layers3 size={20} />, s.kind),
        )}
        {!purlin && (
          <button
            className="a-tool a-add"
            aria-label={t('assembly.addPurlin')}
            title={canAdd ? t('assembly.addPurlin') : t('assembly.noSpace')}
            disabled={!canAdd}
            onClick={state.add}
          >
            <Plus size={20} />
            <span>{t('assembly.addPurlin')}</span>
          </button>
        )}
        {selectButton(state.spec.ridge.id, <Columns3 size={20} />, 'ridge')}
      </section>
    </aside>
  );
}
function Inspector({
  result,
  onEnlarge,
}: {
  result: Calculation | null;
  onEnlarge: () => void;
}) {
  const state = useAssembly(),
    { t } = useTranslation();
  const support = state.spec.supports.find(
    (s) => s.id === state.selected || `joint:${s.id}` === state.selected,
  );
  const isCut =
    state.selected.startsWith('joint:') || state.selected.startsWith('cut:');
  return (
    <aside
      className={`a-inspector ${state.inspectorOpen ? 'is-open' : ''}`}
      aria-label={t('assembly.inspector')}
    >
      <button
        className="a-inspector-heading"
        aria-expanded={state.inspectorOpen}
        onClick={() =>
          useAssembly.setState({ inspectorOpen: !state.inspectorOpen })
        }
      >
        <span>
          <small>{t('assembly.inspector')}</small>
          <strong>{entityLabel(state.selected, state, t)}</strong>
        </span>
        <span>{state.inspectorOpen ? '−' : '+'}</span>
      </button>
      {state.inspectorOpen && (
        <div className="a-inspector-body">
          {state.selected === 'roof' && <GeometryInputs includeLayout />}
          {(state.selected === state.spec.member.id ||
            state.selected === 'cut:eave') && <TimberInputs />}
          {(state.selected === state.spec.ridge.id ||
            state.selected === 'cut:ridge') && (
            <NumberField
              field="ridge.thicknessMm"
              label="ridgeWidth"
              max={1000}
            />
          )}
          {support && <SupportInputs support={support} result={result} />}
          {isCut && result && (
            <section className="a-detail-lens">
              <h3>{t('assembly.detail')}</h3>
              <AssemblyCanvas
                result={result}
                compact
                focusId={state.selected}
                readOnly
              />
              <button className="a-button" onClick={onEnlarge}>
                {t('assembly.enlarge')}
              </button>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
export function AssemblyPage() {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const [marking, setMarking] = useState(false),
    [focusId, setFocusId] = useState<string | undefined>();
  const brand = import.meta.env.VITE_BRAND_NAME || 'CieślaCalc';
  const templateResult = resolveGableRoofTemplate(state.template);
  const result = templateResult.calculation;
  const wall = state.spec.supports.find((s) => s.kind === 'wall-plate')!;
  const changeMode = (mode: 'quick' | 'builder') => {
    state.setMode(mode);
    if (mode === 'builder' && window.matchMedia?.('(max-width: 800px)').matches)
      useAssembly.setState({ inspectorOpen: false });
  };
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${brand} — ${t('workshop')}`;
  }, [brand, i18n.language, t]);
  useEffect(() => {
    setFocusId(undefined);
  }, [state.selected, state.mode]);
  return (
    <div
      className={`assembly-app mode-${state.mode}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setFocusId(undefined);
      }}
    >
      <header className="a-header">
        <a className="a-brand" href="#/calculators/common-rafter">
          <House size={24} />
          <span>{brand}</span>
        </a>
        <nav className="a-modes" aria-label={t('workshop')}>
          {(['quick', 'builder'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={state.mode === mode}
              onClick={() => changeMode(mode)}
            >
              {t(`assembly.${mode}`)}
            </button>
          ))}
        </nav>
        <div className="a-settings">
          <div className="a-units" role="group" aria-label={t('assembly.unit')}>
            {lengthUnits.map((unit) => (
              <button
                key={unit}
                aria-pressed={state.unit === unit}
                onClick={() => state.setUnit(unit)}
              >
                {unit}
              </button>
            ))}
          </div>
          <button
            className="a-icon"
            aria-label={t('assembly.reset')}
            onClick={() => {
              state.reset();
              setFocusId(undefined);
            }}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="a-icon"
            aria-label={t('assembly.language')}
            onClick={() => {
              void i18n.changeLanguage(i18n.language === 'pl' ? 'en' : 'pl');
            }}
          >
            {i18n.language.toUpperCase()}
          </button>
        </div>
      </header>
      <main className="a-main">
        <div className="a-page-heading">
          <div>
            <span className="a-eyebrow">
              {t('workshop')} / {t('assembly.model')}
            </span>
            <h1>{t('assembly.title')}</h1>
            <p>
              {t(
                `assembly.${state.mode === 'quick' ? 'quickHint' : 'builderHint'}`,
              )}
            </p>
          </div>
          <span className="a-live">
            <i />
            {t('assembly.local')}
          </span>
        </div>
        {state.mode === 'quick' ? (
          <div className="a-quick-layout">
            <section className="a-quick-inputs">
              <div className="a-basic-fields">
                <GeometryInputs />
              </div>
              <details className="a-more">
                <summary>{t('assembly.more')}</summary>
                <h3>{t('assembly.rafter')}</h3>
                <TimberInputs />
                <h3>{t('assembly.wall-plate')}</h3>
                <SupportInputs support={wall} result={result} />
                <NumberField
                  field="ridge.thicknessMm"
                  label="ridgeWidth"
                  max={1000}
                />
              </details>
              {state.spec.supports.some((s) => s.kind === 'purlin') && (
                <p className="a-help">{t('assembly.purlinPresent')}</p>
              )}
              <button
                className="a-button a-primary"
                onClick={() => changeMode('builder')}
              >
                {t('assembly.openBuilder')} →
              </button>
            </section>
            <section className="a-quick-output">
              <Results result={result} />
              {result && <AssemblyCanvas result={result} compact readOnly />}
              <button
                className="a-button"
                aria-expanded={marking}
                onClick={() => setMarking((v) => !v)}
              >
                {t('assembly.steps')}
              </button>
            </section>
          </div>
        ) : (
          <>
            <div
              className={`a-builder-layout ${state.collapsed ? 'tools-collapsed' : ''}`}
            >
              <Toolbox result={result} />
              <section className="a-canvas-column">
                <div className="a-view-switch" role="tablist" aria-label={t('assembly.view')}>
                  {(['skeleton', 'rafter'] as const).map((view) => (
                    <button
                      key={view}
                      role="tab"
                      aria-selected={state.view === view}
                      onClick={() => state.setView(view)}
                    >
                      {t(`assembly.${view}`)}
                    </button>
                  ))}
                </div>
                {focusId && (
                  <button
                    className="a-button a-back"
                    onClick={() => setFocusId(undefined)}
                  >
                    <X size={16} />
                    {t('assembly.back')}
                  </button>
                )}
                {focusId || state.view === 'rafter' ? (
                  <AssemblyCanvas result={result} focusId={focusId} />
                ) : (
                  <SkeletonCanvas template={state.template} />
                )}
              </section>
              <Inspector
                result={result}
                onEnlarge={() => setFocusId(state.selected)}
              />
            </div>
            <Results
              result={result}
              rafterSpacing={
                state.view === 'skeleton' ? templateResult.rafterSpacing : undefined
              }
            />
            <button
              className="a-button"
              aria-expanded={marking}
              onClick={() => setMarking((v) => !v)}
            >
              {t('assembly.steps')}
            </button>
          </>
        )}
        {result && marking && (
          <Fabrication result={result} expanded={marking} />
        )}
        <details className="a-assumptions">
          <summary>{t('assembly.assumptions')}</summary>
          <p>{t('assembly.assumptionsText')}</p>
          <p>{t('assembly.structural')}</p>
        </details>
        <footer className="a-footer">
          <span>
            {brand} · {t('assembly.local')}
          </span>
          <span>{t('assembly.noSave')}</span>
        </footer>
      </main>
    </div>
  );
}
