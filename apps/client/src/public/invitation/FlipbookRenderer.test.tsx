import { act, fireEvent, render, screen } from '@testing-library/react';
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
  return { id, action, destination, flipbookPageId, visualOwnerType: 'FLIPBOOK_PAGE', x: 0.1, y: 0.1, width: 0.3, height: 0.1, priority: 0 };
}

function renderFlipbook(pageCount = 6) {
  const apiClient = {
    publicInvitation: { asset: vi.fn().mockResolvedValue(new Blob(['page'], { type: 'image/svg+xml' })) }
  } as unknown as ApiClient;
  return render(
    <FlipbookRenderer
      apiClient={apiClient}
      token={token}
      view={fixture(pageCount)}
      onRsvp={vi.fn()}
      onQr={vi.fn()}
      onUnavailableQr={vi.fn()}
    />
  );
}

function setViewport(width: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
  });
}

afterEach(() => {
  delete (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync;
  setViewport(1024);
});

describe('FlipbookRenderer physical leaves', () => {
  it('passes each persisted page as a direct engine leaf and exposes the native desktop spreads', async () => {
    setViewport(1200);
    renderFlipbook();
    await screen.findByText('Página 1 de 6');

    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-orientation', 'landscape');
    expect(engine.querySelectorAll(':scope > [data-leaf-index]')).toHaveLength(6);
    expect(engine.querySelectorAll('[data-flipbook-page-id]')).toHaveLength(6);
    expect(screen.getByLabelText('Página 1 de 6')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2–3 de 6')).toBeVisible();
    expect(engine).toHaveAttribute('data-last-turn-leaf', '1');
    expect(screen.getByLabelText('Página 2 de 6')).toBeVisible();
    expect(screen.getByLabelText('Página 3 de 6')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 4–5 de 6')).toBeVisible();
    const location = await screen.findByRole('link', { name: 'Ver ubicación' });
    const external = await screen.findByRole('link', { name: 'Abrir enlace' });
    expect(screen.getByLabelText('Página 4 de 6')).toContainElement(location);
    expect(screen.getByLabelText('Página 5 de 6')).toContainElement(external);
  });

  it('uses one physical leaf in portrait and leaves the fourth page as the N=4 closing leaf', async () => {
    setViewport(390);
    renderFlipbook(4);
    await screen.findByText('Página 1 de 4');
    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-orientation', 'portrait');
    expect(engine.querySelectorAll(':scope > [data-leaf-index]:not([hidden])')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 4')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 4 de 4')).toBeVisible();

    setViewport(1200);
    expect(engine).toHaveAttribute('data-orientation', 'landscape');
    expect(screen.getByText('Página 4 de 4')).toBeVisible();
  });

  it('blocks external links and RSVP while the engine reports an in-flight turn', async () => {
    setViewport(1200);
    (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync = true;
    const onRsvp = vi.fn();
    const apiClient = { publicInvitation: { asset: vi.fn().mockResolvedValue(new Blob(['page'])) } } as unknown as ApiClient;
    render(
      <FlipbookRenderer
        apiClient={apiClient}
        token={token}
        view={fixture(6)}
        onRsvp={onRsvp}
        onQr={vi.fn()}
        onUnavailableQr={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'Confirmar asistencia' });
    const rsvp = screen.getByRole('button', { name: 'Confirmar asistencia' });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(rsvp).toBeDisabled();
    fireEvent.click(rsvp);
    expect(onRsvp).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
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
