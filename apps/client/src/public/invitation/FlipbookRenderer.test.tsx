import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlipbookRenderer, preloadPageIndexes } from './FlipbookRenderer';

const token = 'flipbook-renderer-test';

function fixture(pageCount: number, invitationToken = token): PublicInvitationView {
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
          contentPath: `/api/v1/public/invitations/${invitationToken}/assets/5c643f2f-7247-42a3-8348-${String(index + 1).padStart(12, '0')}/content`
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
  Object.defineProperties(window, {
    innerHeight: { configurable: true, value: spread ? 768 : 844 },
    innerWidth: { configurable: true, value: spread ? 1024 : 390 }
  });
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

function renderFlipbook(
  pageCount = 6,
  onRsvp = vi.fn(),
  invitationToken = token,
  apiClient = {
    publicInvitation: { asset: vi.fn().mockResolvedValue(new Blob(['page'], { type: 'image/svg+xml' })) }
  } as unknown as ApiClient
) {
  return {
    apiClient,
    onRsvp,
    ...render(
      <FlipbookRenderer
        apiClient={apiClient}
        token={invitationToken}
        view={fixture(pageCount, invitationToken)}
        onRsvp={onRsvp}
        onUnavailableQr={vi.fn()}
      />
    )
  };
}

afterEach(() => setMedia({ spread: false, reducedMotion: false }));

describe('FlipbookRenderer', () => {
  it('keeps only visible pages and immediate neighbors in the asset window', () => {
    expect(preloadPageIndexes(10, [0])).toEqual(new Set([0, 1]));
    expect(preloadPageIndexes(10, [4])).toEqual(new Set([3, 4, 5]));
    expect(preloadPageIndexes(10, [4, 5])).toEqual(new Set([3, 4, 5, 6]));
  });

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
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-cover', 'single');
    expect(screen.getByRole('group', { name: /1 de 6/ })).toBeVisible();
  });

  it('opens the cover and moves through reader spreads without changing the backend payload', async () => {
    setMedia({ spread: true });
    const { container } = renderFlipbook();
    const reader = container.querySelector('.flipbook-reader')!;

    await act(async () => undefined);
    expect(reader).toHaveAttribute('data-visible-pages', '0');
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-cover', 'single');
    fireEvent.click(screen.getByRole('button', { name: /abrir invit/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '1,2');
    expect(container.querySelector('.flipbook-volume')).toHaveAttribute('data-cover', 'spread');
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '3,4');
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '1,2');
  });

  it('uses the secondary page index through the same engine navigation path', async () => {
    setMedia({ spread: true });
    const { container } = renderFlipbook();
    const reader = container.querySelector('.flipbook-reader')!;

    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir índice de páginas' }));
    expect(screen.getByLabelText('Índice de páginas')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Ir a página 5' }));
    expect(reader).toHaveAttribute('data-visible-pages', '3,4');
    expect(screen.queryByLabelText('Índice de páginas')).not.toBeInTheDocument();
  });

  it('opens the cover when the reader surface is clicked', async () => {
    setMedia({ spread: true });
    const { container } = renderFlipbook();
    const reader = container.querySelector('.flipbook-reader')!;

    await act(async () => undefined);
    fireEvent.click(container.querySelector('.flipbook-volume')!);
    expect(reader).toHaveAttribute('data-visible-pages', '1,2');
  });

  it('rebuilds the visual spread after a resize without losing the focal leaf', async () => {
    setMedia();
    const { container } = renderFlipbook();
    const reader = container.querySelector('.flipbook-reader')!;

    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: /abrir invit/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '1');

    setMedia({ spread: true });
    await act(async () => window.dispatchEvent(new Event('resize')));

    expect(container.querySelector('.flip-engine')).toHaveAttribute('data-layout', 'spread');
    await waitFor(() => expect(reader).toHaveAttribute('data-visible-pages', '1,2'));
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

  it('keeps a failed page asset retryable through the public asset contract', async () => {
    setMedia();
    const apiClient = {
      publicInvitation: {
        asset: vi
          .fn()
          .mockRejectedValueOnce(new Error('temporary asset failure'))
          .mockResolvedValue(new Blob(['page'], { type: 'image/svg+xml' }))
      }
    } as unknown as ApiClient;
    renderFlipbook(1, vi.fn(), token, apiClient);

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(apiClient.publicInvitation.asset).toHaveBeenCalledTimes(2));
  });

  it('resets the local reader and reloads assets when the public token changes', async () => {
    setMedia();
    const { apiClient, container, onRsvp, rerender } = renderFlipbook(3);
    const reader = container.querySelector('.flipbook-reader')!;
    const nextToken = 'flipbook-renderer-next-token';

    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: /abrir invit/i }));
    expect(reader).toHaveAttribute('data-visible-pages', '1');

    rerender(
      <FlipbookRenderer
        apiClient={apiClient}
        token={nextToken}
        view={fixture(3, nextToken)}
        onRsvp={onRsvp}
        onUnavailableQr={vi.fn()}
      />
    );

    await waitFor(() => expect(reader).toHaveAttribute('data-visible-pages', '0'));
    await waitFor(() =>
      expect(apiClient.publicInvitation.asset).toHaveBeenCalledWith(
        nextToken,
        expect.any(String),
        expect.any(AbortSignal)
      )
    );
  });
});
