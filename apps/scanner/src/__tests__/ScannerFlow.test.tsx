import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@invitaciones/api-client';
import { ScannerSessionPage } from '../pages/ScannerSessionPage';

const socketState = vi.hoisted(() => ({
  disconnect: vi.fn(),
  handlers: new Map<string, () => void>()
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn((event: string, handler: () => void) => socketState.handlers.set(event, handler)),
    disconnect: socketState.disconnect
  }))
}));

vi.mock('../components/CameraReader', () => ({
  CameraReader: ({ onScan, paused }: { onScan: (value: string) => void; paused?: boolean }) => (
    <div>
      <span>Cámara preparada</span>
      <button disabled={paused} onClick={() => onScan('qr-valid')}>
        Leer QR válido
      </button>
      <button disabled={paused} onClick={() => onScan('qr-invalid')}>
        Leer QR inválido
      </button>
    </div>
  )
}));

const assistantOne = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Ana Pérez',
  isPrimary: true,
  table: { id: '30000000-0000-4000-8000-000000000001', name: '12' }
};
const assistantTwo = {
  id: '10000000-0000-4000-8000-000000000002',
  name: 'Luis Pérez',
  isPrimary: false,
  table: { id: '30000000-0000-4000-8000-000000000001', name: '12' }
};
const invitation = { id: '20000000-0000-4000-8000-000000000001', mode: 'FAMILY_NOMINAL' as const };
let scanRequests = 0;

const server = setupServer(
  http.get('http://localhost/api/v1/scanner/:token/session', ({ params }) => {
    const token = String(params.token);
    if (token.startsWith('invalid') || token.startsWith('expired') || token.startsWith('revoked')) {
      return HttpResponse.json({ code: 'STAFF_TOKEN_INVALID_OR_EXPIRED', message: 'Invalid.' }, { status: 401 });
    }
    if (token.startsWith('closed') || token.startsWith('cancelled') || token.startsWith('archived')) {
      return HttpResponse.json({ code: 'STAFF_EVENT_NOT_OPERATIONAL', message: 'Not operational.' }, { status: 409 });
    }
    return HttpResponse.json({
      status: 'AVAILABLE',
      staff: { alias: 'Acceso norte' },
      event: {
        id: '40000000-0000-4000-8000-000000000001',
        name: 'Boda M&M',
        status: token.startsWith('active') ? 'ACTIVE' : 'EVENT_DAY',
        eventDateTime: '2026-08-05T20:00:00.000Z',
        timeZone: 'America/Mexico_City',
        floorplanEnabled: token.includes('floorplan')
      }
    });
  }),
  http.post('http://localhost/api/v1/scanner/:token/scan', async ({ request }) => {
    scanRequests += 1;
    const body = await request.json();
    if ((body as { qrToken?: string }).qrToken === 'qr-invalid') {
      return HttpResponse.json({ code: 'SCANNER_QR_NOT_FOUND', message: 'Not found.' }, { status: 404 });
    }
    return HttpResponse.json({
      status: 'AVAILABLE',
      invitation,
      confirmedCount: 2,
      checkedInCount: 0,
      pendingCount: 2,
      pendingAssistants: [assistantOne, assistantTwo]
    });
  }),
  http.post('http://localhost/api/v1/scanner/:token/search', async ({ request }) => {
    const body = await request.json();
    if ((body as { query?: string }).query === 'Nadie') return HttpResponse.json({ status: 'NO_MATCHES', results: [] });
    return HttpResponse.json({
      status: 'MATCHES',
      results: [
        {
          invitation,
          confirmedCount: 2,
          checkedInCount: 0,
          pendingCount: 2,
          pendingAssistants: [assistantOne, assistantTwo]
        }
      ]
    });
  }),
  http.post('http://localhost/api/v1/scanner/:token/check-in', async ({ request }) => {
    const body = (await request.json()) as { assistantIds: string[] };
    const checked = body.assistantIds.map((id) => ({
      ...(id === assistantOne.id ? assistantOne : assistantTwo),
      checkedInAt: '2026-08-05T20:01:00.000Z'
    }));
    const remaining = [assistantOne, assistantTwo].filter((assistant) => !body.assistantIds.includes(assistant.id));
    return HttpResponse.json({
      status: 'CHECKED_IN',
      invitationId: invitation.id,
      checkedIn: checked,
      remainingPendingAssistants: remaining,
      remainingPendingCount: remaining.length
    });
  }),
  http.get('http://localhost/api/v1/scanner/:token/floorplan', () =>
    HttpResponse.json({
      floorplanId: '50000000-0000-4000-8000-000000000001',
      contentPath: '/api/v1/scanner/event-floorplan/floorplan/content',
      shapes: [
        {
          id: assistantOne.table.id,
          name: '12',
          kind: 'TABLE',
          geometry: 'CIRCLE',
          capacity: 8,
          occupancy: 2,
          availableCapacity: 6,
          x: 0.2,
          y: 0.2,
          width: 0.1,
          height: 0.1,
          rotation: 0,
          polygonPoints: null
        }
      ]
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  socketState.disconnect.mockClear();
  socketState.handlers.clear();
  scanRequests = 0;
});
afterAll(() => server.close());

function renderScanner(token: string) {
  const apiClient = createApiClient({ baseUrl: 'http://localhost/api/v1' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/scanner/${token}`]}>
        <Routes>
          <Route
            path="/scanner/:staffToken"
            element={<ScannerSessionPage apiClient={apiClient} apiBaseUrl="http://localhost" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('sesión y bloqueo operativo', () => {
  it.each(['invalid-token', 'expired-token', 'revoked-token'])('bloquea el token %s', async (token) => {
    renderScanner(token);
    expect(await screen.findByText('Token Staff revocado, expirado o inválido.')).toBeInTheDocument();
    expect(screen.queryByText('Cámara preparada')).not.toBeInTheDocument();
  });

  it.each(['closed-token', 'cancelled-token', 'archived-token'])('no monta operación para %s', async (token) => {
    renderScanner(token);
    expect(
      await screen.findByText('El Evento está cerrado, cancelado, archivado o fuera de operación.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it.each([
    ['active-token', 'Evento activo · operativo'],
    ['event-day-token', 'Día del Evento · operativo']
  ])('habilita %s', async (token, label) => {
    renderScanner(token);
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText('Staff: Acceso norte')).toBeInTheDocument();
    expect(screen.getByText('Cámara preparada')).toBeInTheDocument();
  });
});

describe('QR y check-in', () => {
  it('muestra sólo Asistentes pendientes autorizados y nunca teléfonos', async () => {
    const user = userEvent.setup();
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('button', { name: 'Leer QR válido' }));
    expect(await screen.findByText('Ana Pérez · Mesa 12')).toBeInTheDocument();
    expect(screen.getByText('Luis Pérez · Mesa 12')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/tel[eé]fono|555-/i);
  });

  it('muestra error inline para QR inválido', async () => {
    const user = userEvent.setup();
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('button', { name: 'Leer QR inválido' }));
    expect(await screen.findByText('El código QR no es válido para este Evento.')).toBeInTheDocument();
  });

  it('evita lecturas duplicadas mientras la primera está pendiente', async () => {
    server.use(
      http.post('http://localhost/api/v1/scanner/:token/scan', async () => {
        scanRequests += 1;
        await delay(100);
        return HttpResponse.json({
          status: 'NO_PENDING',
          invitation,
          confirmedCount: 2,
          checkedInCount: 2,
          pendingCount: 0,
          pendingAssistants: []
        });
      })
    );
    const user = userEvent.setup();
    renderScanner('event-day-token');
    const button = await screen.findByRole('button', { name: 'Leer QR válido' });
    await user.dblClick(button);
    await screen.findByText(/Todos los Asistentes/);
    expect(scanRequests).toBe(1);
  });

  it('permite selección parcial y confirma el check-in', async () => {
    const user = userEvent.setup();
    let receivedIds: string[] = [];
    server.use(
      http.post('http://localhost/api/v1/scanner/:token/check-in', async ({ request }) => {
        receivedIds = ((await request.json()) as { assistantIds: string[] }).assistantIds;
        return HttpResponse.json({
          status: 'CHECKED_IN',
          invitationId: invitation.id,
          checkedIn: [{ ...assistantOne, checkedInAt: '2026-08-05T20:01:00.000Z' }],
          remainingPendingAssistants: [assistantTwo],
          remainingPendingCount: 1
        });
      })
    );
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('button', { name: 'Leer QR válido' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Luis Pérez · Mesa 12' }));
    await user.click(screen.getByRole('button', { name: 'Registrar ingreso (1)' }));
    expect(await screen.findByText('Ingreso registrado: Ana Pérez.')).toBeInTheDocument();
    expect(receivedIds).toEqual([assistantOne.id]);
  });

  it('impide una selección vacía', async () => {
    const user = userEvent.setup();
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('button', { name: 'Leer QR válido' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Ana Pérez · Mesa 12' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Luis Pérez · Mesa 12' }));
    expect(screen.getByText('Selecciona al menos un Asistente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar ingreso (0)' })).toBeDisabled();
  });

  it('conserva resultado y llave idempotente tras respuesta incierta', async () => {
    const keys: string[] = [];
    let attempt = 0;
    server.use(
      http.post('http://localhost/api/v1/scanner/:token/check-in', async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        attempt += 1;
        if (attempt === 1) return HttpResponse.json({ code: 'TEMPORARY', message: 'Temporary.' }, { status: 503 });
        return HttpResponse.json({
          status: 'CHECKED_IN',
          invitationId: invitation.id,
          checkedIn: [
            { ...assistantOne, checkedInAt: '2026-08-05T20:01:00.000Z' },
            { ...assistantTwo, checkedInAt: '2026-08-05T20:01:00.000Z' }
          ],
          remainingPendingAssistants: [],
          remainingPendingCount: 0
        });
      })
    );
    const user = userEvent.setup();
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('button', { name: 'Leer QR válido' }));
    await user.click(screen.getByRole('button', { name: 'Registrar ingreso (2)' }));
    expect(await screen.findByText(/Conservamos el resultado/)).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez · Mesa 12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar ingreso (2)' }));
    expect(await screen.findByText(/Ingreso registrado/)).toBeInTheDocument();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('búsqueda, Croquis y realtime', () => {
  it('informa búsqueda sin coincidencias', async () => {
    const user = userEvent.setup();
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    await user.type(screen.getByLabelText('Nombre exacto del Contacto o Asistente'), 'Nadie');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No se encontraron coincidencias exactas.')).toBeInTheDocument();
  });

  it('selecciona la respuesta de búsqueda sin convertir invitationId en qrToken', async () => {
    const user = userEvent.setup();
    renderScanner('event-day-token');
    await user.click(await screen.findByRole('tab', { name: 'Buscar' }));
    await user.type(screen.getByLabelText('Nombre exacto del Contacto o Asistente'), 'Ana Pérez');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await user.click(await screen.findByRole('button', { name: /Ana Pérez, Luis Pérez/ }));
    expect(await screen.findByText('Asistentes pendientes')).toBeInTheDocument();
    expect(scanRequests).toBe(0);
  });

  it('muestra el Croquis por la ruta documentada', async () => {
    const user = userEvent.setup();
    renderScanner('event-day-floorplan');
    await user.click(await screen.findByRole('tab', { name: 'Croquis' }));
    const image = await screen.findByRole('img', { name: 'Croquis del recinto del Evento' });
    expect(image).toHaveAttribute('src', 'http://localhost/api/v1/scanner/event-floorplan/floorplan/content');
  });

  it.each([
    [404, 'El Croquis no está disponible.'],
    [500, 'No pudimos confirmar la respuesta. Conservamos el resultado para reintentar con seguridad.']
  ])('muestra estado de Croquis para HTTP %s', async (status, message) => {
    server.use(
      http.get('http://localhost/api/v1/scanner/:token/floorplan', () =>
        HttpResponse.json(
          { code: status === 404 ? 'SCANNER_FLOORPLAN_NOT_AVAILABLE' : 'FAILURE', message: 'Failure.' },
          { status }
        )
      )
    );
    const user = userEvent.setup();
    renderScanner('event-day-floorplan');
    await user.click(await screen.findByRole('tab', { name: 'Croquis' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('desconecta Socket.IO al desmontar', async () => {
    const view = renderScanner('event-day-token');
    await screen.findByText('Cámara preparada');
    view.unmount();
    expect(socketState.disconnect).toHaveBeenCalled();
  });

  it('bloquea inmediatamente al recibir cierre realtime', async () => {
    renderScanner('event-day-token');
    await screen.findByText('Cámara preparada');
    socketState.handlers.get('event.closed')?.();
    expect(
      await screen.findByText('El Evento está cerrado, cancelado, archivado o fuera de operación.')
    ).toBeInTheDocument();
  });
});
