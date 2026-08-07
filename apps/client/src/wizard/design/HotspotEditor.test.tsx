import { ApiError, type Hotspot } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../../test/fixtures';
import { isValidInvitationExternalUrl } from '../../shared/invitation-external-url';
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

const pageAction = (pageId: string, action: Hotspot['action'], id = `${pageId}-${action}`): Hotspot => ({
  ...existingAction,
  id,
  visualOwnerType: 'FLIPBOOK_PAGE',
  flipbookPageId: pageId,
  action
});

const externalAction = (id: string, pageId?: string): Hotspot => ({
  ...existingAction,
  id,
  action: 'EXTERNAL_LINK',
  url: `https://example.com/${id}`,
  ...(pageId ? { visualOwnerType: 'FLIPBOOK_PAGE' as const, flipbookPageId: pageId } : {})
});

function renderEditor({
  hotspots = [],
  disabled = false,
  ownerType = 'FLYER',
  pageId,
  pagePosition
}: {
  hotspots?: Hotspot[];
  disabled?: boolean;
  ownerType?: 'FLYER' | 'FLIPBOOK_PAGE';
  pageId?: string;
  pagePosition?: number;
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
        pagePosition={pagePosition}
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

function setCanvasBounds(width = 1000, height = 500) {
  const canvas = screen.getByLabelText('Vista previa interactiva de la invitación');
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
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

  it.each([
    ['vertical 4:5', 400, 500],
    ['horizontal 16:9', 1600, 900],
    ['square 1:1', 600, 600]
  ])('keeps the image bounds as the only coordinate space for a %s asset', async (_name, width, height) => {
    const { api } = renderEditor();
    await beginAction('Confirmar asistencia');
    setCanvasBounds(width, height);
    const mover = screen.getByRole('group', { name: 'Mover acción Confirmar asistencia' });

    fireEvent.pointerDown(mover, { pointerId: 7, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(mover, { pointerId: 7, clientX: width * 0.4, clientY: height * 0.4 });
    fireEvent.pointerUp(mover, { pointerId: 7 });

    expect(mover).toHaveStyle({ left: '50%', top: '50%' });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));
    expect(api.design.createHotspot).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ x: 0.5, y: 0.5 })
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

  it.each([0, 1, 2])('offers an additional link while the design has %s configured links', async (count) => {
    renderEditor({ hotspots: Array.from({ length: count }, (_, index) => externalAction(`link-${index}`)) });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    expect(screen.getByRole('button', { name: /^Enlace adicional/ })).toBeInTheDocument();
  });

  it('does not offer a fourth additional link but keeps other Flyer actions available', async () => {
    renderEditor({ hotspots: [externalAction('link-1'), externalAction('link-2'), externalAction('link-3')] });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    expect(screen.queryByRole('button', { name: /^Enlace adicional/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Confirmar asistencia/ })).toBeInTheDocument();
  });

  it('keeps an existing additional link editable when the global limit is reached', async () => {
    renderEditor({ hotspots: [externalAction('link-1'), externalAction('link-2'), externalAction('link-3')] });
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar acción Enlace adicional' })[0]!);

    expect(screen.getByLabelText('Enlace')).toHaveValue('https://example.com/link-1');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar acción' })).toBeEnabled();
  });

  it('offers an additional link again after deletion and an authoritative refresh', async () => {
    const links = [externalAction('link-1'), externalAction('link-2'), externalAction('link-3')];
    const { api, onChanged, view } = renderEditor({ hotspots: links });
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar acción Enlace adicional' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar acción' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    view.rerender(
      <AppThemeProvider>
        <HotspotEditor
          apiClient={api}
          eventId={configuredEvent.id}
          ownerType="FLYER"
          hotspots={links.slice(1)}
          disabled={false}
          previewUrl="blob:preview"
          contextLabel="Acciones del Flyer"
          onChanged={onChanged}
        />
      </AppThemeProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    expect(screen.getByRole('button', { name: /^Enlace adicional/ })).toBeInTheDocument();
  });

  it('offers all contracted actions on the Flipbook cover', async () => {
    renderEditor({ ownerType: 'FLIPBOOK_PAGE', pageId: 'cover', pagePosition: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    for (const name of ['Confirmar asistencia', 'Ver ubicación', 'Mesa de regalos', 'Mostrar QR', 'Enlace adicional']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
  });

  it('offers only QR on an intermediate page until it becomes the QR page', async () => {
    renderEditor({ ownerType: 'FLIPBOOK_PAGE', pageId: 'page-2', pagePosition: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    expect(screen.getByRole('button', { name: /^Mostrar QR/ })).toBeInTheDocument();
    for (const name of ['Confirmar asistencia', 'Ver ubicación', 'Mesa de regalos', 'Enlace adicional']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${name}`) })).not.toBeInTheDocument();
    }
  });

  it('allows an external link only on the existing QR page', async () => {
    renderEditor({
      ownerType: 'FLIPBOOK_PAGE',
      pageId: 'page-2',
      pagePosition: 2,
      hotspots: [pageAction('page-2', 'QR_AREA')]
    });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    expect(screen.getByRole('button', { name: /^Mostrar QR/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Enlace adicional/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirmar asistencia/ })).not.toBeInTheDocument();
  });

  it('applies the three-link limit globally across the Flipbook cover and QR page', async () => {
    renderEditor({
      ownerType: 'FLIPBOOK_PAGE',
      pageId: 'page-2',
      pagePosition: 2,
      hotspots: [
        pageAction('page-2', 'QR_AREA', 'qr-area'),
        externalAction('cover-link-1', 'cover'),
        externalAction('cover-link-2', 'cover'),
        externalAction('qr-link', 'page-2')
      ]
    });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));

    expect(screen.getByRole('button', { name: /^Mostrar QR/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Enlace adicional/ })).not.toBeInTheDocument();
  });

  it('does not offer a second QR page and updates options immediately after changing pages', async () => {
    const qr = pageAction('page-3', 'QR_AREA');
    const { api, view } = renderEditor({
      ownerType: 'FLIPBOOK_PAGE',
      pageId: 'cover',
      pagePosition: 1,
      hotspots: [qr]
    });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar acción' }));
    expect(screen.queryByRole('button', { name: /^Mostrar QR/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Enlace adicional/ })).toBeInTheDocument();

    view.rerender(
      <AppThemeProvider>
        <HotspotEditor
          apiClient={api}
          eventId={configuredEvent.id}
          ownerType="FLIPBOOK_PAGE"
          pageId="page-2"
          pagePosition={2}
          hotspots={[qr]}
          disabled={false}
          previewUrl="blob:preview"
          contextLabel="Acciones de Página 2"
          onChanged={vi.fn().mockResolvedValue(undefined)}
        />
      </AppThemeProvider>
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Agregar acción' })).not.toBeInTheDocument();
    expect(screen.getByText('Esta página no admite acciones adicionales.')).toBeInTheDocument();
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

  it('preserves a create draft, blocks double submit and allows retry after a failure', async () => {
    const { api, onChanged } = renderEditor();
    let rejectCreate!: (reason: unknown) => void;
    vi.mocked(api.design.createHotspot).mockReturnValueOnce(
      new Promise<Hotspot>((_resolve, reject) => {
        rejectCreate = reject;
      })
    );
    await beginAction('Ver ubicación');
    const save = screen.getByRole('button', { name: 'Guardar acción' });

    fireEvent.click(save);
    fireEvent.click(save);
    expect(api.design.createHotspot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();

    await act(async () => rejectCreate(new Error('network')));
    expect(
      await screen.findByText('No pudimos guardar esta acción. Revisa la información e inténtalo nuevamente.')
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Mover acción Ver ubicación' })).toBeInTheDocument();

    vi.mocked(api.design.createHotspot).mockResolvedValueOnce(existingAction);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar acción' }));
    expect(api.design.createHotspot).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('preserves an update draft and translates a known placement error before retry', async () => {
    const { api, onChanged } = renderEditor({ hotspots: [existingAction] });
    vi.mocked(api.design.updateHotspot).mockRejectedValueOnce(
      new ApiError(409, 'FLIPBOOK_HOTSPOT_PLACEMENT_INVALID', 'technical detail', 'operation-id')
    );
    await userEvent.click(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover a la derecha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Mueve la acción a una página permitida.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Mover acción Confirmar asistencia' })).toHaveStyle({ left: '11%' });
    expect(onChanged).not.toHaveBeenCalled();

    vi.mocked(api.design.updateHotspot).mockResolvedValueOnce(existingAction);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(api.design.updateHotspot).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps the selected action and allows retry when delete fails', async () => {
    const { api, onChanged } = renderEditor({ hotspots: [existingAction] });
    vi.mocked(api.design.removeHotspot).mockRejectedValueOnce(new Error('network'));
    await userEvent.click(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar acción' }));

    expect(await screen.findByText('No pudimos eliminar esta acción. Inténtalo nuevamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar acción' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Mover acción Confirmar asistencia' })).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();

    vi.mocked(api.design.removeHotspot).mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar acción' }));
    expect(api.design.removeHotspot).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('respects read-only mode while retaining the configured-action summary', () => {
    renderEditor({ hotspots: [existingAction], disabled: true });
    expect(screen.getAllByText('Confirmar asistencia')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Agregar acción' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' })).toBeDisabled();
  });
});

describe('invitation external link validation', () => {
  it.each([
    'http://example.com',
    'https://',
    'example.com',
    'https://user:password@example.com',
    'https://example.com?utm_source=test',
    'https://example.com/#seccion',
    'https://example.com/path?foo=bar',
    'https://exa mple.com',
    'https://example.com\\path',
    'https://example.com/\npath',
    'https://example.com/\u007fpath'
  ])('rejects %j before calling the API', (value) => {
    expect(isValidInvitationExternalUrl(value)).toBe(false);
  });

  it('keeps save disabled and natural copy visible for every contracted invalid shape', async () => {
    const { api } = renderEditor();
    await beginAction('Enlace adicional');
    const input = screen.getByLabelText('Enlace');
    const save = screen.getByRole('button', { name: 'Guardar acción' });

    for (const value of [
      'http://example.com',
      'https://',
      'example.com',
      'https://user:password@example.com',
      'https://example.com?utm_source=test',
      'https://example.com/#seccion',
      'https://example.com/path?foo=bar'
    ]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(save).toBeDisabled();
      expect(screen.getByText('Ingresa un enlace web válido.')).toBeInTheDocument();
    }
    expect(api.design.createHotspot).not.toHaveBeenCalled();
  });

  it.each(['https://example.com', 'https://example.com/regalos', 'https://subdomain.example.com/ruta'])(
    'accepts %s',
    (value) => {
      expect(isValidInvitationExternalUrl(value)).toBe(true);
    }
  );
});
