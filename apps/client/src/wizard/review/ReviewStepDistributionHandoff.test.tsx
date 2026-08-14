import type { Event } from '@invitaciones/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent, financeBalance, mockApiClient, movement, receipt } from '../../test/fixtures';
import { renderApp } from '../../test/render-app';

const digitalReady = {
  ...configuredEvent,
  serviceId: 'service-flyer',
  serviceCode: 'FLYER',
  status: 'READY_TO_ACTIVATE',
  confirmationEnabled: true,
  locationUrl: 'https://example.com/mapa',
  giftRegistryUrl: 'https://example.com/regalos'
} satisfies Event;

const digitalActive = {
  ...digitalReady,
  status: 'ACTIVE'
} satisfies Event;

const physicalReady = {
  ...configuredEvent,
  serviceId: 'service-physical',
  serviceCode: 'PHYSICAL_QR',
  status: 'READY_TO_ACTIVATE',
  confirmationEnabled: false
} satisfies Event;

const physicalActive = {
  ...physicalReady,
  status: 'ACTIVE'
} satisfies Event;

const activationResult = (event: Event, credits: number) => ({
  event,
  baseCostCredits: credits,
  promotionDiscountCredits: 0,
  finalCostCredits: credits,
  purchasedCreditsUsed: credits,
  creditLineCreditsUsed: 0,
  movements: [movement],
  receipt,
  balance: financeBalance
});

describe('post-activation handoff', () => {
  it('hands an activated Flyer directly to invitation distribution', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(digitalReady);
    vi.mocked(api.events.activate).mockResolvedValue(activationResult(digitalActive, 5));
    vi.mocked(api.design.readiness).mockResolvedValue({ complete: true, blockers: [], designType: 'FLYER' });

    renderApp(api, `/eventos/${digitalReady.id}/configuracion/revision`);

    const activate = await screen.findByRole('button', { name: 'Activar Evento' });
    await waitFor(() => expect(activate).toBeEnabled());
    await userEvent.click(activate);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar activación' }));

    expect(await screen.findByText('El evento está activo y listo para operar.')).toBeInTheDocument();
    expect(screen.queryByText(/aún no está listo para activar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar Evento' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enviar invitaciones' })).toHaveAttribute(
      'href',
      `/eventos/${digitalReady.id}?seccion=invitaciones`
    );
  });

  it('hands an activated Physical QR event to its operational workspace without digital invitation actions', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(physicalReady);
    vi.mocked(api.events.activate).mockResolvedValue(activationResult(physicalActive, 3));
    vi.mocked(api.physicalPasses.list).mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        eventId: physicalReady.id,
        passNumber: 1,
        status: 'UNUSED',
        table: null,
        usedAt: null,
        createdAt: '2026-08-01T12:00:00.000Z'
      }
    ]);

    renderApp(api, `/eventos/${physicalReady.id}/configuracion/revision`);

    const activate = await screen.findByRole('button', { name: 'Activar Evento' });
    await waitFor(() => expect(activate).toBeEnabled());
    await userEvent.click(activate);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar activación' }));

    expect(await screen.findByText('El evento está activo y listo para operar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al evento' })).toHaveAttribute('href', `/eventos/${physicalReady.id}`);
    expect(screen.queryByRole('link', { name: 'Enviar invitaciones' })).not.toBeInTheDocument();
  });
});
