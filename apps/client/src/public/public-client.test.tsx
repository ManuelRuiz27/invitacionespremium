import { ApiError, type ApiClient, type PublicAlbum, type PublicInvitationView } from '@invitaciones/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const token = 'invitation-test-token';
const assetId = '2e07a475-7865-4782-9916-04dba57fb2ef';
const pageId = 'e380df09-b0d4-43c4-abab-9cac22e41f90';
const primaryId = 'fa94fd76-65f6-4216-a73f-913a94c12412';
const additionalId = '3fccca47-5b26-4e4d-98d3-b0e04e3b2c12';

function availableView(overrides: Partial<PublicInvitationView> = {}): PublicInvitationView {
  return {
    status: 'AVAILABLE',
    event: { name: 'Boda de Ana y Luis', eventDateTime: '2026-08-01T22:00:00.000Z', timeZone: 'America/Mexico_City' },
    invitation: {
      id: 'invitation',
      mode: 'FAMILY_NOMINAL',
      responseStatus: 'PENDING',
      additionalAssistantLimit: 2,
      cancelled: false
    },
    confirmation: { open: true },
    assistants: [{ id: primaryId, name: 'Invitado principal', isPrimary: true, responseStatus: 'PENDING' }],
    designType: 'FLYER',
    design: {
      type: 'FLYER',
      flyerInitialAsset: { id: assetId, contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content` },
      flyerQrAsset: { id: assetId, contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content` },
      pages: [],
      hotspots: [
        {
          id: 'hotspot',
          action: 'RSVP',
          destination: null,
          flipbookPageId: null,
          visualOwnerType: 'FLYER',
          x: 0.1,
          y: 0.7,
          width: 0.5,
          height: 0.1,
          priority: 0
        }
      ]
    },
    qr: { available: false },
    ...overrides
  };
}

const album: PublicAlbum = {
  status: 'AVAILABLE',
  event: { name: 'Boda de Ana y Luis' },
  album: {
    title: 'Nuestro gran día',
    thankYouMessage: 'Gracias por acompañarnos',
    publishedAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    theme: { backgroundColor: '#101820', textColor: '#FFFFFF', accentColor: '#C5A46D' },
    externalButton: { label: 'Ver video', url: 'https://example.com/video' },
    photos: [{ id: assetId, position: 1, contentPath: `/api/v1/public/albums/album-token/photos/${assetId}/content` }]
  }
};

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:public-content') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  class VisibleIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(element: Element) {
      this.callback(
        [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '0px';
    thresholds = [0];
  }
  Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: VisibleIntersectionObserver });
});

function publicApi(view = availableView()): ApiClient {
  const api = mockApiClient();
  vi.mocked(api.publicInvitation.resolve).mockResolvedValue(view);
  vi.mocked(api.publicInvitation.asset).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.mocked(api.publicInvitation.qr).mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  vi.mocked(api.publicAlbum.resolve).mockResolvedValue(album);
  vi.mocked(api.publicAlbum.photo).mockResolvedValue(new Blob(['photo'], { type: 'image/jpeg' }));
  return api;
}

describe('public routing', () => {
  it.each([
    ['/invitacion/invitation-test-token', 'Boda de Ana y Luis'],
    ['/album/album-token', 'Nuestro gran día']
  ])('keeps %s outside session, ClientShell and private data requests', async (route, heading) => {
    const api = publicApi();
    renderApp(api, route);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(api.auth.me).not.toHaveBeenCalled();
    expect(api.events.list).not.toHaveBeenCalled();
    expect(api.finance.balance).not.toHaveBeenCalled();
    expect(screen.queryByText('Eventos')).not.toBeInTheDocument();
  });

  it('uses a neutral public 404 without redirecting or restoring a session', async () => {
    const api = publicApi();
    const { router } = renderApp(api, '/ruta-desconocida');
    expect(await screen.findByRole('heading', { name: 'Esta página no está disponible.' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/ruta-desconocida');
    expect(api.auth.me).not.toHaveBeenCalled();
  });

  it('aborts the previous public request when the token changes', async () => {
    const api = publicApi();
    const signals: AbortSignal[] = [];
    vi.mocked(api.publicInvitation.resolve).mockImplementation((_value, signal) => {
      if (signal) signals.push(signal);
      return new Promise(() => undefined);
    });
    const { router } = renderApp(api, '/invitacion/first');
    await waitFor(() => expect(signals).toHaveLength(1));
    await router.navigate('/invitacion/second');
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);
  });
});

describe('public invitation', () => {
  it('shows loading, retries a non-enumerating unavailable state and never prints the token', async () => {
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve)
      .mockRejectedValueOnce(new Error(`network ${token}`))
      .mockResolvedValue(availableView());
    renderApp(api, `/invitacion/${token}`);
    expect(screen.getByLabelText('Cargando invitación')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Esta invitación no está disponible.' })).toBeVisible();
    expect(document.body.textContent).not.toContain(token);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Boda de Ana y Luis' })).toBeVisible();
  });

  it.each(['Esta invitación fue cancelada por el organizador.', 'Este evento ha sido cancelado por el organizador.'])(
    'renders the authorized cancellation projection only: %s',
    async (message) => {
      const api = publicApi({ status: 'CANCELLED', message });
      renderApp(api, `/invitacion/${token}`);
      expect(await screen.findByRole('heading', { name: message })).toBeVisible();
      if (message.startsWith('Este evento')) expect(screen.queryByText('Invitación cancelada')).not.toBeInTheDocument();
      expect(screen.queryByText('Confirmar asistencia')).not.toBeInTheDocument();
      expect(api.publicInvitation.asset).not.toHaveBeenCalled();
    }
  );

  it('renders CLOSED and closed RSVP without exposing active controls', async () => {
    const api = publicApi({ status: 'CLOSED' });
    renderApp(api, `/invitacion/${token}`);
    expect(await screen.findByRole('heading', { name: 'Este evento ha finalizado.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirmar asistencia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mi QR' })).not.toBeInTheDocument();
  });

  it('explains a closed confirmation window and enforces the assistant limit in the form', async () => {
    const closed = availableView({ confirmation: { open: false } });
    const closedApi = publicApi(closed);
    const first = renderApp(closedApi, `/invitacion/${token}`);
    expect(
      await screen.findByText('La confirmación de asistencia ya fue cerrada. Contacta al organizador.')
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('La confirmación de asistencia ya fue cerrada. Contacta al organizador.')).toHaveLength(
      2
    );
    first.unmount();

    const api = publicApi();
    renderApp(api, `/invitacion/${token}`);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Confirmar asistencia' })).at(-1)!);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar acompañante' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar acompañante' }));
    expect(within(dialog).getByText('Máximo de acompañantes alcanzado.')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Agregar acompañante' })).not.toBeInTheDocument();
  });

  it.each([
    ['RSVP_ASSISTANT_LIMIT_EXCEEDED', 'Alcanzaste el máximo de acompañantes permitidos.'],
    ['RSVP_EVENT_CAPACITY_EXCEEDED', 'Ya no hay lugares suficientes disponibles para completar esta confirmación.'],
    ['RSVP_ASSISTANT_NOT_FOUND', 'No pudimos actualizar a uno de los acompañantes.'],
    ['RSVP_ASSISTANT_MISMATCH', 'No pudimos verificar a uno de los acompañantes.']
  ])('maps %s without leaking the API payload', async (code, message) => {
    const api = publicApi();
    vi.mocked(api.publicInvitation.confirm).mockRejectedValue(new ApiError(409, code, 'secret backend detail'));
    renderApp(api, `/invitacion/${token}`);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Confirmar asistencia' })).at(-1)!);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar asistencia' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText('secret backend detail')).not.toBeInTheDocument();
  });

  it('confirms a nominal family, refreshes authority and exposes QR only afterward', async () => {
    const pending = availableView();
    const confirmed = availableView({
      invitation: { ...pending.invitation!, responseStatus: 'CONFIRMED' },
      assistants: [
        { ...pending.assistants![0]!, responseStatus: 'CONFIRMED' },
        { id: additionalId, name: 'Acompañante Uno', isPrimary: false, responseStatus: 'CONFIRMED' }
      ],
      qr: { available: true, contentPath: `/api/v1/public/invitations/${token}/qr.svg` }
    });
    const api = publicApi(pending);
    vi.mocked(api.publicInvitation.resolve).mockResolvedValueOnce(pending).mockResolvedValue(confirmed);
    vi.mocked(api.publicInvitation.confirm).mockResolvedValue({
      invitationId: 'invitation',
      responseStatus: 'CONFIRMED',
      assistants: confirmed.assistants!
    });
    renderApp(api, `/invitacion/${token}`);

    expect(await screen.findByText('Aún no has confirmado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver mi QR' })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Confirmar asistencia' }).at(-1)!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('Invitado principal')).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar acompañante' }));
    await userEvent.type(within(dialog).getByLabelText(/^Acompañante 1/), 'Acompañante Uno');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar asistencia' }));

    await waitFor(() =>
      expect(api.publicInvitation.confirm).toHaveBeenCalledWith(
        token,
        [{ name: 'Acompañante Uno' }],
        expect.any(AbortSignal)
      )
    );
    expect(await screen.findByRole('button', { name: 'Ver mi QR' })).toBeVisible();
    expect(api.publicInvitation.qr).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Ver mi QR' }));
    await waitFor(() => expect(api.publicInvitation.qr).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Pantalla completa' }));
    expect(screen.getByRole('button', { name: 'Salir de pantalla completa' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('preserves assistant identity while editing and removing nominal companions', async () => {
    const confirmed = availableView({
      invitation: { ...availableView().invitation!, responseStatus: 'CONFIRMED' },
      assistants: [
        { id: primaryId, name: 'Principal', isPrimary: true, responseStatus: 'CONFIRMED' },
        { id: additionalId, name: 'Anterior', isPrimary: false, responseStatus: 'CONFIRMED' }
      ],
      qr: { available: true }
    });
    const updated = { ...confirmed, assistants: [confirmed.assistants![0]!] };
    const api = publicApi(confirmed);
    vi.mocked(api.publicInvitation.resolve).mockResolvedValueOnce(confirmed).mockResolvedValue(updated);
    vi.mocked(api.publicInvitation.updateAssistants).mockResolvedValue({
      invitationId: 'invitation',
      responseStatus: 'CONFIRMED',
      assistants: updated.assistants!
    });
    renderApp(api, `/invitacion/${token}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Modificar acompañantes' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText(/^Acompañante 1/));
    await userEvent.type(within(dialog).getByLabelText(/^Acompañante 1/), 'Editado');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.publicInvitation.updateAssistants).toHaveBeenCalledWith(
        token,
        [{ id: additionalId, name: 'Editado' }],
        expect.any(AbortSignal)
      )
    );
  });

  it('removes a nominal companion by omitting its preserved UUID', async () => {
    const confirmed = availableView({
      invitation: { ...availableView().invitation!, responseStatus: 'CONFIRMED' },
      assistants: [
        { id: primaryId, name: 'Principal', isPrimary: true, responseStatus: 'CONFIRMED' },
        { id: additionalId, name: 'Retirar', isPrimary: false, responseStatus: 'CONFIRMED' }
      ],
      qr: { available: true }
    });
    const api = publicApi(confirmed);
    vi.mocked(api.publicInvitation.updateAssistants).mockResolvedValue({
      invitationId: 'invitation',
      responseStatus: 'CONFIRMED',
      assistants: [confirmed.assistants![0]!]
    });
    renderApp(api, `/invitacion/${token}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Modificar acompañantes' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.publicInvitation.updateAssistants).toHaveBeenCalledWith(token, [], expect.any(AbortSignal))
    );
  });

  it('reconciles an uncertain confirmation against authoritative nominal state without duplicating', async () => {
    const pending = availableView();
    const confirmed = availableView({
      invitation: { ...pending.invitation!, responseStatus: 'CONFIRMED' },
      assistants: [
        { ...pending.assistants![0]!, responseStatus: 'CONFIRMED' },
        { id: additionalId, name: 'Resultado autoritativo', isPrimary: false, responseStatus: 'CONFIRMED' }
      ],
      qr: { available: true }
    });
    const api = publicApi(pending);
    vi.mocked(api.publicInvitation.resolve).mockResolvedValueOnce(pending).mockResolvedValue(confirmed);
    vi.mocked(api.publicInvitation.confirm).mockRejectedValue(new TypeError('network unavailable'));
    renderApp(api, `/invitacion/${token}`);

    await userEvent.click((await screen.findAllByRole('button', { name: 'Confirmar asistencia' })).at(-1)!);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar acompañante' }));
    await userEvent.type(within(dialog).getByLabelText(/^Acompañante 1/), 'Resultado autoritativo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByText('Tu confirmación quedó guardada.')).toBeVisible();
    expect(api.publicInvitation.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('requires explicit rejection and keeps QR absent', async () => {
    const rejected = availableView({ invitation: { ...availableView().invitation!, responseStatus: 'REJECTED' } });
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve).mockResolvedValueOnce(availableView()).mockResolvedValue(rejected);
    vi.mocked(api.publicInvitation.reject).mockResolvedValue({
      invitationId: 'invitation',
      responseStatus: 'REJECTED',
      assistants: []
    });
    renderApp(api, `/invitacion/${token}`);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Confirmar asistencia' })).at(-1)!);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'No asistiré' }));
    expect(api.publicInvitation.reject).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, rechazar' }));
    expect(await screen.findByText('No asistirás')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver mi QR' })).not.toBeInTheDocument();
  });

  it('renders ordered Flipbook pages, keyboard navigation and secure HTTPS hotspots', async () => {
    const view = availableView({
      designType: 'FLIPBOOK',
      design: {
        type: 'FLIPBOOK',
        pages: [
          {
            id: 'page-2',
            position: 2,
            asset: { id: assetId, contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content` }
          },
          {
            id: pageId,
            position: 1,
            asset: { id: assetId, contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content` }
          }
        ],
        hotspots: [
          {
            id: 'location',
            action: 'LOCATION',
            destination: 'https://maps.example.com/place',
            flipbookPageId: pageId,
            visualOwnerType: 'FLIPBOOK_PAGE',
            x: 0,
            y: 0,
            width: 0.2,
            height: 0.2,
            priority: 1
          }
        ]
      }
    });
    renderApp(publicApi(view), `/invitacion/${token}`);
    expect(await screen.findByText('Página 1 de 2')).toBeVisible();
    const link = screen.getByRole('link', { name: 'Ver ubicación' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.keyDown(screen.getByLabelText('Invitación en páginas'), { key: 'ArrowRight' });
    expect(screen.getByText('Página 2 de 2')).toBeVisible();
  });

  it.each([
    [{ state: 'RESTRICTED' as const, message: 'Álbum disponible solo para asistentes' }, false],
    [{ state: 'AVAILABLE' as const, contentPath: '/api/v1/public/albums/album-token' }, true],
    [{ state: 'AVAILABLE' as const, contentPath: 'https://evil.test/album-token' }, false]
  ])('handles closed album projections without arbitrary navigation', async (projection, hasLink) => {
    const api = publicApi({ status: 'CLOSED', album: projection });
    renderApp(api, `/invitacion/${token}`);
    expect(await screen.findByRole('heading', { name: 'Este evento ha finalizado.' })).toBeVisible();
    expect(Boolean(screen.queryByRole('link', { name: 'Ver álbum del evento' }))).toBe(hasLink);
  });
});

describe('public album', () => {
  it('applies theme content, loads photos progressively and opens an accessible preview', async () => {
    const api = publicApi();
    const app = renderApp(api, '/album/album-token');
    expect(await screen.findByRole('heading', { name: 'Nuestro gran día' })).toBeVisible();
    expect(screen.getByText('Gracias por acompañarnos')).toBeVisible();
    const external = screen.getByRole('link', { name: 'Ver video' });
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    expect(external).toHaveAttribute('referrerpolicy', 'no-referrer');
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText('Foto 1 de 1')).toBeVisible();
    expect(api.publicAlbum.photo).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    app.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('uses the same unavailable state for every album lookup failure and retries only that lookup', async () => {
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockRejectedValueOnce(new Error('expired')).mockResolvedValue(album);
    renderApp(api, '/album/album-token');
    expect(await screen.findByRole('heading', { name: 'Este álbum no está disponible.' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Nuestro gran día' })).toBeVisible();
    expect(api.auth.me).not.toHaveBeenCalled();
  });
});
