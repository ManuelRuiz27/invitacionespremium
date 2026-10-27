import { AppThemeProvider } from '@invitaciones/ui';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { createLandingCommercialLeadsClient } from '../../commercial-leads-client';
import { getLandingConfig } from '../../config/landing-config';
import { createLandingPricingClient } from '../../pricing-client';
import { publicPricingFixture } from '../../test/pricing-fixtures';

vi.mock('../../commercial-leads-client', () => ({ createLandingCommercialLeadsClient: vi.fn() }));
vi.mock('../../pricing-client', () => ({ createLandingPricingClient: vi.fn() }));

const content = getLandingConfig();
const submit = vi.fn();
const list = vi.fn();

beforeEach(() => {
  submit.mockReset().mockResolvedValue({ accepted: true });
  list.mockReset().mockResolvedValue(publicPricingFixture);
  vi.mocked(createLandingCommercialLeadsClient).mockReturnValue({ submit });
  vi.mocked(createLandingPricingClient).mockReturnValue({ list });
});

describe('Landing commercial journeys', () => {
  it.each([
    ['#planners', content.planners.commercialCta, 'PLANNER_AGENCY', null],
    ['#venues', content.venue.cta, 'VENUE', null],
    ['#venues', content.venue.personalization.cta, 'VENUE', content.venue.personalization.inquiry]
  ] as const)(
    'submits the correct opportunity from %s / %s',
    async (section, cta, opportunityType, notes) => {
      renderLanding();
      fireEvent.click(within(document.querySelector(section)!).getByRole('button', { name: cta }));
      const dialog = await screen.findByRole('dialog', undefined, { timeout: 10_000 });
      expect(within(dialog).getByRole('heading')).toHaveTextContent(
        opportunityType === 'VENUE' ? 'Propuesta para tu salón o jardín' : 'Condiciones para Planners y agencias'
      );
      expect(within(dialog).getByLabelText('Mensaje (opcional)')).toHaveValue(notes ?? '');
      fillAndSubmit();
      await screen.findByText(/Recibimos tu solicitud/);
      expect(submit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ opportunityType, notes, privacyAccepted: true }),
        expect.any(AbortSignal)
      );
    },
    15_000
  );

  it('aborts a closed Venue request and starts a clean Planner request despite a late response', async () => {
    let resolve!: (result: { accepted: true }) => void;
    submit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: content.venue.personalization.cta }));
    await screen.findByRole('dialog', undefined, { timeout: 10_000 });
    fillAndSubmit();
    const signal = submit.mock.calls[0]![1] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar solicitud comercial' }));
    expect(signal.aborted).toBe(true);
    fireEvent.click(
      within(document.querySelector('#planners')!).getByRole('button', { name: content.planners.commercialCta })
    );
    const dialog = await screen.findByRole('dialog', undefined, { timeout: 10_000 });
    await act(async () => resolve({ accepted: true }));
    expect(within(dialog).queryByText(/Recibimos tu solicitud/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Mensaje (opcional)')).toHaveValue('');
    expect(within(dialog).getByLabelText(/Nombre de contacto/)).toHaveValue('');
    fillAndSubmit();
    await screen.findByText(/Recibimos tu solicitud/);
    expect(submit.mock.calls[1]![0]).toMatchObject({ opportunityType: 'PLANNER_AGENCY', notes: null });
    expect(submit.mock.calls[1]![0].submissionId).not.toBe(submit.mock.calls[0]![0].submissionId);
  }, 15_000);

  it('renders authoritative prices and never adds monthly Venue plans to the matrix', async () => {
    list.mockResolvedValue(
      publicPricingFixture.map((price, index) => (index === 0 ? { ...price, amountMxnCents: 271900 } : price))
    );
    renderLanding();
    const pricing = within(document.querySelector('#precios')!);
    expect(await pricing.findByText('$2,719')).toBeInTheDocument();
    expect(pricing.queryByText('$2,500')).not.toBeInTheDocument();
    expect(pricing.getAllByText('MXN')).toHaveLength(9);
    expect(document.querySelectorAll('[data-service-code]')).toHaveLength(3);
    expect(pricing.queryByText(/mensualidad|Esencial|Frecuente|Intensivo/)).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledOnce();
  });

  it('keeps commercial paths available when pricing is incomplete and recovers on explicit retry', async () => {
    list.mockResolvedValueOnce(publicPricingFixture.slice(0, -1));
    renderLanding();
    const pricing = within(document.querySelector('#precios')!);
    expect(await pricing.findByText(/temporalmente no disponibles/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-service-code]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: content.venue.personalization.cta })).toBeEnabled();
    fireEvent.click(pricing.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(document.querySelectorAll('[data-service-code]')).toHaveLength(3));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('shows unavailable prices without a configured API and keeps the release limitations visible', () => {
    vi.mocked(createLandingPricingClient).mockReturnValue(undefined);
    renderLanding();
    expect(screen.getByText('Los precios no están disponibles en este entorno.')).toBeInTheDocument();
    const venues = within(document.querySelector('#venues')!);
    expect(venues.getByText(content.venue.notice)).toBeInTheDocument();
    expect(venues.getByText(content.venue.personalization.notice)).toBeInTheDocument();
    expect(venues.getByText(content.venue.pricingNotice)).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});

function renderLanding() {
  return render(
    <AppThemeProvider>
      <App />
    </AppThemeProvider>
  );
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/Nombre de contacto/), { target: { value: 'María López' } });
  fireEvent.change(screen.getByLabelText(/Empresa \/ salón \/ jardín \/ agencia/), {
    target: { value: 'Eventos Aurora' }
  });
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'maria@example.test' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
}
