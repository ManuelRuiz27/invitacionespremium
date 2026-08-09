import type { UpdateEventInput } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStep } from './DataStep';
import { ApiError } from '@invitaciones/api-client';
import { configuredEvent, mockApiClient } from '../../test/fixtures';

const services = [
  { id: 'service-flyer', code: 'FLYER' as const, credits: 5, validFrom: '2026-01-01T00:00:00Z', validUntil: null },
  { id: 'service-flipbook', code: 'FLIPBOOK' as const, credits: 7, validFrom: '2026-01-01T00:00:00Z', validUntil: null }
];
const draft = (eventDateTime: string, timeZone = 'America/Cancun'): UpdateEventInput => ({
  confirmationEnabled: false,
  floorplanEnabled: false,
  eventDateTime,
  timeZone
});
const view = (value: UpdateEventInput, onChange = vi.fn()) =>
  render(
    <AppThemeProvider>
      <DataStep services={services} draft={value} disabled={false} onChange={onChange} />
    </AppThemeProvider>
  );
const chooseZone = async (zone: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Zona horaria' }));
  const label = zone === 'America/Tijuana' ? 'Tijuana' : zone;
  fireEvent.click(await screen.findByRole('option', { name: label }));
};

describe('DataStep time zones', () => {
  beforeEach(() =>
    vi
      .spyOn(Intl, 'supportedValuesOf')
      .mockReturnValue(['America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'UTC'])
  );
  afterEach(() => vi.restoreAllMocks());

  it('shows commercial service names and event types in Spanish without technical formats', async () => {
    view({ ...draft('2026-01-15T23:30:00.000Z'), serviceId: 'service-flyer', socialType: 'WEDDING' });

    expect(screen.getByText('Flyer · 5 créditos')).toBeInTheDocument();
    expect(screen.queryByText('FLYER')).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de evento' }));
    expect(await screen.findByRole('option', { name: 'Boda' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'XV años' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Corporativo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cumpleaños' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Otro' })).toBeInTheDocument();
    expect(screen.queryByText('WEDDING')).not.toBeInTheDocument();
    expect(screen.queryByText('Zona horaria IANA')).not.toBeInTheDocument();
  });

  it('submits zone and instant atomically and preserves the wall clock after an authoritative reload', async () => {
    const onChange = vi.fn();
    const rendered = view(draft('2026-01-15T23:30:00.000Z'), onChange);
    expect(screen.getByLabelText('Fecha y hora')).toHaveValue('2026-01-15T18:30');
    await chooseZone('America/Tijuana');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar zona' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      timeZone: 'America/Tijuana',
      eventDateTime: '2026-01-16T02:30:00.000Z'
    });

    rendered.rerender(
      <AppThemeProvider>
        <DataStep
          services={services}
          draft={draft('2026-01-16T02:30:00.000Z', 'America/Tijuana')}
          disabled={false}
          onChange={onChange}
        />
      </AppThemeProvider>
    );
    expect(screen.getByLabelText('Fecha y hora')).toHaveValue('2026-01-15T18:30');
  });

  it.each([
    ['2026-03-08T02:30', 'no existe'],
    ['2026-11-01T01:30', 'ambigua']
  ])('keeps the dialog open and the draft unchanged for %s', async (wallClock, message) => {
    const onChange = vi.fn();
    view(draft('2026-01-15T23:30:00.000Z'), onChange);
    fireEvent.change(screen.getByLabelText('Fecha y hora'), { target: { value: wallClock } });
    onChange.mockClear();
    await chooseZone('America/Tijuana');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar zona' }));
    expect(screen.getByRole('dialog', { name: 'Cambiar zona horaria' })).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(message, 'i')).length).toBeGreaterThan(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a zone change without changing the draft', async () => {
    const onChange = vi.fn();
    view(draft('2026-01-15T23:30:00.000Z'), onChange);
    await chooseZone('America/Tijuana');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('DataStep digital service reset confirmation', () => {
  it.each([
    ['service-flyer', 'service-flipbook', 'FLYER'],
    ['service-flipbook', 'service-flyer', 'FLIPBOOK']
  ])('confirms %s to %s and resets only the invitation design', async (currentId, targetId, designType) => {
    const api = mockApiClient();
    vi.mocked(api.design.get).mockResolvedValue({
      id: 'design-1',
      eventId: configuredEvent.id,
      type: designType as 'FLYER' | 'FLIPBOOK',
      flyerInitialAssetId: null,
      flyerQrAssetId: null,
      pages: [],
      hotspots: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    });
    const onChange = vi.fn();
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(
      <AppThemeProvider>
        <DataStep
          services={services}
          draft={{ ...draft('2026-01-15T23:30:00.000Z'), serviceId: currentId }}
          disabled={false}
          onChange={onChange}
          apiClient={api}
          event={{ ...configuredEvent, serviceId: currentId }}
          onResetInvitationDesign={onReset}
        />
      </AppThemeProvider>
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Servicio' }));
    fireEvent.click(
      await screen.findByRole('option', { name: new RegExp(targetId.includes('flipbook') ? 'Flipbook' : 'Flyer') })
    );
    expect(await screen.findByRole('dialog', { name: 'Cambiar el formato de la invitación' })).toBeInTheDocument();
    expect(screen.getByText(/contactos, invitaciones, confirmaciones, mesas/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar diseño y cambiar' }));
    await waitFor(() => expect(onReset).toHaveBeenCalledWith(targetId));
  });

  it('does not treat a design read failure as absence and exposes retry', async () => {
    const api = mockApiClient();
    vi.mocked(api.design.get).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    const onChange = vi.fn();
    render(
      <AppThemeProvider>
        <DataStep
          services={services}
          draft={{ ...draft('2026-01-15T23:30:00.000Z'), serviceId: 'service-flyer' }}
          disabled={false}
          onChange={onChange}
          apiClient={api}
          event={{ ...configuredEvent, serviceId: 'service-flyer' }}
          onResetInvitationDesign={vi.fn()}
        />
      </AppThemeProvider>
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Servicio' }));
    fireEvent.click(await screen.findByRole('option', { name: /Flipbook/ }));
    expect(await screen.findByText(/No pudimos verificar el diseño actual/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
