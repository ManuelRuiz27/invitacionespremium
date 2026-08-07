import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Event } from '@invitaciones/api-client';
import { configuredEvent, mockApiClient, organizationPlanner } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const readyEvent = {
  ...configuredEvent,
  serviceId: 'service-flyer',
  status: 'READY_TO_ACTIVATE' as const,
  confirmationEnabled: true,
  locationUrl: 'https://example.com/mapa',
  giftRegistryUrl: 'https://example.com/regalos'
};
const physicalEvent = { ...configuredEvent, serviceId: 'service-physical', status: 'CONFIGURED' as const };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('integrated Event wizard flows', () => {
  it('shares one in-flight creation promise across real concurrent clicks and unlocks after success', async () => {
    const api = mockApiClient();
    const pending = deferred<Event>();
    vi.mocked(api.events.create).mockReturnValue(pending.promise);
    renderApp(api, '/eventos/nuevo');
    await userEvent.click(await screen.findByRole('combobox', { name: /Servicio/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Flyer/ }));
    const next = screen.getByRole('button', { name: 'Continuar' });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(api.events.create).toHaveBeenCalledTimes(1);
    expect(next).toBeDisabled();
    pending.resolve({ ...configuredEvent, serviceId: 'service-flyer' });
    await waitFor(() => expect(next).not.toBeDisabled());
  });

  it('redirects an incompatible Physical QR URL before mounting digital modules', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(physicalEvent);
    renderApp(api, `/eventos/${physicalEvent.id}/configuracion/contactos`);
    expect(await screen.findByRole('heading', { name: 'Datos del Evento' })).toBeInTheDocument();
    expect(api.contacts.list).not.toHaveBeenCalled();
    expect(api.contacts.groups).not.toHaveBeenCalled();
    expect(api.invitations.list).not.toHaveBeenCalled();
    expect(api.design.get).not.toHaveBeenCalled();
    expect(api.design.readiness).not.toHaveBeenCalled();
    expect(api.design.hotspots).not.toHaveBeenCalled();
  });

  it('uses a fresh key for two intentional equal Physical pass batches', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(physicalEvent);
    let sequence = 0;
    vi.mocked(api.physicalPasses.generate).mockImplementation(async (_eventId, input) => {
      sequence += 1;
      return {
        eventId: physicalEvent.id,
        firstPassNumber: sequence,
        lastPassNumber: sequence,
        generationOperationId: `batch-${sequence}`,
        quantity: input.quantity,
        passes: [],
        table: null
      };
    });
    renderApp(api, `/eventos/${physicalEvent.id}/configuracion/pases`);
    const button = await screen.findByRole('button', { name: 'Generar lote' });
    await userEvent.click(button);
    await waitFor(() => expect(api.physicalPasses.generate).toHaveBeenCalledTimes(1));
    await userEvent.click(button);
    await waitFor(() => expect(api.physicalPasses.generate).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.physicalPasses.generate).mock.calls[0]?.[2]).not.toBe(
      vi.mocked(api.physicalPasses.generate).mock.calls[1]?.[2]
    );
  });

  it('assigns CSV idempotency to each preview and shows every preview row', async () => {
    const api = mockApiClient();
    let previewNumber = 0;
    vi.mocked(api.contacts.preview).mockImplementation(async () => {
      previewNumber += 1;
      return {
        previewId: `00000000-0000-4000-8000-00000000000${previewNumber}`,
        expiresAt: '2027-01-01T00:00:00Z',
        totalRows: 2,
        validRows: 2,
        invalidRows: 0,
        rows: [1, 2].map((row) => ({
          rowNumber: row,
          name: `Persona ${row}`,
          normalizedPhone: `+52550000000${row}`,
          group: null,
          groupId: null,
          groupResolution: 'NONE' as const,
          errors: []
        }))
      };
    });
    vi.mocked(api.contacts.commit).mockResolvedValue({
      createdContacts: 2,
      createdGroups: 0,
      contacts: []
    });
    renderApp(api, `/eventos/${configuredEvent.id}/configuracion/contactos`);
    const input = await screen.findByLabelText('Importar lista');
    const file = new File(['name,phone'], 'uno.csv', { type: 'text/csv' });
    await userEvent.upload(input, file);
    expect(await screen.findByText(/Fila 2: Persona 2/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }));
    await userEvent.upload(input, new File(['x'], 'dos.csv', { type: 'text/csv' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar importación' }));
    expect(api.contacts.commit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.contacts.commit).mock.calls[0]?.[2]).not.toBe(
      vi.mocked(api.contacts.commit).mock.calls[1]?.[2]
    );
  });

  it('preserves a Cancun wall-clock and submits a Tijuana zone change atomically', async () => {
    const supportedZones = vi
      .spyOn(Intl, 'supportedValuesOf')
      .mockReturnValue(['America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'UTC']);
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({
      ...configuredEvent,
      serviceId: 'service-flyer',
      timeZone: 'America/Cancun'
    });
    renderApp(api, `/eventos/${configuredEvent.id}/configuracion/datos`);
    const date = await screen.findByLabelText('Fecha y hora');
    fireEvent.change(date, { target: { value: '2026-01-15T18:30' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Zona horaria' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Tijuana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar zona' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(api.events.update).toHaveBeenCalled());
    expect(vi.mocked(api.events.update).mock.calls.at(-1)?.[1]).toMatchObject({
      timeZone: 'America/Tijuana',
      eventDateTime: '2026-01-16T02:30:00.000Z'
    });
    supportedZones.mockRestore();
  });

  it('keeps an uncertain pass attempt when another planner increases the global maximum', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(physicalEvent);
    const otherPlannerPass = {
      id: 'pass-b',
      eventId: physicalEvent.id,
      passNumber: 20,
      status: 'UNUSED' as const,
      table: null,
      usedAt: null,
      createdAt: '2026-01-01T00:00:00Z'
    };
    vi.mocked(api.physicalPasses.list).mockResolvedValueOnce([]).mockResolvedValue([otherPlannerPass]);
    vi.mocked(api.physicalPasses.generate).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce({
      eventId: physicalEvent.id,
      firstPassNumber: 21,
      lastPassNumber: 21,
      generationOperationId: 'batch-a',
      quantity: 1,
      passes: [],
      table: null
    });
    renderApp(api, `/eventos/${physicalEvent.id}/configuracion/pases`);
    await userEvent.click(await screen.findByRole('button', { name: 'Generar lote' }));
    expect(await screen.findByRole('button', { name: 'Reintentar lote incierto' })).toBeInTheDocument();
    expect(screen.getByText(/No conocemos el resultado/)).toBeInTheDocument();
    const firstCall = vi.mocked(api.physicalPasses.generate).mock.calls[0]!;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar lote incierto' }));
    await waitFor(() => expect(api.physicalPasses.generate).toHaveBeenCalledTimes(2));
    const retryCall = vi.mocked(api.physicalPasses.generate).mock.calls[1]!;
    expect(retryCall[1]).toEqual(firstCall[1]);
    expect(retryCall[2]).toBe(firstCall[2]);
  });

  it('does zero financial requests for an Organization Planner during review', async () => {
    const api = mockApiClient(organizationPlanner);
    vi.mocked(api.events.get).mockResolvedValue(readyEvent);
    renderApp(api, `/eventos/${readyEvent.id}/configuracion/revision`);
    expect(await screen.findByText(/Tu Organización administra el pago/)).toBeInTheDocument();
    expect(api.finance.balance).not.toHaveBeenCalled();
  });

  it('does not query Design for Physical review and keeps activation blocked unless READY', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(physicalEvent);
    renderApp(api, `/eventos/${physicalEvent.id}/configuracion/revision`);
    expect(await screen.findByRole('heading', { name: 'Revisión y activación' })).toBeInTheDocument();
    expect(api.design.readiness).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Activar Evento' })).toBeDisabled();
  });

  it('uses an accessible dialog, blocks double activation and reconciles an uncertain result', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get)
      .mockResolvedValueOnce(readyEvent)
      .mockResolvedValueOnce(readyEvent)
      .mockResolvedValueOnce({ ...readyEvent, status: 'ACTIVE' });
    vi.mocked(api.events.activate).mockRejectedValueOnce(new TypeError('network'));
    renderApp(api, `/eventos/${readyEvent.id}/configuracion/revision`);
    const open = await screen.findByRole('button', { name: 'Activar Evento' });
    await waitFor(() => expect(open).toBeEnabled());
    await userEvent.click(open);
    expect(await screen.findByRole('dialog', { name: 'Confirmar activación' })).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirmar activación' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByText('El evento quedó activado correctamente.')).toBeInTheDocument();
    expect(api.events.activate).toHaveBeenCalledTimes(1);
  });
});
