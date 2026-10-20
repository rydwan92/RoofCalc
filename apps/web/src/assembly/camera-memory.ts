import type { ViewportState } from '@cieslacalc/drawing-engine';

/**
 * VNext-5: the drawing's camera (zoom + pan) per roof type, for this session
 * only, so moving between tasks that show the same roof keeps the view.
 * View state (ADR-002): never in the project, never in history. Cleared when
 * a different project document is loaded, so another project starts fitted.
 */
const cameras = new Map<string, ViewportState>();

export const canvasCamera = {
  get: (key: string) => cameras.get(key),
  has: (key: string) => cameras.has(key),
  set: (key: string, viewport: ViewportState) => {
    cameras.set(key, viewport);
  },
  forgetAll: () => cameras.clear(),
};
