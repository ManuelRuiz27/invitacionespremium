import type { Hotspot } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../../test/fixtures';
import { HotspotEditor } from './HotspotEditor';

const existingAction: Hotspot = {
  id: 'action-1',
  eventId: configuredEvent.id,
  visualOwnerType: 'FLYER',
  flipbookPageId: null,
  action: 'RSVP',
  url: null,
  x: 0.1,
  y: 0.2,
  width: 0.25,
  height: 0.12,
  priority: 7,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

function renderEditor({
  hotspots = [],
  disabled = false,
  ownerType = 'FLYER',
  pageId
}: {
  hotspots?: Hotspot[];
  disabled?: boolean;
  ownerType?: 'FLYER' | 'FLIPBOOK_PAGE';
  pageId?: string;
} = {}) {
  const api = mockApiClient();
  vi.mocked(api.design.createHotspot).mockResolvedValue(existingAction);
  vi.mocked(api.design.updateHotspot).mockResolvedValue(existingAction);
  vi.mocked(api.design.removeHotspot).mockResolvedValue(undefined);
  const onChanged = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <AppThemeProvider>
      <HotspotEditor
        apiClient={api}
        eventId={configuredEvent.id}
        ownerType={ownerType}
        pageId={pageId}
        hotspots={hotspots}
        disabled={disabled}
        previewUrl="blob:preview"
        contextLabel={ownerType === 'FLYER' ? 'Acciones del Flyer' : 'Acciones de Página 2'}
        onChanged={onChanged}
      />
    </AppThemeProvider>
  );
  return { api, onChanged, view };
}

async function beginAction(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

function setCanvasBounds() {
  const canvas = screen.getByLabelText('Vista previa interactiva de la invitación');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 500,
    width: 1000,
    height: 500,
    toJSON: () => ({})
  });
}

describe('HotspotEditor as invitation actions', () => {
  it('uses natural copy, hides technical fields and offers the five contracted actions', async () => {
    renderEditor({ hotspots: [existingAction] });

    expect(screen.getByRole('heading', { name: 'Acciones de la invitación' })).toBeInTheDocument();
    expect(screen.queryByText(/Hotspot/i)).not.toBeInTheDocument();
    for (const field of ['x', 'y', 'width', 'height', 'priority', 'Prioridad']) {
      expect(screen.queryByLabelText(field)).not.toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));
    for (const name of ['Confirmar asistencia', 'Ver ubicación', 'Mesa de regalos', 'Mostrar QR', 'Enlace adicional']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });

  it('creates the same technical payload through natural keyboard controls', async () => {
    const { api, onChanged } = renderEditor();
    await beginAction('Ver ubicación');
    await userEvent.click(screen.getByRole('button', { name: 'Mover a la derecha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hacer más ancho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));

    expect(api.design.createHotspot).toHaveBeenCalledWith(configuredEvent.id, {
      x: 0.11,
      y: 0.1,
      width: 0.26,
      height: 0.12,
      action: 'LOCATION',
      priority: 0,
      visualOwnerType: 'FLYER'
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Agregar acción' })).toBeInTheDocument();
  });

  it('preserves coordinates and priority while editing, then removes through the existing API flow', async () => {
    const { api, onChanged } = renderEditor({ hotspots: [existingAction] });
    await userEvent.click(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover arriba' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(api.design.updateHotspot).toHaveBeenCalledWith(configuredEvent.id, existingAction.id, {
      x: 0.1,
      y: 0.19,
      width: 0.25,
      height: 0.12,
      action: 'RSVP',
      priority: 7
    });

    await userEvent.click(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar acción' }));
    expect(api.design.removeHotspot).toHaveBeenCalledWith(configuredEvent.id, existingAction.id);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('allows selecting and adjusting an existing area with keyboard-only controls', async () => {
    const { api } = renderEditor({ hotspots: [existingAction] });
    const area = screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' });
    area.focus();
    await userEvent.keyboard('{Enter}');
    const moveRight = screen.getByRole('button', { name: 'Mover a la derecha' });
    moveRight.focus();
    await userEvent.keyboard('{Enter}');
    const makeTaller = screen.getByRole('button', { name: 'Hacer más alto' });
    makeTaller.focus();
    await userEvent.keyboard('{Enter}');
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    save.focus();
    await userEvent.keyboard('{Enter}');

    expect(api.design.updateHotspot).toHaveBeenCalledWith(
      configuredEvent.id,
      existingAction.id,
      expect.objectContaining({ x: 0.11, y: 0.2, width: 0.25, height: 0.13, priority: 7 })
    );
  });

  it('moves and resizes with pointer coordinates relative to the full preview', async () => {
    const { api } = renderEditor();
    await beginAction('Confirmar asistencia');
    setCanvasBounds();

    const mover = screen.getByRole('group', { name: 'Mover acción Confirmar asistencia' });
    fireEvent.pointerDown(mover, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(mover, { pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerUp(mover, { pointerId: 1 });

    const resize = screen.getByRole('button', { name: 'Cambiar tamaño de Confirmar asistencia' });
    fireEvent.pointerDown(resize, { pointerId: 2, clientX: 350, clientY: 160 });
    fireEvent.pointerMove(resize, { pointerId: 2, clientX: 450, clientY: 210 });
    fireEvent.pointerUp(resize, { pointerId: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));

    expect(api.design.createHotspot).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ x: 0.2, y: 0.2, width: 0.35, height: 0.22, action: 'RSVP', priority: 0 })
    );
  });

  it('supports touch pointer movement without changing the persistence flow', async () => {
    const { api } = renderEditor();
    await beginAction('Mostrar QR');
    setCanvasBounds();
    const mover = screen.getByRole('group', { name: 'Mover acción Mostrar QR' });

    fireEvent.pointerDown(mover, { pointerId: 4, pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(mover, { pointerId: 4, pointerType: 'touch', clientX: 150, clientY: 125 });
    fireEvent.pointerUp(mover, { pointerId: 4, pointerType: 'touch' });
    expect(screen.getByRole('button', { name: 'Cambiar tamaño de Mostrar QR' })).toHaveStyle({
      width: '44px',
      height: '44px'
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));

    const payload = vi.mocked(api.design.createHotspot).mock.calls[0]?.[1];
    expect(payload?.x).toBeCloseTo(0.15);
    expect(payload?.y).toBeCloseTo(0.15);
    expect(payload?.action).toBe('QR_AREA');
    expect(mover).toHaveStyle({ touchAction: 'none' });
  });

  it('keeps external-link validation internal and explains the correction naturally', async () => {
    const { api } = renderEditor();
    await beginAction('Enlace adicional');
    const input = screen.getByLabelText('Enlace');
    expect(screen.getByText('Pega el enlace que quieres abrir desde la invitación.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'http://example.com' } });
    fireEvent.blur(input);
    expect(screen.getByText('Ingresa un enlace web válido.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar acción' })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'https://example.com' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));
    expect(api.design.createHotspot).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ action: 'EXTERNAL_LINK', url: 'https://example.com' })
    );
  });

  it('keeps page ownership internal and resets the editor when changing Flipbook pages', async () => {
    const pageOneAction = { ...existingAction, visualOwnerType: 'FLIPBOOK_PAGE' as const, flipbookPageId: 'page-1' };
    const { api, view } = renderEditor({
      hotspots: [pageOneAction],
      ownerType: 'FLIPBOOK_PAGE',
      pageId: 'page-1'
    });
    await userEvent.click(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' }));

    view.rerender(
      <AppThemeProvider>
        <HotspotEditor
          apiClient={api}
          eventId={configuredEvent.id}
          ownerType="FLIPBOOK_PAGE"
          pageId="page-2"
          hotspots={[pageOneAction]}
          disabled={false}
          contextLabel="Acciones de Página 2"
          onChanged={vi.fn().mockResolvedValue(undefined)}
        />
      </AppThemeProvider>
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument());
    await beginAction('Mostrar QR');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));
    expect(api.design.createHotspot).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ visualOwnerType: 'FLIPBOOK_PAGE', flipbookPageId: 'page-2', action: 'QR_AREA' })
    );
  });

  it('cancels a new action without persisting a technical draft', async () => {
    const { api } = renderEditor();
    await beginAction('Mesa de regalos');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.design.createHotspot).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Agregar acción' })).toBeInTheDocument();
  });

  it('respects read-only mode while retaining the configured-action summary', () => {
    renderEditor({ hotspots: [existingAction], disabled: true });
    expect(screen.getAllByText('Confirmar asistencia')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Agregar acción' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' })).toBeDisabled();
  });
});
