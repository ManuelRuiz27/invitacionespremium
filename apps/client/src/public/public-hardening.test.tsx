import type { ApiClient, PublicAlbum, PublicInvitationView } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const assetId = '2e07a475-7865-4782-9916-04dba57fb2ef';
const primaryId = 'fa94fd76-65f6-4216-a73f-913a94c12412';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function invitation(token: string, name = `Invitación ${token}`, confirmed = false): PublicInvitationView {
  return {
    status: 'AVAILABLE',
    event: { name, eventDateTime: '2026-08-01T22:00:00.000Z', timeZone: 'America/Mexico_City' },
    invitation: {
      id: `invitation-${token}`,
      mode: 'FAMILY_NOMINAL',
      responseStatus: confirmed ? 'CONFIRMED' : 'PENDING',
      additionalAssistantLimit: 2,
      cancelled: false
    },
    confirmation: { open: true },
    assistants: [
      { id: primaryId, name: 'Principal', isPrimary: true, responseStatus: confirmed ? 'CONFIRMED' : 'PENDING' }
    ],
    designType: 'FLYER',
    design: {
      type: 'FLYER',
      flyerInitialAsset: {
        id: assetId,
        contentPath: `/api/v1/public/invitations/${token}/assets/${assetId}/content`
      },
      pages: [],
      hotspots: []
    },
    qr: { available: confirmed, ...(confirmed ? { contentPath: `/api/v1/public/invitations/${token}/qr.svg` } : {}) }
  };
}

function publicApi(): ApiClient {
  const api = mockApiClient();
  vi.mocked(api.publicInvitation.asset).mockResolvedValue(new Blob(['image']));
  vi.mocked(api.publicInvitation.qr).mockResolvedValue(new Blob(['svg']));
  vi.mocked(api.publicAlbum.photo).mockResolvedValue(new Blob(['photo']));
  return api;
}

beforeEach(() => {
  let objectUrl = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => `blob:public-${++objectUrl}`)
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
  class VisibleObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
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
  Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: VisibleObserver });
});

describe('token-scoped public reads', () => {
  it('aborts a pending public read when the route unmounts', async () => {
    const api = publicApi();
    let signal: AbortSignal | undefined;
    vi.mocked(api.publicInvitation.resolve).mockImplementation((_token, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => undefined);
    });
    const app = renderApp(api, '/invitacion/A');
    await waitFor(() => expect(signal).toBeDefined());
    app.unmount();
    expect(signal?.aborted).toBe(true);
  });
  it('discards an invitation retry from token A after token B wins and aborts A', async () => {
    const retryA = deferred<PublicInvitationView>();
    const signals: AbortSignal[] = [];
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve).mockImplementation((value, signal) => {
      if (signal) signals.push(signal);
      if (value === 'A' && signals.length === 1) return Promise.reject(new Error('offline'));
      if (value === 'A') return retryA.promise;
      return Promise.resolve(invitation('B'));
    });
    const { router } = renderApp(api, '/invitacion/A');
    await screen.findByRole('heading', { name: 'Esta invitación no está disponible.' });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await router.navigate('/invitacion/B');
    expect(await screen.findByRole('heading', { name: 'Invitación B' })).toBeVisible();
    expect(signals[1]?.aborted).toBe(true);
    retryA.resolve(invitation('A'));
    await waitFor(() => expect(screen.queryByText('Invitación A')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/invitacion/B');
  });

  it('uses latest-wins across repeated invitation retries', async () => {
    const first = deferred<PublicInvitationView>();
    const second = deferred<PublicInvitationView>();
    const signals: AbortSignal[] = [];
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce((_token, signal) => {
        if (signal) signals.push(signal);
        return first.promise;
      })
      .mockImplementationOnce((_token, signal) => {
        if (signal) signals.push(signal);
        return second.promise;
      });
    renderApp(api, '/invitacion/A');
    await screen.findByRole('button', { name: 'Reintentar' });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(signals[0]?.aborted).toBe(true);
    second.resolve(invitation('A', 'Resultado vigente'));
    expect(await screen.findByRole('heading', { name: 'Resultado vigente' })).toBeVisible();
    first.resolve(invitation('A', 'Resultado obsoleto'));
    await waitFor(() => expect(screen.queryByText('Resultado obsoleto')).not.toBeInTheDocument());
  });

  it('applies the same stale-response protection to album retries', async () => {
    const stale = deferred<PublicAlbum>();
    const signals: AbortSignal[] = [];
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockImplementation((value, signal) => {
      if (signal) signals.push(signal);
      if (value === 'A' && signals.length === 1) return Promise.reject(new Error('offline'));
      if (value === 'A') return stale.promise;
      return Promise.resolve(album('B', 'Álbum B', 0));
    });
    const { router } = renderApp(api, '/album/A');
    await screen.findByRole('button', { name: 'Reintentar' });
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await router.navigate('/album/B');
    expect(await screen.findByRole('heading', { name: 'Álbum B' })).toBeVisible();
    expect(signals[1]?.aborted).toBe(true);
    stale.resolve(album('A', 'Álbum A', 0));
    await waitFor(() => expect(screen.queryByText('Álbum A')).not.toBeInTheDocument());
  });
});

describe('token-scoped RSVP mutations', () => {
  it.each(['confirm', 'reject', 'update'] as const)(
    'prevents double %s and aborts it when navigating to another token',
    async (kind) => {
      const pending = deferred<{ invitationId: string; responseStatus: 'CONFIRMED'; assistants: [] }>();
      const api = publicApi();
      const initial = invitation('A', 'Invitación A', kind === 'update');
      vi.mocked(api.publicInvitation.resolve).mockImplementation((value) =>
        Promise.resolve(value === 'B' ? invitation('B') : initial)
      );
      const mutation = api.publicInvitation[kind === 'update' ? 'updateAssistants' : kind];
      vi.mocked(mutation).mockReturnValue(pending.promise as never);
      const { router } = renderApp(api, '/invitacion/A');
      const openName = kind === 'update' ? 'Modificar acompañantes' : 'Confirmar asistencia';
      await userEvent.click((await screen.findAllByRole('button', { name: openName })).at(-1)!);
      const dialog = screen.getByRole('dialog');
      let submit: HTMLElement;
      if (kind === 'reject') {
        await userEvent.click(within(dialog).getByRole('button', { name: 'No asistiré' }));
        submit = within(dialog).getByRole('button', { name: 'Sí, rechazar' });
      } else {
        submit = within(dialog).getByRole('button', {
          name: kind === 'update' ? 'Guardar cambios' : 'Confirmar asistencia'
        });
      }
      fireEvent.click(submit);
      fireEvent.click(submit);
      expect(mutation).toHaveBeenCalledTimes(1);
      const signal = vi.mocked(mutation).mock.calls[0]?.at(-1) as AbortSignal;
      await router.navigate('/invitacion/B');
      expect(await screen.findByRole('heading', { name: 'Invitación B' })).toBeVisible();
      expect(signal.aborted).toBe(true);
      pending.resolve({ invitationId: 'A', responseStatus: 'CONFIRMED', assistants: [] });
      expect(screen.queryByText('Invitación A')).not.toBeInTheDocument();
    }
  );

  it('discards an uncertain mutation failure after navigation without reconciling the old token', async () => {
    const mutation = deferred<never>();
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve).mockImplementation((value) => Promise.resolve(invitation(value)));
    vi.mocked(api.publicInvitation.confirm).mockReturnValue(mutation.promise);
    const { router } = renderApp(api, '/invitacion/A');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Confirmar asistencia' })).at(-1)!);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar asistencia' }));
    await router.navigate('/invitacion/B');
    expect(await screen.findByRole('heading', { name: 'Invitación B' })).toBeVisible();
    mutation.reject(new ApiError(500, 'INTERNAL_ERROR', 'hidden'));
    await waitFor(() => expect(api.publicInvitation.resolve).toHaveBeenCalledTimes(2));
  });
});

describe('local public media recovery', () => {
  it('retries only a failed QR and keeps the dialog open', async () => {
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve).mockResolvedValue(invitation('A', 'Confirmada', true));
    vi.mocked(api.publicInvitation.qr)
      .mockRejectedValueOnce(new Error('storage'))
      .mockResolvedValueOnce(new Blob(['svg']));
    renderApp(api, '/invitacion/A');
    await userEvent.click(await screen.findByRole('button', { name: 'Ver mi QR' }));
    expect(await screen.findByText('No pudimos preparar el QR.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByAltText('Código QR de acceso')).toBeVisible();
    expect(api.publicInvitation.resolve).toHaveBeenCalledTimes(1);
    expect(api.publicInvitation.qr).toHaveBeenCalledTimes(2);
  });

  it('aborts and discards a late QR response after closing the dialog', async () => {
    const lateQr = deferred<Blob>();
    const api = publicApi();
    let signal: AbortSignal | undefined;
    vi.mocked(api.publicInvitation.resolve).mockResolvedValue(invitation('A', 'Confirmada', true));
    vi.mocked(api.publicInvitation.qr).mockImplementation((_token, requestSignal) => {
      signal = requestSignal;
      return lateQr.promise;
    });
    renderApp(api, '/invitacion/A');
    await userEvent.click(await screen.findByRole('button', { name: 'Ver mi QR' }));
    await waitFor(() => expect(signal).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(signal?.aborted).toBe(true);
    lateQr.resolve(new Blob(['late']));
    await waitFor(() => expect(screen.queryByAltText('Código QR de acceso')).not.toBeInTheDocument());
  });

  it('retries a failed Flyer asset without reloading the invitation', async () => {
    const api = publicApi();
    vi.mocked(api.publicInvitation.resolve).mockResolvedValue(invitation('A'));
    vi.mocked(api.publicInvitation.asset)
      .mockRejectedValueOnce(new Error('storage'))
      .mockResolvedValueOnce(new Blob(['ok']));
    renderApp(api, '/invitacion/A');
    expect(await screen.findByText('No pudimos cargar este contenido.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByAltText('Diseño de la invitación')).toBeVisible();
    expect(api.publicInvitation.resolve).toHaveBeenCalledTimes(1);
  });

  it('retries a failed album photo and keeps its route projection', async () => {
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockResolvedValue(album('A', 'Álbum', 1));
    vi.mocked(api.publicAlbum.photo)
      .mockRejectedValueOnce(new Error('storage'))
      .mockResolvedValueOnce(new Blob(['ok']));
    renderApp(api, '/album/A');
    expect(await screen.findByText('No pudimos cargar este contenido.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Abrir foto 1' })).toBeVisible();
    expect(api.publicAlbum.resolve).toHaveBeenCalledTimes(1);
  });

  it('bounds 35 gallery photos to eight active Object URLs and revokes all on unmount', async () => {
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockResolvedValue(album('A', 'Álbum grande', 35));
    const app = renderApp(api, '/album/A');
    await screen.findByRole('heading', { name: 'Álbum grande' });
    await waitFor(() => expect(api.publicAlbum.photo).toHaveBeenCalledTimes(35));
    await waitFor(() => expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(35));
    expect(vi.mocked(URL.createObjectURL).mock.calls.length - vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(8);
    app.unmount();
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(35);
  });

  it('removes Flipbook transitions when reduced motion is requested', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    });
    const api = publicApi();
    const view = invitation('A');
    view.designType = 'FLIPBOOK';
    view.design = {
      type: 'FLIPBOOK',
      pages: [{ id: 'page', position: 1, asset: view.design!.flyerInitialAsset! }],
      hotspots: []
    };
    vi.mocked(api.publicInvitation.resolve).mockResolvedValue(view);
    renderApp(api, '/invitacion/A');
    const image = await screen.findByAltText('Página 1 de la invitación');
    expect(getComputedStyle(image.parentElement!).transition).toBe('none');
  });
});

function album(token: string, title: string, photoCount: number): PublicAlbum {
  return {
    status: 'AVAILABLE',
    event: { name: `Evento ${token}` },
    album: {
      title,
      publishedAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
      theme: { backgroundColor: '#111111', textColor: '#ffffff', accentColor: '#cbaE71' },
      photos: Array.from({ length: photoCount }, (_, index) => {
        const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
        return {
          id,
          position: index + 1,
          contentPath: `/api/v1/public/albums/${token}/photos/${id}/content`
        };
      })
    }
  };
}
