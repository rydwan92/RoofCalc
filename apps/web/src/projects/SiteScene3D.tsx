import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Maximize } from 'lucide-react';
import type { RoofProjectDocumentV2 } from '@cieslacalc/calculator-core';
import {
  DEFAULT_SCENE_VISIBILITY_POLICY,
  resolveSceneEntityVisibility,
  type SceneViewPreset,
} from '@cieslacalc/technical-scene';
import {
  TechnicalViewport,
  type EntityPresentation,
} from '../assembly/scene3d/viewport';
import { deriveSiteTechnicalScene } from './site-scene';

const PRESETS: readonly SceneViewPreset[] = ['isometric', 'top', 'front'];

/**
 * VNext-14: the site in 3D — every structure's timber, placed where it
 * stands, in the workbench's own renderer. A view, not an editor: it
 * selects nothing and edits nothing.
 */
export default function SiteScene3D({
  document,
}: {
  document: RoofProjectDocumentV2;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<TechnicalViewport | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preset, setPreset] = useState<SceneViewPreset>('isometric');
  const site = useMemo(() => deriveSiteTechnicalScene(document), [document]);
  const presentation = useMemo(() => {
    const map = new Map<string, EntityPresentation>();
    for (const entity of site.scene.entities) {
      // Every structure in its own timber colours; the chips say which is open.
      const emphasis = 'normal' as const;
      map.set(entity.id, {
        emphasis,
        visibility: resolveSceneEntityVisibility(
          entity,
          emphasis,
          DEFAULT_SCENE_VISIBILITY_POLICY,
        ),
      });
    }
    return map;
  }, [site]);

  // A device without WebGL keeps the plan of the site; nothing breaks.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let viewport: TechnicalViewport;
    try {
      viewport = new TechnicalViewport(canvas);
    } catch {
      setFailed(true);
      return;
    }
    viewportRef.current = viewport;
    setReady(true);
    const observer = new ResizeObserver(() => viewport.resize());
    observer.observe(canvas);
    viewport.resize();
    return () => {
      observer.disconnect();
      viewportRef.current = null;
      setReady(false);
      viewport.dispose();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !ready) return;
    viewport.setScene(site.scene);
    viewport.fit(site.scene.bounds, preset);
    // The preset buttons frame the camera themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, site]);

  useEffect(() => {
    if (ready) viewportRef.current?.setPresentation(presentation, true);
  }, [presentation, ready]);

  if (failed)
    return (
      <p className="a-site-3d-unavailable" role="status">
        <Box size={16} aria-hidden="true" />
        {t('assembly.structures.site3dUnavailable')}
      </p>
    );
  return (
    <div className="a-site-3d" data-testid="site-scene-3d">
      <div className="a-site-3d-controls" role="group">
        {PRESETS.map((entry) => (
          <button
            key={entry}
            type="button"
            className="a-button a-ghost"
            aria-pressed={preset === entry}
            data-scene-preset={entry}
            onClick={() => {
              setPreset(entry);
              viewportRef.current?.fit(site.scene.bounds, entry);
            }}
          >
            {t(`assembly.scene3d.preset.${entry}`)}
          </button>
        ))}
        <button
          type="button"
          className="a-button a-ghost"
          data-scene-action="fit"
          onClick={() => viewportRef.current?.fit(site.scene.bounds, preset)}
        >
          <Maximize size={15} aria-hidden="true" />
          {t('assembly.fit')}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="a-site-3d-canvas"
        aria-label={t('assembly.structures.site3dLabel')}
      />
    </div>
  );
}
