import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ResolvedRoofFeature,
  RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import {
  ROOF_SYSTEM_ROLE_GROUP,
  type RoofLineComponentIntent,
  type RoofLineComponentRole,
} from '@cieslacalc/roof-system-core';
import { useAssembly } from './store';
import { materialText } from './material-copy';
import type { ExportFacts } from './export-adapter';
import {
  featureLabel,
  nextLineComponentId,
  withLineComponent,
  withOpening,
  withoutLineComponent,
} from './roof-system';
import {
  resolveRoofSystemChecklist,
  takeRoofSystemFocus,
  type RoofSystemAreaKey,
} from './roof-system-checklist';
import { roofSystemCopy, type RoofSystemCopy } from './roof-system-copy';
import { gutterLine, planView, pointAtStation } from './drainage-view';
import {
  ComponentCard,
  ComponentPicker,
  FeatureChips,
  OpeningEditor,
} from './RoofSystemEditors';
import './drainage.css';
import './roof-system.css';

/**
 * V52 "System dachu": one coherent place for the roof's system elements.
 *
 * The overview lists the roof's areas with an honest state (ready / needs a
 * decision / not configured / not applicable — never a percentage). A click
 * opens that area's focused editor; every quantity shown there comes from
 * the resolved facts. The drawing is a technical top view of the same
 * canonical features with layer toggles; choosing "applies to" highlights
 * exactly the features a quantity was derived from.
 */
type Layer = 'covering' | 'ridge' | 'eave' | 'drainage' | 'openings';
const LAYERS: Layer[] = ['covering', 'ridge', 'eave', 'drainage', 'openings'];

const RIDGE_ROLES: RoofLineComponentRole[] = [
  'ridge-tape',
  'ridge-end',
  'ridge-clip',
];
const EAVE_ROLES: RoofLineComponentRole[] = [
  'eave-flashing',
  'drip-edge',
  'eave-comb',
  'ventilation-comb',
  'eave-ventilation-strip',
  'eave-strip',
  'gutter-apron',
];
const VERGE_ROLES: RoofLineComponentRole[] = ['verge-flashing', 'wind-board'];

const toSvg = (point: { x: number; y: number }) => ({
  x: point.x,
  y: -point.y,
});

export function RoofSystemWorkspace({
  surface,
  facts,
  onOpenCovering,
  onOpenTilePlan,
  onOpenDrainage,
}: {
  surface: RoofSurfaceGeometryResult;
  facts: ExportFacts;
  onOpenCovering: () => void;
  onOpenTilePlan: () => void;
  onOpenDrainage: () => void;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const c = roofSystemCopy(locale);
  const state = useAssembly();
  const system = facts.roofSystem;
  // A request from the Material Plan (one area, one opening, or the
  // checklist) is consumed once, on mount.
  const [focus] = useState(() => takeRoofSystemFocus());
  const [area, setArea] = useState<RoofSystemAreaKey | undefined>(focus?.area);
  const [completing, setCompleting] = useState(!!focus?.checklist);
  const [highlight, setHighlight] = useState<string[]>(() =>
    focus?.featureId ? [focus.featureId] : [],
  );
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set(LAYERS));
  const [showHooks, setShowHooks] = useState(false);
  const [openingId, setOpeningId] = useState<string | undefined>(
    focus?.featureId,
  );
  const [adding, setAdding] = useState(false);
  const view = useMemo(() => planView(surface), [surface]);
  const checklist = useMemo(() => resolveRoofSystemChecklist(facts), [facts]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxPerMm, setPxPerMm] = useState(0);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      if (box.width > 0 && box.height > 0)
        setPxPerMm(Math.min(box.width / view.width, box.height / view.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [view.width, view.height]);
  if (!system) return null;
  const intent = system.intent;
  const topology = system.topology;
  const features = topology.features;
  const countOf = (kind: string) =>
    features.filter((feature) => feature.kind === kind).length;
  const label = (feature: ResolvedRoofFeature) =>
    featureLabel(feature.kind, feature.ordinal, locale, countOf(feature.kind));
  const coveringProductId = (facts.coverings ?? []).find(
    (item) => item.product.catalogRef?.productId,
  )?.product.catalogRef?.productId;
  const openEnds = system.lineEnds.filter((end) => end.open).length;
  const stroke = Math.max(view.width, view.height) / 450;
  const labelScale =
    pxPerMm > 0 ? 11 / pxPerMm : Math.max(view.width, view.height) / 52;
  const lit = new Set(highlight);
  const commitComponent = (component: RoofLineComponentIntent) => {
    state.setRoofSystem(withLineComponent(intent, component));
    setAdding(false);
  };
  const removeComponent = (id: string) =>
    state.setRoofSystem(withoutLineComponent(intent, id));
  const toggleLayer = (layer: Layer) =>
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  const openArea = (key: RoofSystemAreaKey, featureId?: string) => {
    setArea(key);
    setCompleting(false);
    setAdding(false);
    setOpeningId(featureId);
    setHighlight(
      key === 'ridge'
        ? features
            .filter((f) => f.kind === 'ridge' || f.kind === 'hip')
            .map((f) => f.id)
        : key === 'eave' || key === 'drainage'
          ? features.filter((f) => f.kind === 'eave').map((f) => f.id)
          : key === 'verge'
            ? features.filter((f) => f.kind === 'verge').map((f) => f.id)
            : featureId
              ? [featureId]
              : [],
    );
  };

  // ── Drawing ──────────────────────────────────────────────────────────
  const plan = system.drainage;
  const drainageOn = plan.status !== 'disabled';
  const canvas = (
    <div className="rs-canvas">
      <div className="rs-layers" role="group" aria-label={c.layers}>
        {LAYERS.map((layer) => (
          <button
            key={layer}
            type="button"
            aria-pressed={layers.has(layer)}
            data-testid={`rs-layer-${layer}`}
            onClick={() => toggleLayer(layer)}
          >
            {c.layer[layer]}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
        role="img"
        aria-label={c.title}
        data-testid="rs-plan-view"
        onClick={() => setHighlight([])}
      >
        {view.planes.map((plane) => (
          <polygon
            key={plane.roofPlaneId}
            className={`rs-plane${layers.has('covering') ? ' is-covered' : ''}`}
            strokeWidth={stroke}
            points={plane.points.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}
        {features.map((feature) => {
          const layer: Layer =
            feature.kind === 'ridge' || feature.kind === 'hip'
              ? 'ridge'
              : 'eave';
          if (!layers.has(layer)) return null;
          const a = toSvg(feature.start);
          const b = toSvg(feature.end);
          const on = lit.has(feature.id);
          return (
            <g
              key={feature.id}
              className={`rs-feature is-${feature.kind}${on ? ' is-lit' : ''}`}
              data-testid={`rs-feature-${feature.kind}-${feature.ordinal}`}
              data-lit={on}
              onClick={(event) => {
                event.stopPropagation();
                setHighlight([feature.id]);
              }}
            >
              <line
                className="rs-hit"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={stroke * 10}
              />
              <line
                className="rs-line"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={
                  on
                    ? stroke * 5
                    : feature.kind === 'eave'
                      ? stroke * 3.5
                      : stroke * 2.5
                }
              />
            </g>
          );
        })}
        {layers.has('drainage') &&
          drainageOn &&
          system.eaves
            .filter((eave) => plan.gutteredEaveIds.includes(eave.id))
            .map((eave) => {
              const line = gutterLine(eave, view.gutterOffsetMm);
              const segment = plan.runs
                .flatMap((run) => run.segments)
                .find((item) => item.eaveId === eave.id);
              return (
                <g key={`gutter:${eave.id}`} className="rs-gutter">
                  <line
                    x1={line.from.x}
                    y1={line.from.y}
                    x2={line.to.x}
                    y2={line.to.y}
                    strokeWidth={view.gutterOffsetMm * 0.7}
                  />
                  {showHooks &&
                    segment?.hookPositionsMm.map((position, index) => {
                      const at = pointAtStation(line, position / eave.lengthMm);
                      return (
                        <circle
                          key={index}
                          className="rs-hook"
                          data-testid="rs-hook"
                          cx={at.x}
                          cy={at.y}
                          r={view.gutterOffsetMm * 0.28}
                        />
                      );
                    })}
                  {showHooks &&
                    segment?.jointStationsMm.map((station, index) => {
                      const at = pointAtStation(line, station / eave.lengthMm);
                      return (
                        <rect
                          key={`joint:${index}`}
                          className="rs-joint"
                          data-testid="rs-joint"
                          x={at.x - view.gutterOffsetMm * 0.45}
                          y={at.y - view.gutterOffsetMm * 0.45}
                          width={view.gutterOffsetMm * 0.9}
                          height={view.gutterOffsetMm * 0.9}
                        />
                      );
                    })}
                  {plan.outlets
                    .filter((outlet) => outlet.eaveId === eave.id)
                    .map((outlet) => {
                      const at = pointAtStation(line, outlet.station);
                      return (
                        <circle
                          key={outlet.id}
                          className="rs-outlet"
                          cx={at.x}
                          cy={at.y}
                          r={view.gutterOffsetMm * 0.9}
                          strokeWidth={stroke * 2}
                        />
                      );
                    })}
                </g>
              );
            })}
        {layers.has('openings') &&
          system.openings.map((opening) => {
            const on =
              lit.has(opening.featureId) || openingId === opening.featureId;
            const status = system.openingSystems.find(
              (item) => item.featureId === opening.featureId,
            )?.flashing.status;
            const centre = opening.edges.length
              ? {
                  x:
                    opening.edges.reduce(
                      (sum, edge) => sum + edge.worldFrom.x,
                      0,
                    ) / opening.edges.length,
                  y:
                    opening.edges.reduce(
                      (sum, edge) => sum + edge.worldFrom.y,
                      0,
                    ) / opening.edges.length,
                }
              : undefined;
            return (
              <g
                key={opening.featureId}
                className={`rs-opening-shape${on ? ' is-lit' : ''}`}
                data-status={status}
                data-testid={`rs-opening-${opening.ordinal}`}
                data-lit={on}
                onClick={(event) => {
                  event.stopPropagation();
                  openArea('openings', opening.featureId);
                }}
              >
                {opening.edges.map((edge) => {
                  const a = toSvg(edge.worldFrom);
                  const b = toSvg(edge.worldTo);
                  return (
                    <line
                      key={edge.edgeId}
                      className={`rs-opening-edge is-${edge.side}`}
                      data-side={edge.side}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      strokeWidth={
                        edge.side === 'bottom'
                          ? stroke * (on ? 4 : 3)
                          : stroke * (on ? 3 : 2)
                      }
                      strokeDasharray={
                        edge.side === 'top'
                          ? `${stroke * 4} ${stroke * 2}`
                          : undefined
                      }
                    />
                  );
                })}
                {centre && (
                  <text
                    className="rs-label"
                    x={centre.x}
                    y={-centre.y}
                    fontSize={labelScale}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {c.opening(opening.ordinal)}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      {highlight.length > 0 && (
        <p className="rs-selection" data-testid="rs-selection">
          {features
            .filter((feature) => lit.has(feature.id))
            .map(label)
            .join(', ')}
        </p>
      )}
    </div>
  );

  // ── Area editors ─────────────────────────────────────────────────────
  const componentsOf = (roles: readonly RoofLineComponentRole[]) =>
    system.lineComponents.filter((item) =>
      roles.includes(item.role as RoofLineComponentRole),
    );
  const intentOf = (id: string) =>
    intent?.lineComponents?.find((item) => item.id === id);
  const cards = (
    roles: readonly RoofLineComponentRole[],
    selectable?: 'eave' | 'verge',
  ) => {
    const list = componentsOf(roles);
    const choices = selectable
      ? features
          .filter((feature) => feature.kind === selectable)
          .map((feature) => ({ id: feature.id, label: label(feature) }))
      : [];
    return (
      <>
        {!list.length && <p className="rs-muted">{c.noComponents}</p>}
        {list.map((item) => {
          const own = intentOf(item.componentId);
          return (
            <ComponentCard
              key={item.componentId}
              item={item}
              intent={own}
              topology={topology}
              locale={locale}
              c={c}
              onHighlight={setHighlight}
              onRemove={() => removeComponent(item.componentId)}
            >
              {selectable && own && (
                <FeatureChips
                  features={choices}
                  label={c.eavesFor}
                  selected={own.featureIds ?? choices.map((item) => item.id)}
                  onChange={(featureIds) =>
                    commitComponent({ ...own, featureIds })
                  }
                />
              )}
            </ComponentCard>
          );
        })}
        {adding ? (
          <ComponentPicker
            roles={roles}
            coveringProductId={coveringProductId}
            openEnds={openEnds}
            locale={locale}
            c={c}
            nextId={nextLineComponentId(intent)}
            onAdd={commitComponent}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className="a-primary"
            data-testid="rs-add-component"
            onClick={() => setAdding(true)}
          >
            {c.add}
          </button>
        )}
      </>
    );
  };
  const tileAccessories = (roles: readonly string[]) => {
    const rows = (facts.tilePurchasePlans ?? []).flatMap((tilePlan) =>
      tilePlan.accessories
        .filter((item) => roles.includes(item.role))
        .map((item) => ({ item, plan: tilePlan })),
    );
    if (!(facts.tilePurchasePlans ?? []).length) return null;
    return (
      <div className="rs-card is-summary">
        <small>{c.tileAccessories}</small>
        <ul className="rs-list">
          {rows.map(({ item, plan: tilePlan }) => (
            <li key={`${tilePlan.assignmentId}:${item.role}`}>
              <span>
                {materialText(locale, `tileAccessory.${item.role}`)}
                {item.selection?.displaySnapshot?.familyName
                  ? ` · ${item.selection.displaySnapshot.familyName}`
                  : ''}
              </span>
              <strong>
                {item.quantity !== undefined
                  ? c.pieces(item.quantity)
                  : c.needsDecision}
              </strong>
            </li>
          ))}
        </ul>
        <button type="button" className="dw-link" onClick={onOpenTilePlan}>
          {c.openTilePlan}
        </button>
      </div>
    );
  };

  const drainageDetail = (
    <div className="rs-editor">
      {!drainageOn ? (
        <p className="rs-muted">{c.drainageOff}</p>
      ) : (
        plan.runs.map((run) => {
          const assemblies = run.segments.flatMap((segment) =>
            segment.assembly ? [segment.assembly] : [],
          );
          const sections = assemblies.flatMap((item) => item.sectionsMm);
          const byLength = new Map<number, number>();
          for (const section of sections)
            byLength.set(section, (byLength.get(section) ?? 0) + 1);
          return (
            <article
              key={run.id}
              className="rs-card"
              data-testid="rs-gutter-run"
            >
              <header>
                <strong>{c.run(run.ordinal)}</strong>
              </header>
              <dl className="rs-facts">
                <div>
                  <dt>{c.eaveLength}</dt>
                  <dd>
                    {new Intl.NumberFormat(locale, {
                      maximumFractionDigits: 2,
                    }).format(run.lengthMm / 1000)}{' '}
                    m
                  </dd>
                </div>
                {sections.length > 0 && (
                  <div>
                    <dt>{c.gutterPlan}</dt>
                    <dd>
                      {[...byLength]
                        .map(
                          ([length, count]) =>
                            `${count} × ${new Intl.NumberFormat(locale).format(length / 1000)} m`,
                        )
                        .join(' + ')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>{c.connectors}</dt>
                  <dd>
                    {assemblies.reduce((sum, item) => sum + item.joints, 0)}
                  </dd>
                </div>
                <div>
                  <dt>{c.hooks}</dt>
                  <dd>
                    {run.segments.reduce(
                      (sum, segment) => sum + segment.hookPositionsMm.length,
                      0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{c.outlets}</dt>
                  <dd>
                    {
                      plan.outlets.filter((item) => item.runId === run.id)
                        .length
                    }
                  </dd>
                </div>
              </dl>
            </article>
          );
        })
      )}
      {drainageOn && plan.hooks.avoidsJoints && (
        <p className="rs-muted" data-testid="rs-hook-rule">
          {c.hookSource}{' '}
          {c.hookStrategy(`${(plan.hooks.jointClearanceMm ?? 0) / 10} cm`)}
        </p>
      )}
      <div className="dw-chips">
        {drainageOn && (
          <button
            type="button"
            aria-pressed={showHooks}
            data-testid="rs-show-hooks"
            onClick={() => {
              setShowHooks(!showHooks);
              setLayers((current) => new Set([...current, 'drainage']));
            }}
          >
            {showHooks ? c.hideHooks : c.showHooks}
          </button>
        )}
        <button type="button" className="a-primary" onClick={onOpenDrainage}>
          {c.openDrainage}
        </button>
      </div>
    </div>
  );

  const openingDetail = (
    <div className="rs-editor">
      <ul className="rs-list">
        {system.openingSystems.map((opening) => (
          <li key={opening.featureId}>
            <button
              type="button"
              className="dw-link"
              aria-pressed={openingId === opening.featureId}
              data-testid={`rs-opening-open-${opening.ordinal}`}
              onClick={() => openArea('openings', opening.featureId)}
            >
              {c.opening(opening.ordinal)} · {Math.round(opening.widthMm / 10)}{' '}
              × {Math.round(opening.heightMm / 10)} cm
            </button>
            <strong
              className={`rs-state is-${
                opening.flashing.status === 'resolved' ? 'ready' : 'attention'
              }`}
            >
              {opening.flashing.status === 'resolved'
                ? `✓ ${opening.flashing.name}`
                : c.flashingRequired}
            </strong>
          </li>
        ))}
      </ul>
      {(() => {
        const opening = system.openingSystems.find(
          (item) => item.featureId === openingId,
        );
        if (!opening) return null;
        return (
          <OpeningEditor
            key={opening.featureId}
            opening={opening}
            intent={intent?.openings?.find(
              (item) => item.featureId === opening.featureId,
            )}
            locale={locale}
            c={c}
            onChange={(next) => state.setRoofSystem(withOpening(intent, next))}
          />
        );
      })()}
    </div>
  );

  const editor = (key: RoofSystemAreaKey) => {
    switch (key) {
      case 'covering':
        return (
          <div className="rs-editor">
            {(facts.coverings ?? []).length ? (
              <ul className="rs-list">
                {(facts.coverings ?? []).map((item) => (
                  <li key={item.id}>
                    <span>
                      {[
                        item.product.displaySnapshot?.manufacturer,
                        item.product.displaySnapshot?.familyName,
                      ]
                        .filter(Boolean)
                        .join(' ') || item.id}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rs-muted">{c.noCovering}</p>
            )}
            <div className="dw-chips">
              <button type="button" onClick={onOpenCovering}>
                {c.openCovering}
              </button>
              {(facts.coverings ?? []).some(
                (item) =>
                  item.product.technicalSpecSnapshot.kind === 'roof-tile',
              ) && (
                <button type="button" onClick={onOpenTilePlan}>
                  {c.openTilePlan}
                </button>
              )}
            </div>
          </div>
        );
      case 'ridge':
        return (
          <div className="rs-editor">
            {tileAccessories(['ridge', 'hip-ridge'])}
            {cards(RIDGE_ROLES)}
          </div>
        );
      case 'verge':
        return (
          <div className="rs-editor">
            {tileAccessories(['verge-left', 'verge-right'])}
            {cards(VERGE_ROLES, 'verge')}
          </div>
        );
      case 'eave':
        return <div className="rs-editor">{cards(EAVE_ROLES, 'eave')}</div>;
      case 'openings':
        return openingDetail;
      case 'drainage':
        return drainageDetail;
    }
  };

  const areaSummary = (key: RoofSystemAreaKey) => {
    const items = system.lineComponents.filter((item) => {
      const group = ROOF_SYSTEM_ROLE_GROUP[item.role];
      return key === 'ridge'
        ? group === 'ridge-hip'
        : key === 'eave'
          ? group === 'eave'
          : key === 'verge'
            ? group === 'verge'
            : false;
    });
    if (key === 'openings')
      return `${system.openingSystems.length} × ${c.window.toLowerCase()}`;
    if (key === 'drainage')
      return drainageOn
        ? (intent?.drainage?.system?.name ?? '')
        : c.drainageOff;
    return items.map((item) => item.name).join(', ');
  };

  const overview = (
    <ul className="rs-areas" data-testid="rs-areas">
      {checklist.areas.map((item) => (
        <li key={item.key} data-state={item.state}>
          <button
            type="button"
            disabled={item.state === 'not-applicable'}
            data-testid={`rs-area-${item.key}`}
            onClick={() => openArea(item.key)}
          >
            <span className="rs-area-name">{c.area[item.key]}</span>
            <small>
              {item.state === 'not-applicable' ? '' : areaSummary(item.key)}
            </small>
            <strong className={`rs-state is-${item.state}`}>
              {c.state[item.state]}
            </strong>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="rs-workspace" data-testid="roof-system-workspace">
      <header className="rs-header">
        <div>
          <h2>{c.title}</h2>
          <p className="rs-counts" data-testid="rs-counts">
            {c.counts(
              checklist.counts.ready,
              checklist.counts.attention,
              checklist.counts.optional,
            )}
          </p>
        </div>
        {checklist.hasBaseCovering && (
          <button
            type="button"
            className="a-primary"
            data-testid="rs-complete"
            onClick={() => {
              setCompleting(!completing);
              setArea(undefined);
            }}
          >
            {c.complete}
          </button>
        )}
      </header>
      <div className="rs-body">
        {canvas}
        <aside className="rs-inspector">
          {completing ? (
            <Checklist
              c={c}
              checklist={checklist}
              onOpen={openArea}
              onClose={() => setCompleting(false)}
            />
          ) : area ? (
            <>
              <button
                type="button"
                className="dw-link"
                data-testid="rs-back"
                onClick={() => {
                  setArea(undefined);
                  setHighlight([]);
                  setOpeningId(undefined);
                  setAdding(false);
                }}
              >
                {c.back}
              </button>
              <h3 data-testid="rs-area-title">{c.area[area]}</h3>
              {editor(area)}
            </>
          ) : (
            <>
              <p className="rs-muted">{c.intro}</p>
              {overview}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function Checklist({
  c,
  checklist,
  onOpen,
  onClose,
}: {
  c: RoofSystemCopy;
  checklist: ReturnType<typeof resolveRoofSystemChecklist>;
  onOpen: (area: RoofSystemAreaKey, featureId?: string) => void;
  onClose: () => void;
}) {
  const items = checklist.areas.flatMap((area) => area.items);
  return (
    <div className="rs-checklist" data-testid="rs-checklist">
      <h3>{c.completeTitle}</h3>
      <p className="rs-muted">{c.completeHelp}</p>
      <ul>
        {items.map((item) => (
          <li
            key={`${item.key}:${item.featureId ?? ''}`}
            data-state={item.state}
          >
            <button
              type="button"
              data-testid={`rs-check-${item.key}`}
              onClick={() => onOpen(item.area, item.featureId)}
            >
              <span aria-hidden="true">
                {item.state === 'done'
                  ? '✓'
                  : item.state === 'attention'
                    ? '⚠'
                    : '○'}
              </span>
              {item.key === 'opening-flashing'
                ? c.item['opening-flashing'](item.ordinal)
                : c.item[item.key]}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="dw-link" onClick={onClose}>
        {c.close}
      </button>
    </div>
  );
}
