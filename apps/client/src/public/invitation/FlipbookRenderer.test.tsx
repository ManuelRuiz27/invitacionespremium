import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipbookRenderer } from './FlipbookRenderer';

const token = 'flipbook-renderer-test';

function fixture(pageCount: number): PublicInvitationView {
  return {
    status: 'AVAILABLE',
    designType: 'FLIPBOOK',
    qr: { available: true },
    design: {
      type: 'FLIPBOOK',
      pages: Array.from({ length: pageCount }, (_, index) => ({
        id: `page-${index + 1}`,
        position: index + 1,
        asset: {
          id: `5c643f2f-7247-42a3-8348-${String(index + 1).padStart(12, '0')}`,
          contentPath: `/api/v1/public/invitations/${token}/assets/5c643f2f-7247-42a3-8348-${String(index + 1).padStart(12, '0')}/content`
        }
      })),
      hotspots: [
        hotspot('location-left', 'LOCATION', 'page-4', 'https://maps.example.com/location'),
        hotspot('external-right', 'EXTERNAL_LINK', 'page-5', 'https://example.com/registry'),
        hotspot('rsvp-cover', 'RSVP', 'page-1')
      ]
    }
  } as PublicInvitationView;
}

function hotspot(
  id: string,
  action: 'LOCATION' | 'EXTERNAL_LINK' | 'RSVP',
  flipbookPageId: string,
  destination: string | null = null
) {
  return {
    id,
    action,
    destination,
    flipbookPageId,
    visualOwnerType: 'FLIPBOOK_PAGE',
    x: 0.1,
    y: 0.1,
    width: 0.3,
    height: 0.1,
    priority: 0
  };
}

function renderFlipbook(pageCount = 6) {
  const apiClient = {
    publicInvitation: { asset: vi.fn().mockResolvedValue(new Blob(['page'], { type: 'image/svg+xml' })) }
  } as unknown as ApiClient;
  return {
    apiClient,
    ...render(
      <FlipbookRenderer
        apiClient={apiClient}
        token={token}
        view={fixture(pageCount)}
        onRsvp={vi.fn()}
        onUnavailableQr={vi.fn()}
      />
    )
  };
}

function setViewport(width: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('max-width: 767px') && width <= 767,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  delete (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync;
  setViewport(1024);
});

describe('FlipbookRenderer physical leaves', () => {
  it('preloads every invitation page and the desktop cover before the guest opens the book', async () => {
    const { apiClient } = renderFlipbook(4);
    await waitFor(() => expect(apiClient.publicInvitation.asset).toHaveBeenCalledTimes(5));
  });

  it('waits for the guest, then replays the opening whenever the cover is opened again', async () => {
    setViewport(1200);
    const { container } = renderFlipbook();
    await screen.findByText('Página 1 de 6');
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'closed');
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
    });
    expect(screen.getByText('Página 1 de 6')).toBeVisible();
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'closed');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar asistencia' }));
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'closed');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'lifting');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'), {
      timeout: 2000
    });
    expect(container.querySelector('[data-flipbook-endpaper="front"]')?.parentElement).not.toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Página 1 de 6')).toBeVisible();
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'closed');
    fireEvent.click(container.querySelector('[data-leaf-index="0"] [data-flipbook-page-id]')!);
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'lifting');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'), {
      timeout: 2000
    });
  });

  it('adds textured desktop endpapers around the persisted invitation leaves', async () => {
    setViewport(1200);
    renderFlipbook();
    await screen.findByText('Página 1 de 6');

    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-orientation', 'landscape');
    expect(engine.querySelectorAll(':scope > [data-leaf-index]')).toHaveLength(10);
    expect(engine.querySelectorAll('[data-flipbook-page-id]')).toHaveLength(7);
    expect(engine.querySelector('[data-flipbook-endpaper="front"]')).toBeInTheDocument();
    expect(engine.querySelector('[data-flipbook-endpaper="back"]')).toBeInTheDocument();
    expect(engine.querySelector('[data-leaf-index="0"] [data-flipbook-page-id="page-1"]')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await waitFor(() => expect(engine).toHaveAttribute('data-last-turn-leaf', '1'));
    expect(engine).toHaveAttribute('data-last-turn-leaf', '1');
    expect(engine.querySelector('[data-flipbook-endpaper="front"]')?.parentElement).not.toHaveAttribute('hidden');
    expect(engine.querySelector('[data-leaf-index="2"] [data-flipbook-page-id="page-1"]')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2–3 de 6')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 4–5 de 6')).toBeVisible();
    const location = await screen.findByRole('link', { name: 'Ver ubicación' });
    const external = await screen.findByRole('link', { name: 'Abrir enlace' });
    expect(screen.getByLabelText('Página 4 de 6')).toContainElement(location);
    expect(screen.getByLabelText('Página 5 de 6')).toContainElement(external);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 6 de 6')).toBeVisible();
    expect(engine.querySelector('[data-flipbook-endpaper="back"]')?.parentElement).not.toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('keeps portrait readers free of the desktop endpaper leaves', async () => {
    setViewport(390);
    renderFlipbook(4);
    await screen.findByText('Página 1 de 4');
    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-orientation', 'portrait');
    expect(engine.querySelectorAll(':scope > [data-leaf-index]')).toHaveLength(4);
    expect(engine.querySelector('[data-flipbook-endpaper]')).not.toBeInTheDocument();
    expect(engine.querySelectorAll(':scope > [data-leaf-index]:not([hidden])')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('Página 2 de 4');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 4 de 4')).toBeVisible();
  });

  it('blocks external links and RSVP while the engine reports an in-flight turn', async () => {
    setViewport(1200);
    (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync = true;
    const onRsvp = vi.fn();
    const apiClient = {
      publicInvitation: { asset: vi.fn().mockResolvedValue(new Blob(['page'])) }
    } as unknown as ApiClient;
    render(
      <FlipbookRenderer
        apiClient={apiClient}
        token={token}
        view={fixture(6)}
        onRsvp={onRsvp}
        onUnavailableQr={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Confirmar asistencia' });
    const rsvp = screen.getByRole('button', { name: 'Confirmar asistencia' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    expect(rsvp).toBeDisabled();
    fireEvent.click(rsvp);
    expect(onRsvp).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 580));
    });
    await screen.findByText('Página 1 de 6');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2–3 de 6');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const external = await screen.findByRole('link', { name: 'Abrir enlace' });
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(external).toHaveAttribute('aria-disabled', 'true');
    expect(external).toHaveAttribute('tabindex', '-1');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    external.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
