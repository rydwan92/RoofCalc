import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fitDimensionedDrawing,
  layoutDimensionLanes,
  type DetailFabricationStep,
  type DetailKeyDimension,
  type DetailPreviewModel,
  type DrawingDimension,
  type Point,
} from '@cieslacalc/drawing-engine';
import { formatLength, formatNumber } from '../format';
import { useAssembly } from './store';
import { useMobileWorkbench } from './mobile-workbench';

function DimensionValue({ dimension }: { dimension: DetailKeyDimension }) {
  const state = useAssembly();
  const { i18n } = useTranslation();
  if (dimension.unit === 'length')
    return (
      <>
        {formatLength(dimension.value, state.unit, i18n.language)}{' '}
        <small>{state.unit}</small>
      </>
    );
  if (dimension.unit === 'angle')
    return (
      <>
        {formatNumber(dimension.value, i18n.language)}
        <small>°</small>
      </>
    );
  return (
    <>
      {formatNumber(dimension.value * 100, i18n.language)}
      <small>%</small>
    </>
  );
}

export function detailStepText(
  step: DetailFabricationStep,
  t: ReturnType<typeof useTranslation>['t'],
  length: (value: number) => string,
  angle: (value: number) => string,
  unit: string,
) {
  switch (step.action) {
    case 'mark-plumb':
      return t('assembly.detailStepMarkPlumb', {
        from: step.fromLabel ?? '—',
        to: step.targetLabel ?? '—',
        distance: step.distanceMm === undefined ? '—' : length(step.distanceMm),
        angle: step.angleDeg === undefined ? '—' : angle(step.angleDeg),
        unit,
      });
    case 'mark-seat':
      return t('assembly.detailStepMarkSeat', {
        seat: step.seatLengthMm === undefined ? '—' : length(step.seatLengthMm),
        from: step.fromLabel ?? '—',
        to: step.targetLabel ?? '—',
        unit,
      });
    case 'check-depth':
      return t('assembly.detailStepCheckDepth', {
        depth:
          step.normalDepthMm === undefined ? '—' : length(step.normalDepthMm),
        remaining:
          step.remainingDepthMm === undefined
            ? '—'
            : length(step.remainingDepthMm),
        unit,
      });
    case 'measure-ridge-face':
      return t('assembly.detailStepMeasureHip', {
        distance: step.distanceMm === undefined ? '—' : length(step.distanceMm),
        unit,
      });
    case 'mark-double-cheek':
      return t('assembly.detailStepCheek', {
        angle: step.angleDeg === undefined ? '—' : angle(step.angleDeg),
      });
    case 'check-backing':
      return t('assembly.detailStepBacking', {
        angle: step.angleDeg === undefined ? '—' : angle(step.angleDeg),
      });
  }
}

export function DetailPreviewDrawing({
  preview,
  compact = false,
  cutState = 'before',
}: {
  preview: DetailPreviewModel;
  compact?: boolean;
  cutState?: 'before' | 'after';
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(compact ? 300 : 520);
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = compact ? 165 : width < 520 ? 230 : 285;
  const drawing = preview.cutStates?.[cutState] ?? preview.drawing;
  const label = (dimension: DrawingDimension) =>
    `${formatLength(dimension.valueMm, state.unit, i18n.language)} ${state.unit}`;
  const visibleDimensions = compact
    ? drawing.dimensions.slice(0, 1)
    : drawing.dimensions;
  const projection = fitDimensionedDrawing(
    drawing.bounds,
    { width, height, padding: compact ? 26 : 52 },
    visibleDimensions,
    (dimension) => label(dimension).length * 6.5,
  );
  const lanes = layoutDimensionLanes(
    visibleDimensions,
    projection.project,
    (dimension) => label(dimension).length * 6.5,
  );
  const points = (vertices: Point[]) =>
    vertices
      .map(projection.project)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  return (
    <div
      ref={container}
      className={`a-detail-preview-drawing ${compact ? 'is-compact' : ''}`}
    >
      <span className="a-detail-frame">
        {t(`assembly.${preview.localFrame}`)}
      </span>
      {!compact && preview.subjectCode === 'K1' && (
        <div
          className="a-detail-orientation"
          aria-label={t('assembly.memberOrientation')}
        >
          <span>{t('assembly.topEdge')}</span>
          <span>{t('assembly.bottomEdge')}</span>
          <span>{t('assembly.eaveToRidge')}</span>
          <span>{t('assembly.outerEaveDatum')}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t(`assembly.${preview.titleKey}`)}
        data-testid={`detail-preview-${preview.type}`}
      >
        <title>{t(`assembly.${preview.titleKey}`)}</title>
        {drawing.polygons?.map((polygon) => (
          <polygon
            key={polygon.id}
            points={points(polygon.points)}
            className={`shape shape-${polygon.role}`}
          />
        ))}
        {drawing.lines.map((line) => {
          const from = projection.project(line.from);
          const to = projection.project(line.to);
          return (
            <line
              key={line.id}
              className={`technical-line ${line.role}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
        {!compact && (
          <g className="dimension-layer" pointerEvents="none">
            {lanes.map(({ dimension, layout }) => (
              <g key={dimension.id} className="technical-dimension">
                <path
                  d={`M${layout.extensionA.x} ${layout.extensionA.y} L${layout.a.x} ${layout.a.y} L${layout.b.x} ${layout.b.y} L${layout.extensionB.x} ${layout.extensionB.y}`}
                />
                <circle cx={layout.a.x} cy={layout.a.y} r={2} />
                <circle cx={layout.b.x} cy={layout.b.y} r={2} />
                <text
                  textAnchor="middle"
                  transform={`translate(${layout.label.x} ${layout.label.y}) rotate(${layout.rotationDeg})`}
                >
                  {label(dimension)}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}

export function PreviewFacts({ preview }: { preview: DetailPreviewModel }) {
  const { t } = useTranslation();
  return (
    <dl className="a-detail-facts">
      {preview.keyDimensions.map((dimension) => (
        <div key={dimension.id}>
          <dt>{t(`assembly.${dimension.labelKey}`)}</dt>
          <dd>
            <DimensionValue dimension={dimension} />
          </dd>
          {dimension.referenceKey && (
            <small>{t(`assembly.${dimension.referenceKey}`)}</small>
          )}
        </div>
      ))}
    </dl>
  );
}

export function PreviewSteps({ preview }: { preview: DetailPreviewModel }) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const length = (value: number) =>
    formatLength(value, state.unit, i18n.language);
  const angle = (value: number) => formatNumber(value, i18n.language);
  return (
    <ol className="a-detail-steps">
      {preview.fabricationSteps.map((step, index) => (
        <li key={step.id}>
          <span>{index + 1}</span>
          <p>{detailStepText(step, t, length, angle, state.unit)}</p>
        </li>
      ))}
    </ol>
  );
}

export function DetailDrawer({
  previews,
  activeId,
  open,
  mode,
  pinned,
  cutState,
  onSelect,
  onModeChange,
  onClose,
  onPin,
  onCutStateChange,
  onZoom,
}: {
  previews: DetailPreviewModel[];
  activeId?: string;
  open: boolean;
  mode: 'collapsed' | 'working' | 'focus';
  pinned: boolean;
  cutState: 'before' | 'after';
  onSelect: (id: string) => void;
  onModeChange: (mode: 'collapsed' | 'working' | 'focus') => void;
  onClose: () => void;
  onPin: () => void;
  onCutStateChange: (state: 'before' | 'after') => void;
  onZoom: (preview: DetailPreviewModel) => void;
}) {
  const { t } = useTranslation();
  const mobile = useMobileWorkbench();
  const [mobileSection, setMobileSection] = useState<
    'drawing' | 'dimensions' | 'steps'
  >('drawing');
  const active =
    previews.find((preview) => preview.id === activeId) ?? previews[0];
  if (!active) return null;
  return (
    <section
      className={`a-detail-drawer ${open ? 'is-open' : 'is-collapsed'} mode-${mode} ${pinned ? 'is-pinned' : ''}`}
      aria-label={t('assembly.detailDrawer')}
      data-testid="detail-drawer"
    >
      <header>
        <button
          className="a-detail-drawer-title"
          onClick={() => onModeChange(open ? 'collapsed' : 'working')}
          aria-expanded={open}
        >
          <ChevronDown size={18} />
          <span>
            <small>{t('assembly.detailDrawer')}</small>
            <strong>
              {active.subjectCode} · {t(`assembly.${active.titleKey}`)}
            </strong>
          </span>
        </button>
        <div>
          <button
            className="a-icon"
            aria-label={t('assembly.minimizeDetail')}
            aria-pressed={mode === 'collapsed'}
            onClick={() => onModeChange('collapsed')}
          >
            <Minimize2 size={17} />
          </button>
          <button
            className="a-icon"
            aria-label={t('assembly.focusDetail')}
            aria-pressed={mode === 'focus'}
            onClick={() => onModeChange(mode === 'focus' ? 'working' : 'focus')}
          >
            <Maximize2 size={17} />
          </button>
          <button
            className="a-icon a-pin-detail"
            aria-pressed={pinned}
            aria-label={t(
              pinned ? 'assembly.unpinDetail' : 'assembly.pinDetail',
            )}
            onClick={onPin}
          >
            {pinned ? <PinOff size={17} /> : <Pin size={17} />}
          </button>
          <button
            className="a-icon"
            aria-label={t('assembly.closeDetail')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      {open && (
        <div className="a-detail-drawer-body">
          {mobile && (
            <div
              className="a-mobile-detail-sections"
              role="tablist"
              aria-label={t('assembly.detailDrawer')}
            >
              {(['drawing', 'dimensions', 'steps'] as const).map((section) => (
                <button
                  key={section}
                  role="tab"
                  aria-selected={mobileSection === section}
                  onClick={() => setMobileSection(section)}
                >
                  {t(
                    `assembly.mobileDetail${section[0]!.toUpperCase()}${section.slice(1)}`,
                  )}
                </button>
              ))}
            </div>
          )}
          {previews.length > 1 && (
            <div
              className="a-detail-tabs"
              role="tablist"
              aria-label={t('assembly.availableDetails')}
            >
              {previews.map((preview) => (
                <button
                  key={preview.id}
                  role="tab"
                  aria-selected={preview.id === active.id}
                  onClick={() => onSelect(preview.id)}
                >
                  {t(`assembly.${preview.titleKey}`)}
                </button>
              ))}
            </div>
          )}
          {(!mobile || mobileSection === 'drawing') && (
            <div className="a-detail-drawing-column">
              {active.cutStates && (
                <div
                  className="a-cut-state-switch"
                  role="tablist"
                  aria-label={t('assembly.cutState')}
                >
                  {(['before', 'after'] as const).map((state) => (
                    <button
                      key={state}
                      role="tab"
                      aria-selected={cutState === state}
                      onClick={() => onCutStateChange(state)}
                    >
                      {t(`assembly.${state}Cut`)}
                    </button>
                  ))}
                </div>
              )}
              <DetailPreviewDrawing preview={active} cutState={cutState} />
              <button className="a-button" onClick={() => onZoom(active)}>
                <Maximize2 size={16} />
                {t('assembly.zoomToDetail')}
              </button>
            </div>
          )}
          {(!mobile || mobileSection === 'dimensions') && (
            <section>
              <h3>{t('assembly.keyDimensions')}</h3>
              <PreviewFacts preview={active} />
            </section>
          )}
          {(!mobile || mobileSection === 'steps') && (
            <section>
              <h3>{t('assembly.markingSteps')}</h3>
              <PreviewSteps preview={active} />
              {active.warningKeys.map((warning) => (
                <p className="a-detail-warning" key={warning}>
                  {t(`assembly.${warning}`)}
                </p>
              ))}
            </section>
          )}
        </div>
      )}
    </section>
  );
}

export function QuickDetailDialog({
  preview,
  onClose,
  onOpenBuilder,
}: {
  preview: DetailPreviewModel;
  onClose: () => void;
  onOpenBuilder: (preview: DetailPreviewModel) => void;
}) {
  const { t } = useTranslation();
  const [cutState, setCutState] = useState<'before' | 'after'>('before');
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(() => {
    closeButton.current?.focus();
    const previousFocus = returnFocus.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="a-quick-detail-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="a-quick-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-detail-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key === 'Tab') {
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled])',
              ),
            );
            const first = focusable[0];
            const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <small>{preview.subjectCode}</small>
            <h2 id="quick-detail-title">{t(`assembly.${preview.titleKey}`)}</h2>
          </div>
          <button
            ref={closeButton}
            className="a-icon"
            aria-label={t('assembly.closeQuickDetail')}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {preview.cutStates && (
          <div
            className="a-cut-state-switch"
            role="tablist"
            aria-label={t('assembly.cutState')}
          >
            {(['before', 'after'] as const).map((state) => (
              <button
                key={state}
                role="tab"
                aria-selected={cutState === state}
                onClick={() => setCutState(state)}
              >
                {t(`assembly.${state}Cut`)}
              </button>
            ))}
          </div>
        )}
        <div className="a-quick-detail-content">
          <div className="a-quick-detail-drawing">
            <DetailPreviewDrawing preview={preview} cutState={cutState} />
          </div>
          <section>
            <h3>{t('assembly.keyDimensions')}</h3>
            <PreviewFacts preview={preview} />
          </section>
          <section>
            <h3>{t('assembly.markingSteps')}</h3>
            <PreviewSteps preview={preview} />
            {preview.warningKeys.map((warning) => (
              <p className="a-detail-warning" key={warning}>
                {t(`assembly.${warning}`)}
              </p>
            ))}
          </section>
        </div>
        <footer>
          <button
            className="a-button a-primary"
            onClick={() => onOpenBuilder(preview)}
          >
            {t('assembly.openDetailInBuilder')}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function QuickCutPreviews({
  previews,
  onOpen,
}: {
  previews: DetailPreviewModel[];
  onOpen: (preview: DetailPreviewModel) => void;
}) {
  const { t } = useTranslation();
  if (!previews.length) return null;
  return (
    <section
      className="a-quick-cut-previews"
      aria-label={t('assembly.quickCutPreviews')}
    >
      <header>
        <span>{t('assembly.quickCutPreviews')}</span>
        <small>{t('assembly.sameModelPreview')}</small>
      </header>
      <div>
        {previews.map((preview) => (
          <button
            key={preview.id}
            className="a-quick-cut-card"
            aria-label={`${preview.subjectCode} · ${t(`assembly.${preview.titleKey}`)}`}
            onClick={() => onOpen(preview)}
          >
            <h3>
              {preview.subjectCode} · {t(`assembly.${preview.titleKey}`)}
            </h3>
            <DetailPreviewDrawing preview={preview} compact />
            <dl>
              {preview.keyDimensions.slice(0, 2).map((dimension) => (
                <div key={dimension.id}>
                  <dt>{t(`assembly.${dimension.labelKey}`)}</dt>
                  <dd>
                    <DimensionValue dimension={dimension} />
                  </dd>
                </div>
              ))}
            </dl>
          </button>
        ))}
      </div>
    </section>
  );
}
