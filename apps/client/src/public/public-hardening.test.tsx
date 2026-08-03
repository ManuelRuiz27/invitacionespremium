import type { ApiClient, PublicAlbum, PublicInvitationView } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const assetId = '2e07a475-7865-4782-9916-04dba57fb2ef';
const primaryId = 'fa94fd76-65f6-4216-a73f-913a94c12412';
let autoIntersect = true;
let observed: Array<{
  target: Element;
  callback: IntersectionObserverCallback;
  observer: IntersectionObserver;
}> = [];

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

type MutationKind = 'confirm' | 'reject' | 'update';

async function startInvalidatingMutation(
  kind: MutationKind,
  errorCode: string,
  authoritative: PublicInvitationView | 'NOT_FOUND'
): Promise<ApiClient> {
  const api = publicApi();
  const initial = invitation('A', 'Proyección anterior', kind === 'update');
  vi.mocked(api.publicInvitation.resolve).mockResolvedValueOnce(initial);
  if (authoritative === 'NOT_FOUND')
    vi.mocked(api.publicInvitation.resolve).mockRejectedValueOnce(new ApiError(404, 'INVITATION_NOT_FOUND', 'hidden'));
  else vi.mocked(api.publicInvitation.resolve).mockResolvedValueOnce(authoritative);
  const mutation = api.publicInvitation[kind === 'update' ? 'updateAssistants' : kind];
  vi.mocked(mutation).mockRejectedValue(new ApiError(409, errorCode, 'hidden'));
  renderApp(api, '/invitacion/A');
  const openName = kind === 'update' ? 'Modificar acompañantes' : 'Confirmar asistencia';
  await userEvent.click((await screen.findAllByRole('button', { name: openName })).at(-1)!);
  const dialog = screen.getByRole('dialog');
  if (kind === 'reject') {
    await userEvent.click(within(dialog).getByRole('button', { name: 'No asistiré' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, rechazar' }));
  } else {
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: kind === 'update' ? 'Guardar cambios' : 'Confirmar asistencia'
      })
    );
  }
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
  autoIntersect = true;
  observed = [];
  class ControlledObserver {
    readonly rootMargin: string;
    constructor(
      private readonly callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this.rootMargin = options?.rootMargin ?? '0px';
    }
    observe(target: Element) {
      observed.push({ target, callback: this.callback, observer: this as never });
      if (autoIntersect) this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
    }
    disconnect() {
      observed = observed.filter((item) => item.observer !== (this as never));
    }
    unobserve(target: Element) {
      observed = observed.filter((item) => item.target !== target || item.observer !== (this as never));
    }
    takeRecords() {
      return [];
    }
    root = null;
    thresholds = [0];
  }
  Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: ControlledObserver });
});

function intersect(position: number, isIntersecting: boolean, scope: 'all' | 'nearby' | 'visible' = 'all') {
  const target = document.querySelector(`[data-photo-position="${position}"]`);
  if (!target) throw new Error(`Photo ${position} is not registered.`);
  const registrations = observed.filter(
    (item) =>
      item.target === target &&
      (scope === 'all' ||
        (scope === 'nearby' ? item.observer.rootMargin !== '0px' : item.observer.rootMargin === '0px'))
  );
  if (registrations.length === 0) throw new Error(`Photo ${position} is not observed.`);
  for (const registration of registrations)
    registration.callback([{ isIntersecting, target } as IntersectionObserverEntry], registration.observer);
}

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

  it('removes invitation A and its open QR in the first render of pending token B', async () => {
    const pendingB = deferred<PublicInvitationView>();
    const api = publicApi();
    const viewA = invitation('A', 'Evento secreto A', true);
    viewA.design!.hotspots = [
      {
        id: 'hotspot-a',
        action: 'EXTERNAL_LINK',
        destination: 'https://example.com/a',
        visualOwnerType: 'FLYER',
        flipbookPageId: null,
        x: 0,
        y: 0,
        width: 0.2,
        height: 0.2,
        priority: 1
      }
    ];
    vi.mocked(api.publicInvitation.resolve).mockImplementation((value) =>
      value === 'A' ? Promise.resolve(viewA) : pendingB.promise
    );
    const { router } = renderApp(api, '/invitacion/A');
    expect(await screen.findByRole('heading', { name: 'Evento secreto A' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Abrir enlace' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ver mi QR' }));
    expect(await screen.findByRole('dialog')).toBeVisible();

    await act(async () => router.navigate('/invitacion/B'));

    expect(router.state.location.pathname).toBe('/invitacion/B');
    expect(screen.getByLabelText('Cargando invitación')).toBeVisible();
    expect(screen.queryByText('Evento secreto A')).not.toBeInTheDocument();
    expect(screen.queryByText('Principal')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir enlace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Diseño de la invitación')).not.toBeInTheDocument();

    pendingB.resolve(invitation('B', 'Evento B'));
    expect(await screen.findByRole('heading', { name: 'Evento B' })).toBeVisible();
    expect(screen.queryByText('Evento secreto A')).not.toBeInTheDocument();
  });

  it('removes album A metadata, photos and preview in the first render of pending token B', async () => {
    const pendingB = deferred<PublicAlbum>();
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockImplementation((value) =>
      value === 'A' ? Promise.resolve(album('A', 'Álbum confidencial A', 1)) : pendingB.promise
    );
    const { router } = renderApp(api, '/album/A');
    expect(await screen.findByRole('heading', { name: 'Álbum confidencial A' })).toBeVisible();
    expect(screen.getByText('Gracias A')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Video A' })).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }));
    expect(screen.getByRole('dialog')).toBeVisible();

    await act(async () => router.navigate('/album/B'));

    expect(router.state.location.pathname).toBe('/album/B');
    expect(screen.getByLabelText('Cargando álbum')).toBeVisible();
    expect(screen.queryByText('Álbum confidencial A')).not.toBeInTheDocument();
    expect(screen.queryByText('Gracias A')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Video A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir foto 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    pendingB.resolve(album('B', 'Álbum B', 1));
    expect(await screen.findByRole('heading', { name: 'Álbum B' })).toBeVisible();
    expect(screen.queryByText('Álbum confidencial A')).not.toBeInTheDocument();
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

  it.each(
    (['confirm', 'reject', 'update'] as const).flatMap((kind) =>
      (['RSVP_CLOSED', 'RSVP_NOT_AVAILABLE'] as const).map((code) => [kind, code] as const)
    )
  )(
    'reconciles an unavailable confirmation after %s (%s) and keeps only the authoritative projection',
    async (kind, code) => {
      const closed = invitation('A', 'Diseño permitido', kind === 'update');
      closed.confirmation = { open: false };
      const api = await startInvalidatingMutation(kind, code, closed);
      expect(
        await screen.findByText('La confirmación de asistencia ya fue cerrada. Contacta al organizador.')
      ).toBeVisible();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(
        screen.queryByRole('button', { name: /Confirmar asistencia|Modificar acompañantes/ })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Diseño permitido' })).toBeVisible();
      expect(api.publicInvitation.resolve).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['confirm', 'reject', 'update'] as const)(
    'reconciles event cancellation after %s and removes every previous control',
    async (kind) => {
      await startInvalidatingMutation(kind, 'RSVP_EVENT_CANCELLED', {
        status: 'CANCELLED',
        message: 'Este evento ha sido cancelado por el organizador.'
      });
      expect(
        await screen.findByRole('heading', { name: 'Este evento ha sido cancelado por el organizador.' })
      ).toBeVisible();
      expect(screen.queryByText('Proyección anterior')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ver mi QR' })).not.toBeInTheDocument();
      expect(screen.queryByAltText('Diseño de la invitación')).not.toBeInTheDocument();
    }
  );

  it.each(['confirm', 'reject', 'update'] as const)(
    'reconciles invitation cancellation after %s with its specific authorized message',
    async (kind) => {
      await startInvalidatingMutation(kind, 'RSVP_INVITATION_CANCELLED', {
        status: 'CANCELLED',
        message: 'Esta invitación fue cancelada por el organizador.'
      });
      expect(
        await screen.findByRole('heading', { name: 'Esta invitación fue cancelada por el organizador.' })
      ).toBeVisible();
      expect(screen.queryByText('Proyección anterior')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it.each(['confirm', 'reject', 'update'] as const)(
    'reconciles an event closure after %s and retains only the allowed album projection',
    async (kind) => {
      await startInvalidatingMutation(kind, 'RSVP_EVENT_STATE_INVALID', {
        status: 'CLOSED',
        album: { state: 'AVAILABLE', contentPath: '/api/v1/public/albums/album-A' }
      });
      expect(await screen.findByRole('heading', { name: 'Este evento ha finalizado.' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Ver álbum del evento' })).toHaveAttribute('href', '/album/album-A');
      expect(screen.queryByText('Proyección anterior')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );

  it.each(['confirm', 'reject', 'update'] as const)(
    'reconciles a removed invitation after %s as a neutral unavailable resource',
    async (kind) => {
      await startInvalidatingMutation(kind, 'INVITATION_NOT_FOUND', 'NOT_FOUND');
      expect(await screen.findByRole('heading', { name: 'Esta invitación no está disponible.' })).toBeVisible();
      expect(screen.queryByText('Proyección anterior')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );
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

  it('loads only the controlled visible window, evicts without false errors and reloads on scroll back', async () => {
    autoIntersect = false;
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockResolvedValue(album('A', 'Álbum grande', 35));
    const app = renderApp(api, '/album/A');
    await screen.findByRole('heading', { name: 'Álbum grande' });
    expect(document.querySelectorAll('[data-photo-position]')).toHaveLength(35);
    expect(api.publicAlbum.photo).not.toHaveBeenCalled();

    act(() => {
      for (let position = 1; position <= 9; position += 1) intersect(position, true);
    });
    await waitFor(() => expect(api.publicAlbum.photo).toHaveBeenCalledTimes(9));
    await waitFor(() => expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(9));
    expect(vi.mocked(URL.createObjectURL).mock.calls.length - vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(8);
    expect(screen.queryByText('No pudimos cargar este contenido.')).not.toBeInTheDocument();

    act(() => intersect(1, false));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrir foto 1' })).not.toBeInTheDocument());
    act(() => intersect(1, true));
    await waitFor(() => expect(api.publicAlbum.photo).toHaveBeenCalledTimes(10));
    expect(screen.queryByText('No pudimos cargar este contenido.')).not.toBeInTheDocument();

    act(() => {
      for (let position = 1; position <= 9; position += 1) intersect(position, false);
      for (let position = 10; position <= 18; position += 1) intersect(position, true);
    });
    await waitFor(() => expect(api.publicAlbum.photo).toHaveBeenCalledTimes(19));
    expect(vi.mocked(URL.createObjectURL).mock.calls.length - vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(8);
    app.unmount();
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(vi.mocked(URL.revokeObjectURL).mock.calls.length);
  });

  it('keeps eight visible photos when a nearby download finishes and admits it after it becomes visible', async () => {
    autoIntersect = false;
    const nearbyPhoto = deferred<Blob>();
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockResolvedValue(album('A', 'Ãlbum prioritario', 9));
    vi.mocked(api.publicAlbum.photo).mockImplementation((_token, photoId) =>
      photoId.endsWith('000000000008') ? nearbyPhoto.promise : Promise.resolve(new Blob([photoId]))
    );
    renderApp(api, '/album/A');
    await screen.findByRole('heading', { name: 'Ãlbum prioritario' });

    act(() => {
      for (let position = 1; position <= 8; position += 1) intersect(position, true);
    });
    await waitFor(() => expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(8));
    act(() => intersect(9, true, 'nearby'));
    await waitFor(() => expect(api.publicAlbum.photo).toHaveBeenCalledTimes(9));
    nearbyPhoto.resolve(new Blob(['nearby']));
    await waitFor(() =>
      expect(document.querySelector('[data-photo-position="9"] .MuiSkeleton-root')).toBeInTheDocument()
    );

    expect(api.publicAlbum.photo).toHaveBeenCalledTimes(9);
    expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledTimes(8);
    for (let position = 1; position <= 8; position += 1) {
      expect(screen.getByRole('button', { name: `Abrir foto ${position}` })).toBeVisible();
      expect(document.querySelector(`[data-photo-position="${position}"] .MuiSkeleton-root`)).not.toBeInTheDocument();
    }
    expect(screen.queryByText('No pudimos cargar este contenido.')).not.toBeInTheDocument();

    act(() => {
      intersect(1, false);
      intersect(9, true, 'visible');
    });
    expect(await screen.findByRole('button', { name: 'Abrir foto 9' })).toBeVisible();
    expect(vi.mocked(URL.createObjectURL).mock.calls.length - vi.mocked(URL.revokeObjectURL).mock.calls.length).toBe(8);
    expect(screen.queryByText('No pudimos cargar este contenido.')).not.toBeInTheDocument();
  });

  it('reuses and pins the selected photo URL while the preview is open', async () => {
    autoIntersect = false;
    const api = publicApi();
    vi.mocked(api.publicAlbum.resolve).mockResolvedValue(album('A', 'Álbum con preview', 12));
    renderApp(api, '/album/A');
    await screen.findByRole('heading', { name: 'Álbum con preview' });
    act(() => {
      for (let position = 1; position <= 8; position += 1) intersect(position, true);
    });
    const first = await screen.findByRole('button', { name: 'Abrir foto 1' });
    const selectedUrl = within(first).getByRole('img').getAttribute('src');
    const callsBeforePreview = vi.mocked(api.publicAlbum.photo).mock.calls.length;
    await userEvent.click(first);
    expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src', selectedUrl);
    expect(api.publicAlbum.photo).toHaveBeenCalledTimes(callsBeforePreview);

    act(() => {
      intersect(1, false);
      for (let position = 9; position <= 12; position += 1) intersect(position, true);
    });
    await waitFor(() => expect(api.publicAlbum.photo).toHaveBeenCalledTimes(callsBeforePreview + 4));
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(selectedUrl);
    expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src', selectedUrl);
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
      thankYouMessage: `Gracias ${token}`,
      externalButton: { label: `Video ${token}`, url: 'https://example.com/video' },
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
