import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  createPhysicalPassesPdf,
  PHYSICAL_PASSES_PER_PDF_PAGE,
  physicalPassesPdfFilename,
  rasterizePhysicalPassSvg
} from './physical-passes-pdf';

const onePixelPng = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='),
  (character) => character.charCodeAt(0)
);

describe('physical passes PDF', () => {
  it('lays out 30 passes per A4 landscape page and orders them by pass number', async () => {
    const passes = Array.from({ length: PHYSICAL_PASSES_PER_PDF_PAGE + 1 }, (_, index) => ({
      id: `pass-${index + 1}`,
      passNumber: PHYSICAL_PASSES_PER_PDF_PAGE + 1 - index
    }));
    const loaded: number[] = [];
    const progress = vi.fn();
    const blob = await createPhysicalPassesPdf({
      eventName: 'Boda de Ana y Luis',
      passes,
      loadSvg: async (pass) => {
        loaded.push(pass.passNumber);
        return '<svg/>';
      },
      rasterizeSvg: async () => onePixelPng,
      onProgress: progress
    });
    const document = await PDFDocument.load(await blob.arrayBuffer());

    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
    expect(loaded).toEqual(Array.from({ length: passes.length }, (_, index) => index + 1));
    expect(progress).toHaveBeenLastCalledWith(passes.length, passes.length);
    expect(blob.type).toBe('application/pdf');
  });

  it('creates a safe filename from the event name', () => {
    expect(physicalPassesPdfFilename('XV Años de Sofía')).toBe('plantilla-pases-xv-anos-de-sofia.pdf');
    expect(physicalPassesPdfFilename(null)).toBe('plantilla-pases-evento.pdf');
  });

  it('rasterizes SVG through Image instead of the unsupported createImageBitmap path', async () => {
    const drawImage = vi.fn();
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage
    } as unknown as CanvasRenderingContext2D;
    const png = new Blob([onePixelPng], { type: 'image/png' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) => callback(png))
    } as unknown as HTMLCanvasElement;
    class ImageMock {
      decoding = 'auto';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    const createImageBitmapMock = vi.fn(() => Promise.reject(new DOMException('unsupported', 'InvalidStateError')));
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:physical-pass');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal('Image', ImageMock);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    try {
      const result = await rasterizePhysicalPassSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360"></svg>'
      );

      expect(result).toEqual(onePixelPng);
      expect(createImageBitmapMock).not.toHaveBeenCalled();
      expect(drawImage).toHaveBeenCalledWith(expect.any(ImageMock), 0, 0, 800, 360);
      expect(createObjectUrl).toHaveBeenCalledOnce();
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:physical-pass');
    } finally {
      createElement.mockRestore();
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
