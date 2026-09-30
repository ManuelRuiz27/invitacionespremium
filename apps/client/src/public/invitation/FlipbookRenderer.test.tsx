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
        {
          id: 'rsvp-cover',
          action: 'RSVP',
          destination: null,
          flipbookPageId: 'page-1',
          visualOwnerType: 'FLIPBOOK_PAGE',
          x: 0.1,
          y: 0.1,
          width: 0.3,
          height: 0.1,
          priority: 0
        }
      ]
    }
  } as PublicInvitationView;
}

function setMedia({ spread = false, reducedMotion = true } = {}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches:
        (spread && query.includes('orientation: landscape')) ||
        (reducedMotion && query.includes('prefers-reduced-motion: reduce')),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  });
}

function renderFlipbook(pageCount = 6, onRsvp = vi.fn()) {
  const apiClient = {
    publicInvitation: { asset: vi.fn().mockResolvedValue(new Blob(['page'], { type: 'image/svg+xml' })) }
  } as unknown as ApiClient;
  return {
    onRsvp,
    ...render(
      <FlipbookRenderer
        apiClient={apiClient}
        token={token}
        view={fixture(pageCount)}
        onRsvp={onRsvp}
        onUnavailableQr={vi.fn()}
      />
    )
  };
}

afterEach(() => setMedia({ spread: false, reducedMotion: false }));

describe('FlipbookRenderer', () => {
  it('renders persisted pages through the local engine and keeps the public asset contract', () => {
    setMedia({ spread: true });
    const { container } = renderFlipbook();

    const engine = container.querySelector('.flip-engine');
    expect(engine).toHaveAttribute('data-layout', 'spread');
    expect(container.querySelectorAll('[data-flipbook-page-id]')).toHaveLength(6);
    expect(container.querySelectorAll('.flip-engine-page-front')).toHaveLength(6);
    expect(container.querySelectorAll('.flip-engine-page-back')).toHaveLength(0);
    expect(container.querySelector('[data-flipbook-page-id="page-1"]')).toHaveAttribute(
      'data-flipbook-page-id',
      'page-1'
    );
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-flip-engine');
  });

  it('opens the cover and moves through reader spreads without changing the backend payload', async () => {
    setMedia({ spread: true });
    const { container } = renderFlipbook();
    const reader = container.querySelector('.flipbook-reader')!;

    await act(async () => undefined);
    expect(reader).toHaveAttribute('data-visible-pages', '0');
    fireEvent.click(screen.getByRole('button', { name: /abrir invit/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '1,2');
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '3,4');
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '1,2');
  });

  it('opens the cover when the reader surface is clicked', async () => {
    setMedia({ spread: true });
    const { container } = renderFlipbook();
    const reader = container.querySelector('.flipbook-reader')!;

    await act(async () => undefined);
    fireEvent.click(container.querySelector('.flipbook-volume')!);
    expect(reader).toHaveAttribute('data-visible-pages', '1,2');
  });

  it('keeps visible hotspots interactive while the reader is settled', async () => {
    setMedia();
    const onRsvp = vi.fn();
    renderFlipbook(3, onRsvp);

    const rsvp = await screen.findByRole('button', { name: /confirmar asistencia/i });
    expect(rsvp).toBeEnabled();
    fireEvent.click(rsvp);
    expect(onRsvp).toHaveBeenCalledOnce();
  });
});
