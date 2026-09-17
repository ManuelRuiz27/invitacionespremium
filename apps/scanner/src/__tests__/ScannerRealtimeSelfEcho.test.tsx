import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@invitaciones/api-client';
import { ScannerSessionPage } from '../pages/ScannerSessionPage';

const socketState = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  disconnect: vi.fn()
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn((event: string, handler: () => void) => socketState.handlers.set(event, handler)),
    disconnect: socketState.disconnect,
    io: { on: vi.fn(), off: vi.fn() }
  }))
}));

vi.mock('../components/CameraReader', () => ({
  CameraReader: ({ onScan }: { onScan: (value: string) => void }) => (
    <button onClick={() => onScan('qr-valid')}>Leer QR válido</button>
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
const checkInResponse = {
  status: 'CHECKED_IN' as const,
  invitationId: invitation.id,
  checkedIn: [
    {
      assistantId: assistantOne.id,
      checkInId: '60000000-0000-4000-8000-000000000001',
      name: assistantOne.name,
      table: assistantOne.table,
      checkedInAt: '2026-08-05T20:01:00.000Z'
    },
    {
      assistantId: assistantTwo.id,
      checkInId: '60000000-0000-4000-8000-000000000002',
      name: assistantTwo.name,
      table: assistantTwo.table,
      checkedInAt: '2026-08-05T20:01:00.000Z'
    }
  ],
  remainingPendingAssistants: [],
  remainingPendingCount: 0
};

const server = setupServer(
  http.get('http://localhost/api/v1/scanner/:token/session', () =>
    HttpResponse.json({
      status: 'AVAILABLE',
      staff: { alias: 'Acceso norte' },
      event: {
        id: '40000000-0000-4000-8000-000000000001',
        name: 'Boda M&M',
        status: 'EVENT_DAY',
        eventDateTime: '2026-08-05T20:00:00.000Z',
        timeZone: 'America/Mexico_City',
        floorplanEnabled: false
      }
    })
  ),
  http.post('http://localhost/api/v1/scanner/:token/scan', () =>
    HttpResponse.json({
      status: 'AVAILABLE',
      invitation,
      confirmedCount: 2,
      checkedInCount: 0,
      pendingCount: 2,
      pendingAssistants: [assistantOne, assistantTwo]
    })
  ),
  http.post('http://localhost/api/v1/scanner/:token/check-in', () => HttpResponse.json(checkInResponse))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  socketState.handlers.clear();
  socketState.disconnect.mockClear();
});
afterAll(() => server.close());

function renderScanner() {
  const apiClient = createApiClient({ baseUrl: 'http://localhost/api/v1' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/scanner/event-day-token']}>
        <Routes>
          <Route
            path="/scanner/:staffToken"
            element={
              <ScannerSessionPage
                apiClient={apiClient}
                apiBaseUrl="http://localhost"
                realtime={{ serverUrl: 'http://realtime.local', namespace: '/realtime', path: '/socket.io' }}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Scanner realtime self echo', () => {
  it('conserva la confirmación local cuando checkin.created llega después del HTTP 200', async () => {
    const user = userEvent.setup();
    renderScanner();

    await user.click(await screen.findByRole('button', { name: 'Leer QR válido' }));
    await user.click(await screen.findByRole('button', { name: 'Registrar ingreso (2)' }));
    expect(await screen.findByText('Ingreso registrado: Ana Pérez, Luis Pérez.')).toBeInTheDocument();

    act(() => socketState.handlers.get('checkin.created')?.());

    expect(screen.getByText('Ingreso registrado: Ana Pérez, Luis Pérez.')).toBeInTheDocument();
    expect(screen.queryByText('La disponibilidad cambió. Escanea o busca nuevamente.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente escaneo' })).toBeInTheDocument();
  });

  it('conserva el resultado cuando checkin.created llega antes del HTTP 200', async () => {
    let requestStarted = false;
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    server.use(
      http.post('http://localhost/api/v1/scanner/:token/check-in', async () => {
        requestStarted = true;
        await responseGate;
        return HttpResponse.json(checkInResponse);
      })
    );

    const user = userEvent.setup();
    renderScanner();

    await user.click(await screen.findByRole('button', { name: 'Leer QR válido' }));
    await user.click(await screen.findByRole('button', { name: 'Registrar ingreso (2)' }));
    await waitFor(() => expect(requestStarted).toBe(true));

    act(() => socketState.handlers.get('checkin.created')?.());

    expect(screen.queryByText('La disponibilidad cambió. Escanea o busca nuevamente.')).not.toBeInTheDocument();
    expect(screen.getByText('Asistentes pendientes')).toBeInTheDocument();

    releaseResponse?.();

    expect(await screen.findByText('Ingreso registrado: Ana Pérez, Luis Pérez.')).toBeInTheDocument();
    expect(screen.queryByText('La disponibilidad cambió. Escanea o busca nuevamente.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente escaneo' })).toBeInTheDocument();
  });
});
