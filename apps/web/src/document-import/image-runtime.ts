import {
  checkImageDimensions,
  type DocumentPageInfo,
} from '@cieslacalc/document-import-core';

/**
 * Raster documents (photos, scans). The browser decodes the bytes; nothing
 * is uploaded. A raster has no text layer and no physical size, so it is
 * used as an underlay for calibrated manual measurement only.
 */
export interface OpenedImage {
  pages: DocumentPageInfo[];
  render(canvas: HTMLCanvasElement, cssScale: number): void;
  close(): void;
}

export class ImageTooLargeError extends Error {
  constructor() {
    super('image-too-large');
    this.name = 'ImageTooLargeError';
  }
}

export async function openImage(blob: Blob): Promise<OpenedImage> {
  const bitmap = await createImageBitmap(blob);
  if (checkImageDimensions(bitmap.width, bitmap.height).status !== 'accepted') {
    bitmap.close();
    throw new ImageTooLargeError();
  }
  return {
    pages: [
      { page: 1, width: bitmap.width, height: bitmap.height, unit: 'px' },
    ],
    render(canvas, cssScale) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const scale = cssScale * ratio;
      canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
      canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
      canvas.style.width = `${Math.floor(bitmap.width * cssScale)}px`;
      canvas.style.height = `${Math.floor(bitmap.height * cssScale)}px`;
      const context = canvas.getContext('2d');
      context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    },
    close() {
      bitmap.close();
    },
  };
}

/** Content fingerprint used to bind any future external-processing consent. */
export async function fingerprintBytes(bytes: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return `sha256:${[...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`;
  }
  // Insecure contexts have no SubtleCrypto; a weak local id is enough
  // there because no engine that needs consent is available anyway.
  let hash = 0x811c9dc5;
  for (const byte of new Uint8Array(bytes)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a:${bytes.byteLength}:${hash.toString(16)}`;
}
