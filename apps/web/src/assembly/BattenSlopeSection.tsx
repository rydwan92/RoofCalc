import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BattenPlaneLayoutResult,
  BattenEndFit,
  BattenEndFitOptions,
} from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import { useAssembly } from './store';
import { roofPlaneShortLabelKey } from './covering-presentation';
import { DraftLengthField } from './DraftLengthField';

/** What the slope section draws: the batten layout the engine resolved. */
export interface BattenSectionFacts {
  planes: {
    roofPlaneId: string;
    pitchDeg: number;
    layout: BattenPlaneLayoutResult;
  }[];
  battenWidthMm: number;
  battenHeightMm: number;
  /** Present while counter-battens are on. */
  counterBattenHeightMm?: number;
  /** The covering's gauge range, when a product states one. */
  allowedRangeMm?: { min: number; max: number };
  /** Present while no equal courses fit: where the last batten could go. */
  topBattenFit?: BattenEndFitOptions;
  /** …and where the first could go instead. */
  eaveBattenFit?: BattenEndFitOptions;
}

/**
 * VNext-14: one roof plane laid out along its fall line, eave left, top
 * right — how a roofer sets battens out on the rafter. Every batten sits at
 * the station the batten layout resolved (`BattenPlaneLayoutResult`), true
 * to scale along the plane; only the thicknesses are drawn larger, and the
 * caption says so. The dimension chain is the engine's: the first batten
 * from the eave, the regular gauge times its intervals, what is left at
 * the top.
 */
export function BattenSlopeSection({ facts }: { facts: BattenSectionFacts }) {
  const { t, i18n } = useTranslation();
  const unit = useAssembly((state) => state.unit);
  const battenLayout = useAssembly(
    (state) => state.projectDocument.project.buildUp.battenLayout,
  );
  const setBattenLayout = useAssembly((state) => state.setBattenLayout);
  const [planeId, setPlaneId] = useState<string>();
  const planes = facts.planes.filter(
    (plane) =>
      plane.layout.status === 'resolved' && plane.layout.stations.length > 0,
  );
  const plane =
    planes.find((candidate) => candidate.roofPlaneId === planeId) ?? planes[0];
  const length = (mm: number) =>
    `${formatLength(mm, unit, i18n.language)} ${unit}`;
  // The two setting-out distances a roofer decides, typed exactly; the
  // gauge between them follows the covering (or the manual value).
  const edit = battenLayout && (
    <div className="bs-edit">
      <div data-testid="batten-eave-offset">
        <DraftLengthField
          label={t('assembly.battenSection.eaveOffset')}
          value={battenLayout.eaveOffsetMm}
          onCommit={(value) =>
            setBattenLayout({
              ...battenLayout,
              eaveOffsetMm: value,
              enabled: true,
            })
          }
        />
      </div>
      <div data-testid="batten-ridge-offset">
        <DraftLengthField
          label={t('assembly.battenSection.ridgeOffset')}
          value={battenLayout.ridgeOffsetMm ?? 0}
          onCommit={(value) =>
            setBattenLayout({
              ...battenLayout,
              ridgeOffsetMm: value,
              enabled: true,
            })
          }
        />
      </div>
      <small>{t('assembly.battenSection.eaveOffsetHint')}</small>
    </div>
  );
  if (!plane) {
    if (!battenLayout) return null;
    // VNext-14: nothing divides into equal courses. The section stays and
    // says why, with the solver's nearest offsets one click away, smallest
    // change first; on a tie the last batten, since the eave detail usually
    // fixes the first one.
    const options = (end: 'top' | 'eave', fit?: BattenEndFitOptions) =>
      [fit?.larger, fit?.smaller]
        .filter((entry): entry is BattenEndFit => entry !== undefined)
        .map((entry) => ({ end, fit: entry }));
    const fits = [
      ...options('top', facts.topBattenFit),
      ...options('eave', facts.eaveBattenFit),
    ].sort((a, b) => Math.abs(a.fit.changeMm) - Math.abs(b.fit.changeMm));
    const signed = (mm: number) =>
      `${mm > 0 ? '+' : '−'}${length(Math.abs(mm))}`;
    return (
      <figure
        className="bs-section is-unresolved"
        data-testid="batten-slope-section"
      >
        <header>
          <strong>{t('assembly.battenSection.title')}</strong>
        </header>
        <div className="bs-unresolved" role="status">
          <strong>{t('assembly.battenSection.noRows')}</strong>
          <p>
            {fits.length > 0 && facts.allowedRangeMm
              ? t('assembly.battenSection.noRowsHint', {
                  min: length(facts.allowedRangeMm.min),
                  max: length(facts.allowedRangeMm.max),
                })
              : t('assembly.battenSection.noRowsManual')}
          </p>
          {fits.length > 0 && (
            <div className="bs-fits">
              {fits.map(({ end, fit }, index) => (
                <button
                  key={`${end}:${fit.changeMm}`}
                  type="button"
                  className={`a-button ${index === 0 ? 'a-primary' : ''}`}
                  data-testid={`batten-${end}-fit`}
                  data-change={fit.changeMm}
                  onClick={() =>
                    setBattenLayout({
                      ...battenLayout,
                      ...(end === 'top'
                        ? { ridgeOffsetMm: fit.offsetMm }
                        : { eaveOffsetMm: fit.offsetMm }),
                      enabled: true,
                    })
                  }
                >
                  {t(
                    end === 'top'
                      ? 'assembly.battenSection.fitTop'
                      : 'assembly.battenSection.fitEave',
                    { value: length(fit.offsetMm) },
                  )}
                  <small>
                    {t('assembly.battenSection.fitChange', {
                      change: signed(fit.changeMm),
                    })}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
        {edit}
      </figure>
    );
  }
  const { layout } = plane;
  const stations = layout.stations;
  const slopeMm = layout.slopeLengthMm;
  const first = stations[0]!;
  const last = stations[stations.length - 1]!;
  const intervals = layout.intervalCount ?? stations.length - 1;
  const gauge =
    layout.actualGaugeMm ??
    (intervals > 0 ? (last - first) / intervals : undefined);
  const gap = Math.max(0, slopeMm - last);
  // Thicknesses drawn larger so a batten reads at the scale of the plane.
  const lift = Math.max(1, (slopeMm * 0.035) / facts.battenHeightMm);
  const counter = (facts.counterBattenHeightMm ?? 0) * lift;
  const batten = facts.battenHeightMm * lift;
  const rafter = slopeMm * 0.025;
  const text = slopeMm * 0.028;
  const dimensionY = text * 2.2;
  const pad = text * 1.2;
  const chain = [
    { key: 'first', from: 0, to: first, label: length(first) },
    ...(intervals > 0 && gauge !== undefined
      ? [
          {
            key: 'gauge',
            from: first,
            to: last,
            label: `${intervals} × ${length(gauge)}`,
          },
        ]
      : []),
    ...(gap > 1
      ? [{ key: 'top', from: last, to: slopeMm, label: length(gap) }]
      : []),
  ];
  const top = -(counter + batten) - text * 2.2;
  return (
    <figure className="bs-section" data-testid="batten-slope-section">
      <header>
        <strong>{t('assembly.battenSection.title')}</strong>
        {planes.length > 1 && (
          <div
            className="bs-planes"
            role="group"
            aria-label={t('assembly.battenSection.planes')}
          >
            {planes.map((candidate) => (
              <button
                key={candidate.roofPlaneId}
                type="button"
                aria-pressed={candidate === plane}
                onClick={() => setPlaneId(candidate.roofPlaneId)}
              >
                {t(roofPlaneShortLabelKey(candidate.roofPlaneId))}
              </button>
            ))}
          </div>
        )}
      </header>
      <svg
        viewBox={`${-pad} ${top - pad} ${slopeMm + pad * 2} ${dimensionY + text * 1.6 - top + pad * 2}`}
        role="img"
        aria-label={t('assembly.battenSection.label')}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          className="bs-rafter"
          x={0}
          y={0}
          width={slopeMm}
          height={rafter}
        />
        {counter > 0 && (
          <rect
            className="bs-counter"
            x={0}
            y={-counter}
            width={slopeMm}
            height={counter}
          />
        )}
        {stations.map((station, index) => (
          <rect
            key={index}
            className={
              index === 0 || index === stations.length - 1
                ? 'bs-batten is-edge'
                : 'bs-batten'
            }
            data-station={station}
            x={station - facts.battenWidthMm / 2}
            y={-counter - batten}
            width={facts.battenWidthMm}
            height={batten}
          />
        ))}
        <text
          className="bs-end"
          x={0}
          y={top + text}
          fontSize={text}
          textAnchor="start"
        >
          {t('assembly.battenSection.eave')}
        </text>
        <text
          className="bs-end"
          x={slopeMm}
          y={top + text}
          fontSize={text}
          textAnchor="end"
        >
          {t('assembly.battenSection.top')}
        </text>
        <text
          className="bs-pitch"
          x={slopeMm / 2}
          y={top + text}
          fontSize={text}
          textAnchor="middle"
        >
          {t('assembly.battenSection.plane', {
            pitch: plane.pitchDeg,
            length: length(slopeMm),
          })}
        </text>
        {chain.map((part) => {
          // A short span carries its label beside it, not across the ticks.
          const narrow = part.to - part.from < text * 5;
          const labelX = !narrow
            ? (part.from + part.to) / 2
            : part.key === 'top'
              ? part.to
              : part.from;
          const anchor = !narrow
            ? 'middle'
            : part.key === 'top'
              ? 'end'
              : 'start';
          return (
            <g
              key={part.key}
              className="bs-dimension"
              data-dimension={part.key}
            >
              <line
                x1={part.from}
                x2={part.to}
                y1={rafter + dimensionY}
                y2={rafter + dimensionY}
              />
              {[part.from, part.to].map((x) => (
                <line
                  key={x}
                  x1={x}
                  x2={x}
                  y1={rafter + dimensionY - text * 0.5}
                  y2={rafter + dimensionY + text * 0.5}
                />
              ))}
              <text
                x={labelX}
                y={rafter + dimensionY - text * 0.35}
                fontSize={text}
                textAnchor={anchor}
              >
                {part.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <strong>
          {t('assembly.battenSection.rows', { count: layout.courseCount })}
        </strong>
        {gauge !== undefined && (
          <span>
            {t('assembly.battenSection.gauge', { value: length(gauge) })}
            {facts.allowedRangeMm &&
              ` ${t('assembly.battenSection.range', {
                min: length(facts.allowedRangeMm.min),
                max: length(facts.allowedRangeMm.max),
              })}`}
          </span>
        )}
        <span>
          {t('assembly.battenSection.first', { value: length(first) })}
        </span>
        <span>{t('assembly.battenSection.gap', { value: length(gap) })}</span>
        <small>{t('assembly.battenSection.scale')}</small>
      </figcaption>
      {edit}
    </figure>
  );
}
