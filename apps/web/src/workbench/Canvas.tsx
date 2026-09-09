import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Crosshair,
  Maximize,
  Minus,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fitDrawing, type DrawingModel } from '@cieslacalc/drawing-engine';
import type {
  WorkbenchObject,
  WorkbenchView,
} from '@cieslacalc/calculator-core';
import { Button } from '@cieslacalc/ui';
import { useWorkbench } from '../store';
import { fieldObject } from './Inspector';
import type { InputIssue } from './WorkbenchPage';
import { DrawingLayers } from './DrawingLayers';

export function Canvas({
  model,
  issues,
}: {
  model: DrawingModel | null;
  issues: InputIssue[];
}) {
  const { t } = useTranslation();
  const state = useWorkbench();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const height = width < 500 ? 390 : 510;
  const project = model
    ? fitDrawing(model.bounds, {
        width,
        height,
        padding: width < 500 ? 58 : 92,
      }).project
    : (p: { x: number; y: number }) => p;
  const setView = (view: WorkbenchView) => {
    state.setView(view);
    setZoom(1);
  };
  function select(object: WorkbenchObject) {
    state.select(object);
  }
  return (
    <section className="canvas-panel" aria-label={t('drawingLabel')}>
      <div className="canvas-toolbar">
        <div className="view-tabs" role="group" aria-label={t('drawingLabel')}>
          {(['assembly', 'member', 'detail'] as const).map((view) => (
            <button
              type="button"
              key={view}
              aria-pressed={state.view === view}
              onClick={() => setView(view)}
            >
              {t(`views.${view}`)}
            </button>
          ))}
        </div>
        <label className="dimension-switch">
          <input
            type="checkbox"
            checked={state.dimensions}
            onChange={state.toggleDimensions}
          />
          <span>{t('dimensions')}</span>
        </label>
      </div>
      <div className="canvas-info">
        <span>
          <Crosshair size={13} />
          {t(`viewHints.${state.view}`)}
        </span>
        <span>{state.unit}</span>
      </div>
      {state.view === 'detail' && (
        <div
          className="detail-selector"
          role="group"
          aria-label={t('detailHint')}
        >
          {(['birdsmouth', 'ridge-cut'] as const).map((object) => (
            <button
              type="button"
              key={object}
              aria-pressed={state.detailTarget === object}
              onClick={() => {
                select(object);
                setZoom(1);
              }}
            >
              {t(`objects.${object}`)}
            </button>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className="drawing-surface"
        style={{ minHeight: height }}
      >
        {model ? (
          <svg
            viewBox={`${width / 2 - width / zoom / 2} ${height / 2 - height / zoom / 2} ${width / zoom} ${height / zoom}`}
            className="workbench-drawing"
            style={{ height }}
            role="group"
            aria-label={t('drawingLabel')}
          >
            <title>{t('drawingLabel')}</title>
            <DrawingLayers
              model={model}
              project={project}
              selected={state.selected}
              onSelect={select}
              dimensions={state.dimensions}
              compact={width < 500}
            />
          </svg>
        ) : (
          <div className="drawing-empty">
            <AlertCircle size={32} />
            <h2>{t('invalidTitle')}</h2>
            <p>{t('invalidHint')}</p>
            <div>
              {Array.from(
                new Map(issues.map((issue) => [issue.field, issue])).values(),
              ).map((issue) => (
                <Button
                  key={issue.field}
                  onClick={() => {
                    state.select(fieldObject(issue.field));
                    requestAnimationFrame(() =>
                      document.getElementById(issue.field)?.focus(),
                    );
                  }}
                >
                  {t(`fields.${issue.field}`)} →
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="canvas-navigation">
          <Button
            aria-label={t('zoomOut')}
            disabled={!model || zoom <= 0.75}
            onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
          >
            <Minus size={15} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            aria-label={t('zoomIn')}
            disabled={!model || zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            <Plus size={15} />
          </Button>
          <span className="nav-divider" />
          <Button aria-label={t('fit')} onClick={() => setZoom(1)}>
            <Maximize size={16} />
          </Button>
        </div>
      </div>
      <div className="canvas-legend">
        <span>
          <i className="swatch timber" />
          {t('timber')}
        </span>
        <span>
          <i className="swatch support" />
          {t('support')}
        </span>
        <span>
          <i className="swatch cut" />
          {t('cut')}
        </span>
        <span>
          <i className="swatch axis" />
          {t('axis')}
        </span>
      </div>
      <div className="canvas-footnote">
        <span>
          <Check size={13} />
          {t('fullChain')}
        </span>
        <span>X / Y · 2D</span>
      </div>
    </section>
  );
}
