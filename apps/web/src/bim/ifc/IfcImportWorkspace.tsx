import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  IfcElementGroup,
  IfcSpatialNode,
} from '@cieslacalc/bim-import-core';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { IfcRoofConfirmation } from './IfcRoofConfirmation';
import { loadIfcFile } from './ifc-loader';
import type { IfcReferenceModel } from './ifc-runtime-types';
import type { IfcViewDirection } from '../../assembly/scene3d/IfcReferenceViewport';
import './ifc-import.css';

const IfcReferenceViewport = lazy(() =>
  import('../../assembly/scene3d/IfcReferenceViewport').then((module) => ({
    default: module.IfcReferenceViewport,
  })),
);

const copy = {
  pl: {
    title: 'Import projektu',
    intro:
      'Model IFC zostanie przeanalizowany lokalnie. RoofCalc nie zmieni projektu bez Twojego potwierdzenia.',
    drop: 'Przeciągnij plik IFC tutaj',
    choose: 'Wybierz plik .IFC',
    close: 'Zamknij importer',
    cancel: 'Anuluj',
    other: 'Wybierz inny plik',
    model: 'Model IFC',
    schema: 'Schemat',
    units: 'Jednostki źródłowe',
    count: 'Elementy',
    roofs: 'Kandydaci na dach',
    structure: 'Elementy konstrukcyjne',
    openings: 'Otwory',
    tree: 'Struktura modelu',
    inspector: 'Właściwości elementu',
    selected: 'Wybierz element z modelu lub listy.',
    all: 'Wszystko',
    roof: 'Dach',
    members: 'Konstrukcja',
    opening: 'Otwory',
    fit: 'Dopasuj',
    top: 'Z góry',
    front: 'Z przodu',
    side: 'Z boku',
    issues: 'Uwagi',
    noRoof: 'Nie znaleziono elementu IfcRoof ani IfcSlab.ROOF.',
    multiple: 'Model zawiera kilka dachów. Wybierz jeden do analizy.',
    missingUnits:
      'Nie rozpoznano jednostki długości. Konwersja wymaga jej potwierdzenia.',
    referenceOnly:
      'Model referencyjny. Geometria IFC nie zasila obliczeń RoofCalc.',
    raw: 'Pokaż właściwości IFC',
    steps:
      '1. Wczytaj IFC → 2. Wybierz dach → 3. Sprawdź parametry → 4. Utwórz projekt',
  },
  en: {
    title: 'Import project',
    intro:
      'The IFC model is analyzed locally. RoofCalc changes no project without your confirmation.',
    drop: 'Drop an IFC file here',
    choose: 'Choose .IFC file',
    close: 'Close importer',
    cancel: 'Cancel',
    other: 'Choose another file',
    model: 'IFC model',
    schema: 'Schema',
    units: 'Source units',
    count: 'Elements',
    roofs: 'Roof candidates',
    structure: 'Structural members',
    openings: 'Openings',
    tree: 'Model structure',
    inspector: 'Element properties',
    selected: 'Select an element in the model or list.',
    all: 'All',
    roof: 'Roof',
    members: 'Structure',
    opening: 'Openings',
    fit: 'Fit',
    top: 'Top',
    front: 'Front',
    side: 'Side',
    issues: 'Notes',
    noRoof: 'No IfcRoof or IfcSlab.ROOF element was found.',
    multiple: 'The model contains multiple roofs. Select one to analyze.',
    missingUnits: 'Length unit is unknown. Conversion requires confirmation.',
    referenceOnly:
      'Reference model. IFC geometry does not feed RoofCalc calculations.',
    raw: 'Show IFC properties',
    steps:
      '1. Load IFC → 2. Select roof → 3. Check parameters → 4. Create project',
  },
};

function SpatialBranch({
  node,
  nodes,
  onSelect,
}: {
  node: IfcSpatialNode;
  nodes: readonly IfcSpatialNode[];
  onSelect: (id: number) => void;
}) {
  const children = nodes.filter(
    (item) => item.parentExpressId === node.expressId,
  );
  return (
    <li>
      <button type="button" onClick={() => onSelect(node.expressId)}>
        {node.name}
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <SpatialBranch
              key={child.expressId}
              node={child}
              nodes={nodes}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function IfcImportWorkspace({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (template: RoofTemplateSpec) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const [model, setModel] = useState<IfcReferenceModel>();
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | IfcElementGroup>('all');
  const [direction, setDirection] = useState<IfcViewDirection>('fit');
  const [selectedId, setSelectedId] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelCurrent = useRef<() => void>(null);
  const loadVersion = useRef(0);
  useEffect(() => () => cancelCurrent.current?.(), []);

  const visible = useMemo(
    () =>
      new Set(
        model?.summary.elements
          .filter((element) => filter === 'all' || element.group === filter)
          .map((element) => element.expressId) ?? [],
      ),
    [model, filter],
  );
  const selected = model?.summary.elements.find(
    (element) => element.expressId === selectedId,
  );
  const candidate = model?.summary.roofCandidates.find(
    (roof) => roof.expressId === selectedId,
  );
  const selectedSpatial = model?.summary.spatialNodes.find(
    (node) => node.expressId === selectedId,
  );

  function start(file: File) {
    const version = ++loadVersion.current;
    cancelCurrent.current?.();
    setModel(undefined);
    setError('');
    setSelectedId(undefined);
    const task = loadIfcFile(file, setStage);
    cancelCurrent.current = task.cancel;
    void task.result
      .then((result) => {
        if (version !== loadVersion.current) return;
        cancelCurrent.current = null;
        setModel(result);
        setStage('');
      })
      .catch((cause: unknown) => {
        if (version !== loadVersion.current) return;
        cancelCurrent.current = null;
        if (cause instanceof Error && cause.message === 'Anulowano import.')
          return;
        setError(
          cause instanceof Error ? cause.message : 'Nie udało się wczytać IFC.',
        );
        setStage('');
      });
  }

  return (
    <div
      className="ifc-layer"
      role="dialog"
      aria-modal="true"
      aria-label={m.title}
      data-testid="ifc-import-workspace"
    >
      <section className="ifc-workspace">
        <header className="ifc-header">
          <div>
            <strong>{m.title}</strong>
            <span>{m.referenceOnly}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={m.close}>
            ×
          </button>
        </header>
        <p className="ifc-steps">{m.steps}</p>
        {!model && (
          <div
            className={`ifc-drop ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) start(file);
            }}
          >
            <h2>{m.drop}</h2>
            <p>{m.intro}</p>
            <button type="button" onClick={() => fileInput.current?.click()}>
              {m.choose}
            </button>
            {stage && (
              <p role="status">
                {stage}{' '}
                <button
                  type="button"
                  onClick={() => {
                    cancelCurrent.current?.();
                    cancelCurrent.current = null;
                    setStage('');
                  }}
                >
                  {m.cancel}
                </button>
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        )}
        <input
          ref={fileInput}
          className="ifc-file"
          type="file"
          accept=".ifc"
          aria-label={m.choose}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) start(file);
            event.target.value = '';
          }}
        />
        {model && (
          <>
            <div className="ifc-summary">
              <strong>{m.model}</strong>
              <span>{model.summary.metadata.fileName}</span>
              <span>
                {m.schema}: {model.summary.metadata.schema}
              </span>
              <span>
                {m.units}: {model.summary.metadata.sourceLengthUnit}
              </span>
              <span>
                {m.count}:{' '}
                {model.summary.elements.length.toLocaleString(i18n.language)}
              </span>
              <span>
                {m.roofs}: {model.summary.roofCandidates.length}
              </span>
              <span>
                {m.structure}:{' '}
                {
                  model.summary.elements.filter(
                    (item) => item.group === 'structure',
                  ).length
                }
              </span>
              <span>
                {m.openings}:{' '}
                {
                  model.summary.elements.filter(
                    (item) => item.group === 'opening',
                  ).length
                }
              </span>
              <button type="button" onClick={() => fileInput.current?.click()}>
                {m.other}
              </button>
            </div>
            <div className="ifc-main">
              <aside className="ifc-tree">
                <h2>{m.tree}</h2>
                <ul>
                  {model.summary.spatialNodes
                    .filter((node) => node.parentExpressId === undefined)
                    .map((node) => (
                      <SpatialBranch
                        key={node.expressId}
                        node={node}
                        nodes={model.summary.spatialNodes}
                        onSelect={setSelectedId}
                      />
                    ))}
                </ul>
                <h3>{m.roofs}</h3>
                {model.summary.roofCandidates.map((roof) => (
                  <button
                    type="button"
                    key={roof.expressId}
                    className={
                      selectedId === roof.expressId ? 'is-selected' : ''
                    }
                    onClick={() => {
                      setSelectedId(roof.expressId);
                      setFilter('roof');
                    }}
                  >
                    {roof.name} <small>{roof.sourceClass}</small>
                  </button>
                ))}
                <details>
                  <summary>
                    {m.count}: {model.summary.elements.length}
                  </summary>
                  <div className="ifc-element-list">
                    {model.summary.elements
                      .filter(
                        (item) => filter === 'all' || item.group === filter,
                      )
                      .slice(0, 300)
                      .map((item) => (
                        <button
                          type="button"
                          key={item.expressId}
                          onClick={() => setSelectedId(item.expressId)}
                        >
                          {item.name || item.ifcClass}
                        </button>
                      ))}
                  </div>
                </details>
              </aside>
              <div className="ifc-view">
                <div className="ifc-toolbar">
                  {(['all', 'roof', 'structure', 'opening'] as const).map(
                    (group) => (
                      <button
                        type="button"
                        key={group}
                        aria-pressed={filter === group}
                        onClick={() => setFilter(group)}
                      >
                        {group === 'all'
                          ? m.all
                          : group === 'roof'
                            ? m.roof
                            : group === 'structure'
                              ? m.members
                              : m.opening}
                      </button>
                    ),
                  )}
                  <span aria-hidden="true">|</span>
                  {(['fit', 'top', 'front', 'side'] as const).map((view) => (
                    <button
                      type="button"
                      key={view}
                      aria-pressed={direction === view}
                      onClick={() => setDirection(view)}
                    >
                      {m[view]}
                    </button>
                  ))}
                </div>
                <Suspense fallback={<p>Budowanie podglądu…</p>}>
                  <IfcReferenceViewport
                    model={model}
                    visible={visible}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    direction={direction}
                  />
                </Suspense>
              </div>
              <aside className="ifc-inspector">
                {candidate && (
                  <IfcRoofConfirmation
                    key={candidate.expressId}
                    model={model}
                    candidate={candidate}
                    onCreate={onCreate}
                  />
                )}
                <h2>{m.inspector}</h2>
                {selected ? (
                  <>
                    <dl>
                      <dt>Class</dt>
                      <dd>{selected.ifcClass}</dd>
                      <dt>Name</dt>
                      <dd>{selected.name || '—'}</dd>
                      <dt>GlobalId</dt>
                      <dd>{selected.globalId || '—'}</dd>
                      <dt>PredefinedType</dt>
                      <dd>{selected.predefinedType || '—'}</dd>
                      <dt>Storey</dt>
                      <dd>{selected.storey || '—'}</dd>
                      <dt>Material</dt>
                      <dd>{selected.material || '—'}</dd>
                      {selected.description && (
                        <>
                          <dt>Description</dt>
                          <dd>{selected.description}</dd>
                        </>
                      )}
                    </dl>
                    {selected.rawProperties && (
                      <details className="ifc-raw">
                        <summary>{m.raw}</summary>
                        <dl>
                          {Object.entries(selected.rawProperties).map(
                            ([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value}</dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </details>
                    )}
                  </>
                ) : selectedSpatial ? (
                  <dl>
                    <dt>Class</dt>
                    <dd>{selectedSpatial.ifcClass}</dd>
                    <dt>Name</dt>
                    <dd>{selectedSpatial.name}</dd>
                    <dt>GlobalId</dt>
                    <dd>{selectedSpatial.globalId || '—'}</dd>
                  </dl>
                ) : (
                  <p>{m.selected}</p>
                )}
              </aside>
            </div>
            {!!model.summary.issues.length && (
              <div className="ifc-issues">
                <strong>{m.issues}</strong>
                {model.summary.issues.map((issue, index) => (
                  <p key={`${issue.code}-${index}`}>
                    {issue.code === 'no-roof-candidate'
                      ? m.noRoof
                      : issue.code === 'multiple-roofs'
                        ? m.multiple
                        : m.missingUnits}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
