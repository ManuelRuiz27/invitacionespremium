import { ApiError } from '@invitaciones/api-client';
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
  it('requires an explicit intent, keeps Individual informational and preserves selection across profiles', async () => {
    renderLanding();
    const pricing = within(document.querySelector('#precios')!);
    fireEvent.click(pricing.getByRole('button', { name: 'Elegir cómo contratar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      within(document.querySelector('#como-contratar')!).getByRole('radio', { name: 'Organizo mi evento' })
    ).toHaveFocus();
    expect(
      within(document.querySelector('#como-contratar')!)
        .getAllByRole('radio')
        .every((radio) => !(radio as HTMLInputElement).checked)
    ).toBe(true);
    fireEvent.click(
      within(document.querySelector('#como-contratar')!).getByRole('radio', { name: 'Organizo mi evento' })
    );
    fireEvent.change(pricing.getByLabelText('Servicio'), { target: { value: 'FLYER' } });
    fireEvent.change(pricing.getByLabelText('Capacidad del evento'), { target: { value: '100' } });
    expect(await pricing.findByText('$5,500 MXN antes de IVA')).toBeInTheDocument();
    expect(pricing.getByText('Diseño personalizado de dos piezas principales')).toBeInTheDocument();
    fireEvent.click(pricing.getByRole('button', { name: 'Conocer cómo funciona' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    for (const label of ['Soy Planner/agencia', 'Tengo salón o jardín', 'Organizo mi evento']) {
      fireEvent.click(within(document.querySelector('#como-contratar')!).getByRole('radio', { name: label }));
      expect(pricing.getByLabelText('Servicio')).toHaveValue('FLYER');
      expect(pricing.getByLabelText('Capacidad del evento')).toHaveValue('100');
      expect(pricing.getByText('$5,500 MXN antes de IVA')).toBeInTheDocument();
    }
    expect(list).toHaveBeenCalledOnce();
  });

  it.each([
    ['Soy Planner/agencia', 'FLIPBOOK', '150', '$8,000', 'Consultar condiciones para planners', 'PLANNER_AGENCY'],
    ['Tengo salón o jardín', 'PHYSICAL_QR', '50', '$2,500', 'Solicitar propuesta para mi salón', 'VENUE']
  ] as const)(
    'carries editable context for %s using notes only',
    async (label, sku, capacity, amount, cta, opportunityType) => {
      renderLanding();
      fireEvent.click(within(document.querySelector('#como-contratar')!).getByRole('radio', { name: label }));
      const pricing = within(document.querySelector('#precios')!);
      fireEvent.change(pricing.getByLabelText('Servicio'), { target: { value: sku } });
      fireEvent.change(pricing.getByLabelText('Capacidad del evento'), { target: { value: capacity } });
      expect(await pricing.findByText(`${amount} MXN antes de IVA`)).toBeInTheDocument();
      expect(
        pricing.getByText(
          opportunityType === 'VENUE' ? /eventos efectivamente cobrados del mes anterior/ : /no es una tarifa especial/
        )
      ).toBeInTheDocument();
      fireEvent.click(pricing.getByRole('button', { name: cta }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Servicio')).toHaveValue(sku);
      expect(within(dialog).getByLabelText('Capacidad del evento')).toHaveValue(capacity);
      fireEvent.change(within(dialog).getByLabelText('Servicio'), { target: { value: 'FLYER' } });
      fireEvent.change(within(dialog).getByLabelText('Capacidad del evento'), { target: { value: '100' } });
      const message = 'Interfaz exclusiva; "sku":"FLIPBOOK"\n<script>texto</script>';
      fireEvent.change(within(dialog).getByLabelText('Mensaje (opcional)'), { target: { value: message } });
      fillAndSubmit();
      await screen.findByText(/Recibimos tu solicitud/);
      const input = submit.mock.calls[0]![0];
      expect(input.opportunityType).toBe(opportunityType);
      expect(JSON.parse(input.notes)).toEqual({
        contextoPrecioPublico: { sku: 'FLYER', capacidad: '51–100 personas' },
        mensaje: message
      });
      expect(input).not.toHaveProperty('sku');
      expect(input).not.toHaveProperty('capacityMax');
      expect(input.notes.length).toBeLessThanOrEqual(1000);
    }
  );

  it.each([409, 429])('preserves edited context, message and submission ID after HTTP %s', async (status) => {
    submit.mockRejectedValueOnce(new ApiError(status, 'ERROR', 'technical'));
    renderLanding();
    fireEvent.click(
      within(document.querySelector('#como-contratar')!).getByRole('radio', { name: 'Soy Planner/agencia' })
    );
    fireEvent.click(
      within(document.querySelector('#precios')!).getByRole('button', { name: 'Consultar condiciones para planners' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Servicio'), { target: { value: 'FLIPBOOK' } });
    fireEvent.change(within(dialog).getByLabelText('Mensaje (opcional)'), { target: { value: 'Conservar mis notas' } });
    fillAndSubmit();
    await screen.findByText(status === 409 ? /solicitud cambió/ : /varias solicitudes/);
    expect(screen.queryByText(/Recibimos tu solicitud/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Servicio')).toHaveValue('FLIPBOOK');
    expect(within(dialog).getByLabelText('Mensaje (opcional)')).toHaveValue('Conservar mis notas');
    expect(within(dialog).getByLabelText(/Nombre de contacto/)).toHaveValue('María López');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío' }));
    await screen.findByText(/Recibimos tu solicitud/);
    expect(submit.mock.calls[1]![0]).toEqual(submit.mock.calls[0]![0]);
  });

  it('rejects oversized encoded notes without truncating the free message or personalization', async () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: content.venue.personalization.cta }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Mensaje (opcional)')).toHaveValue(content.venue.personalization.inquiry);
    const message = `${content.venue.personalization.inquiry}${'"'.repeat(500)}`;
    fireEvent.change(within(dialog).getByLabelText('Mensaje (opcional)'), { target: { value: message } });
    fillAndSubmit();
    expect(screen.getByText(/superan 1000 caracteres/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Mensaje (opcional)')).toHaveValue(message);
    expect(submit).not.toHaveBeenCalled();
  });
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
      expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent(
        opportunityType === 'VENUE' ? 'Propuesta para tu salón o jardín' : 'Condiciones para Planners y agencias'
      );
      expect(within(dialog).getByLabelText('Mensaje (opcional)')).toHaveValue(notes ?? '');
      fillAndSubmit();
      await screen.findByText(/Recibimos tu solicitud/);
      expect(submit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          opportunityType,
          notes: JSON.stringify({
            contextoPrecioPublico: { sku: 'PHYSICAL_QR', capacidad: '1–50 personas' },
            mensaje: notes ?? ''
          }),
          privacyAccepted: true
        }),
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
    expect(submit.mock.calls[1]![0]).toMatchObject({
      opportunityType: 'PLANNER_AGENCY',
      notes: expect.stringContaining('PHYSICAL_QR')
    });
    expect(submit.mock.calls[1]![0].submissionId).not.toBe(submit.mock.calls[0]![0].submissionId);
  }, 15_000);

  it('renders authoritative prices and never adds monthly Venue plans to the matrix', async () => {
    list.mockResolvedValue(
      publicPricingFixture.map((price, index) => (index === 0 ? { ...price, amountMxnCents: 271900 } : price))
    );
    renderLanding();
    const pricing = within(document.querySelector('#precios')!);
    expect(await pricing.findByText('$2,719 MXN antes de IVA')).toBeInTheDocument();
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
    expect(screen.getByText('Los precios no están disponibles en este momento.')).toBeInTheDocument();
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
  const form = within(screen.getByRole('dialog'));
  fireEvent.change(form.getByLabelText(/Nombre de contacto/), { target: { value: 'María López' } });
  fireEvent.change(form.getByLabelText(/Empresa \/ salón \/ jardín \/ agencia/), {
    target: { value: 'Eventos Aurora' }
  });
  fireEvent.change(form.getByLabelText(/Correo electrónico/), { target: { value: 'maria@example.test' } });
  fireEvent.click(form.getByRole('checkbox'));
  fireEvent.click(form.getByRole('button', { name: 'Enviar solicitud' }));
}
