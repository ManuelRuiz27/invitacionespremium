export const PHYSICAL_PASSES_PER_PDF_PAGE = 30;

const A4_LANDSCAPE_WIDTH_POINTS = 841.89;
const A4_LANDSCAPE_HEIGHT_POINTS = 595.28;
const GRID_COLUMNS = 5;
const GRID_ROWS = 6;
const PAGE_MARGIN_POINTS = 18;
const CELL_GAP_POINTS = 4;
const CELL_PADDING_POINTS = 2;
const SVG_WIDTH = 800;
const SVG_HEIGHT = 360;
const RASTERIZE_CONCURRENCY = 4;

type PrintablePass = { id: string; passNumber: number };

export class PhysicalPassesPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhysicalPassesPdfError';
  }
}

interface PhysicalPassesPdfOptions {
  eventName: string | null;
  passes: PrintablePass[];
  loadSvg: (pass: PrintablePass) => Promise<string>;
  onProgress?: (completed: number, total: number) => void;
  rasterizeSvg?: (svg: string) => Promise<Uint8Array>;
}

export async function createPhysicalPassesPdf({
  eventName,
  passes,
  loadSvg,
  onProgress,
  rasterizeSvg = rasterizePhysicalPassSvg
}: PhysicalPassesPdfOptions): Promise<Blob> {
  if (passes.length === 0) throw new PhysicalPassesPdfError('No hay pases para exportar.');

  const { PDFDocument, rgb } = await import('pdf-lib');
  const document = await PDFDocument.create();
  document.setTitle(`Plantilla de pases - ${eventName ?? 'Evento'}`);
  document.setAuthor('Invitaciones Premium');
  document.setCreator('Invitaciones Premium');
  document.setProducer('Invitaciones Premium');

  const orderedPasses = [...passes].sort((left, right) => left.passNumber - right.passNumber);
  let completed = 0;
  for (let offset = 0; offset < orderedPasses.length; offset += PHYSICAL_PASSES_PER_PDF_PAGE) {
    const pagePasses = orderedPasses.slice(offset, offset + PHYSICAL_PASSES_PER_PDF_PAGE);
    const pngs = await mapWithConcurrency(pagePasses, RASTERIZE_CONCURRENCY, async (pass) => {
      const png = await rasterizeSvg(await loadSvg(pass));
      completed += 1;
      onProgress?.(completed, orderedPasses.length);
      return png;
    });
    const page = document.addPage([A4_LANDSCAPE_WIDTH_POINTS, A4_LANDSCAPE_HEIGHT_POINTS]);
    const cellWidth =
      (A4_LANDSCAPE_WIDTH_POINTS - PAGE_MARGIN_POINTS * 2 - CELL_GAP_POINTS * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const cellHeight =
      (A4_LANDSCAPE_HEIGHT_POINTS - PAGE_MARGIN_POINTS * 2 - CELL_GAP_POINTS * (GRID_ROWS - 1)) / GRID_ROWS;

    for (let index = 0; index < pagePasses.length; index += 1) {
      const column = index % GRID_COLUMNS;
      const row = Math.floor(index / GRID_COLUMNS);
      const x = PAGE_MARGIN_POINTS + column * (cellWidth + CELL_GAP_POINTS);
      const y = A4_LANDSCAPE_HEIGHT_POINTS - PAGE_MARGIN_POINTS - (row + 1) * cellHeight - row * CELL_GAP_POINTS;
      const image = await document.embedPng(pngs[index]!);
      const availableWidth = cellWidth - CELL_PADDING_POINTS * 2;
      const availableHeight = cellHeight - CELL_PADDING_POINTS * 2;
      const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;

      page.drawRectangle({
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        borderColor: rgb(0.72, 0.74, 0.78),
        borderWidth: 0.4
      });
      page.drawImage(image, {
        x: x + (cellWidth - width) / 2,
        y: y + (cellHeight - height) / 2,
        width,
        height
      });
    }
  }

  const bytes = Uint8Array.from(await document.save());
  return new Blob([bytes.buffer], { type: 'application/pdf' });
}

export function physicalPassesPdfFilename(eventName: string | null): string {
  const suffix = (eventName ?? 'evento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 60);
  return `plantilla-pases-${suffix || 'evento'}.pdf`;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index]!);
      }
    })
  );
  return results;
}

export async function rasterizePhysicalPassSvg(svg: string): Promise<Uint8Array> {
  const source = new Blob([svg], { type: 'image/svg+xml' });
  const canvas = document.createElement('canvas');
  canvas.width = SVG_WIDTH;
  canvas.height = SVG_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new PhysicalPassesPdfError('El navegador no permite preparar el PDF.');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, SVG_WIDTH, SVG_HEIGHT);

  await drawSvgWithImage(context, source);

  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new PhysicalPassesPdfError('No fue posible convertir un pase para el PDF.')),
      'image/png'
    )
  );
  return new Uint8Array(await png.arrayBuffer());
}

async function drawSvgWithImage(context: CanvasRenderingContext2D, source: Blob): Promise<void> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new PhysicalPassesPdfError('No fue posible leer un pase para el PDF.'));
      image.src = url;
    });
    context.drawImage(image, 0, 0, SVG_WIDTH, SVG_HEIGHT);
  } finally {
    URL.revokeObjectURL(url);
  }
}
