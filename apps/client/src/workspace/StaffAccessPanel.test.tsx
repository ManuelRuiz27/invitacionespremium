import type { CreatedStaffToken, StaffToken } from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { activeEvent, mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const scannerAppUrl = 'http://localhost:5175';
const token = `st1.${'A'.repeat(43)}`;
const activeAccess = {
  id: '11111111-1111-4111-8111-111111111111',
  eventId: activeEvent.id,
  alias: 'Puerta principal',
  state: 'ACTIVE',
  createdAt: '2026-08-24T18:00:00.000Z',
  expiredAt: null
} satisfies StaffToken;
const expiredAccess = {
  ...activeAccess,
  id: '33333333-3333-4333-8333-333333333333',
  alias: 'Acceso anterior',
  state: 'EXPIRED',
  expiredAt: '2026-08-24T19:00:00.000Z'
} satisfies StaffToken;
const createdAccess = {
  ...activeAccess,
  token,
  sessionPath: `/api/v1/scanner/${token}/session`
} satisfies CreatedStaffToken;

describe('Planner Staff access workspace', () => {
  it('muestra Staff sólo como sección operativa y lista accesos sin secretos', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(activeEvent);
    vi.mocked(api.staffTokens.list).mockResolvedValue([activeAccess, expiredAccess]);
    renderApp(api, `/eventos/${activeEvent.id}?seccion=staff`, undefined, scannerAppUrl);

    expect(await screen.findByRole('heading', { name: 'Staff', level: 2 })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(navigation).getByRole('link', { name: 'Staff', current: 'page' })).toBeInTheDocument();
    expect(screen.getByText('Puerta principal')).toBeInTheDocument();
    expect(screen.getByText('Acceso anterior')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 accesos activos')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
  });

  it('crea una sola vez, muestra el secreto en memoria y deriva la URL Scanner configurable', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(activeEvent);
    vi.mocked(api.staffTokens.list).mockResolvedValueOnce([]).mockResolvedValue([activeAccess]);
    vi.mocked(api.staffTokens.create).mockResolvedValue(createdAccess);
    const user = userEvent.setup();
    const first = renderApp(api, `/eventos/${activeEvent.id}?seccion=staff`, undefined, scannerAppUrl);

    await user.type(await screen.findByLabelText('Alias del acceso'), 'Puerta principal');
    await user.click(screen.getByRole('button', { name: 'Crear acceso' }));

    await waitFor(() => expect(api.staffTokens.create).toHaveBeenCalledTimes(1));
    expect(api.staffTokens.create).toHaveBeenCalledWith(activeEvent.id, { alias: 'Puerta principal' });
    expect(await screen.findByDisplayValue(token)).toBeInTheDocument();
    const scannerUrl = `${scannerAppUrl}/scanner/${encodeURIComponent(token)}`;
    expect(screen.getByDisplayValue(scannerUrl)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Scanner' })).toHaveAttribute('href', scannerUrl);

    first.unmount();
    renderApp(api, `/eventos/${activeEvent.id}?seccion=staff`, undefined, scannerAppUrl);
    await screen.findByText('Puerta principal');
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
  });

  it('bloquea una cuarta creación cuando ya existen tres accesos activos', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(activeEvent);
    vi.mocked(api.staffTokens.list).mockResolvedValue([
      activeAccess,
      { ...activeAccess, id: '44444444-4444-4444-8444-444444444444', alias: 'Puerta 2' },
      { ...activeAccess, id: '55555555-5555-4555-8555-555555555555', alias: 'Puerta 3' }
    ]);
    renderApp(api, `/eventos/${activeEvent.id}?seccion=staff`, undefined, scannerAppUrl);

    expect(await screen.findByText('3 de 3 accesos activos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear acceso' })).toBeDisabled();
    expect(api.staffTokens.create).not.toHaveBeenCalled();
  });

  it('no reintenta un POST incierto y reconcilia por GET sin fingir que puede recuperar el secreto', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(activeEvent);
    vi.mocked(api.staffTokens.list).mockResolvedValueOnce([]).mockResolvedValue([activeAccess]);
    vi.mocked(api.staffTokens.create).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderApp(api, `/eventos/${activeEvent.id}?seccion=staff`, undefined, scannerAppUrl);

    await user.type(await screen.findByLabelText('Alias del acceso'), 'Puerta principal');
    await user.click(screen.getByRole('button', { name: 'Crear acceso' }));

    expect(
      await screen.findByText(/No pudimos confirmar si el acceso fue creado\. Actualizamos la lista/u)
    ).toBeInTheDocument();
    expect(api.staffTokens.create).toHaveBeenCalledTimes(1);
    expect(api.staffTokens.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
  });

  it('oculta Staff cuando el Evento ya no está operativo', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...activeEvent, status: 'CLOSED' });
    renderApp(api, `/eventos/${activeEvent.id}`, undefined, scannerAppUrl);

    const navigation = await screen.findByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(navigation).queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
    expect(api.staffTokens.list).not.toHaveBeenCalled();
  });
});
