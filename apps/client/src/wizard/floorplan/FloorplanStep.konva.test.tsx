import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../../test/fixtures';
import { FloorplanStep } from './FloorplanStep';

const production = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock('../design/usePrivateAssetUrl', () => ({ usePrivateAssetUrl: () => 'blob:plan' }));
vi.mock('./FloorplanKonvaRenderer', () => ({
  FloorplanKonvaRenderer: (props: Record<string, unknown>) => {
    production.props = props;
    return <div data-testid="step-production-konva">Renderer Konva</div>;
  }
}));

const table: FloorplanShape = {
  id: 'table-1',
  name: 'Mesa Uno',
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 8,
  occupancy: 0,
  availableCapacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  rotation: 0,
  polygonPoints: null
};
const floorplan: Floorplan = {
  id: 'fp',
  eventId: configuredEvent.id,
  image: { fileAssetId: 'asset', contentPath: '/asset' },
  locked: false,
  lockedAt: null,
  shapes: [table],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

describe('FloorplanStep con renderer de producción', () => {
  beforeEach(() => {
    class ImageStub {
      naturalWidth = 1000;
      naturalHeight = 500;
      onload: null | (() => void) = null;
      private value = '';
      set src(next: string) {
        this.value = next;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this.value;
      }
    }
    class ResizeObserverStub {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 800, height: 400 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('Image', ImageStub);
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('selecciona y manipula en Konva sin requests por frame; persiste una vez al guardar', async () => {
    const api = mockApiClient();
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.floorplan.updateShape).mockResolvedValue(table);
    render(
      <FloorplanStep
        apiClient={api}
        event={{ ...configuredEvent, floorplanEnabled: true }}
        draft={{ confirmationEnabled: false, floorplanEnabled: true }}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    expect(await screen.findByTestId('step-production-konva')).toBeInTheDocument();
    act(() => (production.props?.onSelect as (shape: FloorplanShape) => void)(table));
    await screen.findByRole('heading', { name: 'Editar mesa' });
    const baseDraft = production.props?.draft as FloorplanShape;
    act(() => {
      (production.props?.onDraftChange as (shape: FloorplanShape) => void)({ ...baseDraft, x: 0.2 });
      (production.props?.onDraftChange as (shape: FloorplanShape) => void)({ ...baseDraft, x: 0.3 });
      (production.props?.onDraftChange as (shape: FloorplanShape) => void)({ ...baseDraft, x: 0.4, rotation: 15 });
    });
    expect(api.floorplan.updateShape).not.toHaveBeenCalled();
    expect(api.floorplan.addShape).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.floorplan.updateShape).toHaveBeenCalledOnce());
  });
});
