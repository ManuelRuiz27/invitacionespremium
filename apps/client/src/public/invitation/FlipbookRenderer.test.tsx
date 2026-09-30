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
  return render(
    <FlipbookRenderer
      apiClient={apiClient}
      token={token}
      view={fixture(pageCount)}
      onRsvp={vi.fn()}
      onUnavailableQr={vi.fn()}
    />
  );
}

function setViewport(width: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('max-width: 767px') ? width <= 767 : false,
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
  delete (globalThis as typeof globalThis & { __flipbookMockReadDelayMs?: number }).__flipbookMockReadDelayMs;
  vi.useRealTimers();
  setViewport(1024);
});

describe('FlipbookRenderer physical leaves', () => {
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
    await waitFor(() => expect(screen.getByText('Página 2–3 de 6')).toBeVisible(), { timeout: 2000 });
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Página 1 de 6')).toBeVisible();
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'closed');
    fireEvent.click(screen.getByLabelText('Página 1 de 6'));
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'lifting');
    await waitFor(() => expect(screen.getByText('Página 2–3 de 6')).toBeVisible(), { timeout: 2000 });
  });

  it('passes each persisted page as a direct engine leaf and exposes the native desktop spreads', async () => {
    setViewport(1200);
    renderFlipbook();
    await screen.findByText('Página 1 de 6');

    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-orientation', 'landscape');
    expect(engine.querySelectorAll(':scope > [data-leaf-index]')).toHaveLength(6);
    expect(engine.querySelectorAll('[data-flipbook-page-id]')).toHaveLength(6);
    expect(engine.querySelectorAll('[data-stf-soft-mesh="true"]')).toHaveLength(6);
    expect(screen.getByLabelText('Página 1 de 6')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('Página 2–3 de 6');
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
    const { container } = renderFlipbook(4);
    await screen.findByText('Página 1 de 4');
    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-orientation', 'portrait');
    expect(engine.querySelectorAll(':scope > [data-leaf-index]:not([hidden])')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('Página 2 de 4');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 4 de 4')).toBeVisible();

    setViewport(1200);
    expect(engine).toHaveAttribute('data-orientation', 'landscape');
    expect(screen.getByText('Página 4 de 4')).toBeVisible();
  });

  it('keeps the mobile opening on one camera trajectory through page two', async () => {
    setViewport(390);
    const { container } = renderFlipbook();
    await screen.findByText('1 / 6');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    const volume = container.querySelector('.flipbook-volume');
    const engine = screen.getByTestId('flipbook-engine-mock');
    expect(engine).toHaveAttribute('data-hard-covers', 'true');
    expect(engine).toHaveAttribute('data-flipping-time', '680');
    expect(engine).toHaveAttribute('data-max-shadow-opacity', '0.3');
    expect(screen.getByLabelText('Página 1 de 6')).toHaveAttribute('data-density', 'hard');
    expect(screen.getByLabelText('Página 2 de 6')).not.toHaveAttribute('data-density');
    expect(volume).toHaveAttribute('data-intro', 'opening');
    await screen.findByText('2 / 6');
    expect(volume).toHaveAttribute('data-intro', 'opening');
    expect(volume).toHaveAttribute('data-mobile-spine', 'true');
    await waitFor(() => expect(volume).toHaveAttribute('data-intro', 'open'), { timeout: 1600 });
  });

  it('tracks turning, page landing and rest without alternating engine states', async () => {
    setViewport(390);
    (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync = true;
    const { container } = renderFlipbook();
    await screen.findByText('1 / 6');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('2 / 6');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'));

    (globalThis as typeof globalThis & { __flipbookMockReadDelayMs?: number }).__flipbookMockReadDelayMs = 80;
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(container.querySelector('.flipbook-reader')).toHaveAttribute('data-transition', 'turning');
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-mobile-spine', 'true');
    await screen.findByText('3 / 6');
    expect(container.querySelector('.flipbook-reader')).toHaveAttribute('data-transition', 'settling');
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-mobile-spine', 'true');
    await waitFor(() => expect(container.querySelector('.flipbook-reader')).toHaveAttribute('data-transition', 'idle'));
  });

  it('transfers mobile page depth continuously as the reader advances', async () => {
    setViewport(390);
    const { container } = renderFlipbook();
    await screen.findByText('1 / 6');
    const volume = container.querySelector('.flipbook-volume') as HTMLElement;
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('1px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('7px');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('2 / 6');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'));
    expect(volume).toHaveAttribute('data-mobile-spine', 'true');
    expect(volume).not.toHaveAttribute('data-page-stack');
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('2.2px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('5.8px');

    (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync = true;
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('2.8px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('5.2px');
    expect(volume.style.getPropertyValue('--flipbook-contact-shadow-opacity')).toBe('0.280');
    expect(volume.style.getPropertyValue('--flipbook-contact-shadow-scale')).toBe('1.000');
    await screen.findByText('3 / 6');
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('3.4px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('4.6px');
    expect(volume.style.getPropertyValue('--flipbook-contact-shadow-opacity')).toBe('0.240');
    expect(volume.style.getPropertyValue('--flipbook-contact-shadow-scale')).toBe('0.960');
    expect(volume).toHaveAttribute('data-mobile-spine', 'true');

    (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync = false;
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('4 / 6')).toBeVisible();
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('4.6px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('3.4px');
    expect(volume).toHaveAttribute('data-mobile-spine', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('5 / 6')).toBeVisible();
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('5.8px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('2.2px');
    expect(volume).toHaveAttribute('data-mobile-spine', 'true');
  });

  it('uses the lower corner for physical mobile reversal', async () => {
    setViewport(390);
    const { container } = renderFlipbook();
    await screen.findByText('1 / 6');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('2 / 6');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'));

    const volume = container.querySelector('.flipbook-volume') as HTMLElement;
    (globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync = true;
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByTestId('flipbook-engine-mock')).toHaveAttribute('data-last-turn-direction', 'prev');
    expect(screen.getByTestId('flipbook-engine-mock')).toHaveAttribute('data-last-turn-corner', 'bottom');
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('1.6px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('6.4px');
    await screen.findByText('1 / 6');
    expect(volume.style.getPropertyValue('--flipbook-accumulated-depth')).toBe('1px');
    expect(volume.style.getPropertyValue('--flipbook-remaining-depth')).toBe('7px');
  });

  it('leaves touch release on the live fold instead of cancelling and restarting the turn', async () => {
    setViewport(390);
    const { container } = renderFlipbook();
    await screen.findByText('1 / 6');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir invitación' }));
    await screen.findByText('2 / 6');
    await waitFor(() => expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-intro', 'open'));

    const engine = screen.getByTestId('flipbook-engine-mock');
    const foldSurface = container.querySelector('.stf__block') as HTMLElement;
    const cancelled = vi.fn();
    foldSurface.addEventListener('pointercancel', cancelled);

    fireEvent.pointerDown(foldSurface, {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 350,
      clientY: 500
    });
    fireEvent.pointerMove(foldSurface, {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 220,
      clientY: 500
    });
    fireEvent.pointerUp(foldSurface, {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 80,
      clientY: 500
    });

    expect(cancelled).not.toHaveBeenCalled();
    expect(engine).toHaveAttribute('data-swipe-distance', '10000');
    expect(screen.getByText('2 / 6')).toBeVisible();
  });

  it('reveals mobile controls on touch, then hides them after inactivity', async () => {
    setViewport(390);
    const { container } = renderFlipbook();
    await screen.findByText('1 / 6');
    const reader = container.querySelector('.flipbook-reader');
    expect(reader).not.toHaveAttribute('data-mobile-controls');

    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByTestId('flipbook-engine-mock'), { pointerType: 'touch', isPrimary: true });
    expect(reader).toHaveAttribute('data-mobile-controls', 'true');
    act(() => vi.advanceTimersByTime(2500));
    expect(reader).not.toHaveAttribute('data-mobile-controls');
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
