import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@invitaciones/api-client';
import { ScannerSessionPage } from '../pages/ScannerSessionPage';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), disconnect: vi.fn(), io: { on: vi.fn(), off: vi.fn() } })
}));
vi.mock('../components/CameraReader', () => ({
  CameraReader: ({ onScan, paused }: { onScan: (value: string) => void; paused: boolean }) => (
    <div>
      <span>{paused ? 'Cámara pausada' : 'Cámara lista'}</span>
      <button
        disabled={paused}
        onClick={() => {
          onScan('na1.individual');
          onScan('na1.other-frame');
        }}
      >
        Leer nominal
      </button>
      <button
        disabled={paused}
        onClick={() => {
          onScan('pp1.individual');
          onScan('pp1.other-frame');
        }}
      >
        Leer pase
      </button>
    </div>
  )
}));

const nominal = {
  status: 'CHECKED_IN',
  assistantId: 'assistant-1',
  checkInId: 'checkin-1',
  name: 'Ana',
  checkedInAt: '2026-10-22T20:00:00Z',
  table: { id: 'table-1', name: 'Norte' },
  seat: { id: 'seat-1', label: 'A1', x: 0.2, y: 0.3 }
};
const anonymous = {
  status: 'USED',
  physicalPassId: 'pass-1',
  passNumber: 17,
  usedAt: '2026-10-22T20:00:00Z',
  table: { id: 'table-1', name: 'Norte' }
};
const intents: Array<{ path: string; key: string; body: unknown; credentials: RequestCredentials }> = [];
const server = setupServer(
  http.get('http://localhost/api/v1/scanner/:mode/session', ({ params }) =>
    HttpResponse.json({
      status: 'AVAILABLE',
      staff: { alias: 'Puerta' },
      event: {
        id: 'event-1',
        name: 'Accesos',
        status: 'ACTIVE',
        eventDateTime: '2026-10-22T20:00:00Z',
        timeZone: 'America/Mexico_City',
        floorplanEnabled: false,
        serviceCode: 'ACCESS_CONTROL',
        accessMode: params.mode
      }
    })
  ),
  http.post('http://localhost/api/v1/scanner/:mode/:kind/scan', async ({ request, params }) => {
    intents.push({
      path: params.kind as string,
      key: request.headers.get('Idempotency-Key') ?? '',
      body: await request.json(),
      credentials: request.credentials
    });
    return HttpResponse.json(params.kind === 'nominal-access' ? nominal : anonymous);
  })
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  intents.length = 0;
});
afterAll(() => server.close());

function renderScanner(mode: 'NOMINAL' | 'ANONYMOUS') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/scanner/${mode}`]}>
        <Routes>
          <Route
            path="/scanner/:staffToken"
            element={
              <ScannerSessionPage
                apiClient={createApiClient({ baseUrl: 'http://localhost/api/v1' })}
                realtime={{ serverUrl: 'http://localhost', namespace: '/realtime', path: '/socket.io' }}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Scanner ACCESS_CONTROL', () => {
  it.each([
    ['NOMINAL', 'Leer nominal', 'nominal-access', 'Ingreso registrado: Ana.'],
    ['ANONYMOUS', 'Leer pase', 'physical-passes', 'Pase 17: ingreso registrado.']
  ] as const)(
    'consume %s atómicamente, bloquea frames y oculta búsqueda legacy',
    async (mode, button, path, result) => {
      const user = userEvent.setup();
      renderScanner(mode);
      await user.click(await screen.findByRole('button', { name: button }));
      expect(await screen.findByText(result)).toBeInTheDocument();
      expect(screen.getByText('Mesa Norte')).toBeInTheDocument();
      if (mode === 'NOMINAL') expect(screen.getByText('Lugar A1')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Buscar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Registrar ingreso/ })).not.toBeInTheDocument();
      expect(intents).toHaveLength(1);
      expect(intents[0]).toMatchObject({ path, credentials: 'omit' });
      expect(intents[0]!.key).not.toBe('');
      await user.click(screen.getByRole('button', { name: 'Siguiente escaneo' }));
      await user.click(screen.getByRole('button', { name: button }));
      await screen.findByText(result);
      expect(intents).toHaveLength(2);
      expect(intents[0]!.key).not.toBe(intents[1]!.key);
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'retiene el token y la clave de %s hasta resolver una respuesta incierta',
    async (mode) => {
      const received: Array<{ key: string | null; body: unknown }> = [];
      server.use(
        http.post('http://localhost/api/v1/scanner/:mode/:kind/scan', async ({ request, params }) => {
          received.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
          return received.length === 1
            ? HttpResponse.error()
            : HttpResponse.json(params.kind === 'nominal-access' ? nominal : anonymous);
        })
      );
      const user = userEvent.setup();
      renderScanner(mode);
      await user.click(await screen.findByRole('button', { name: mode === 'NOMINAL' ? 'Leer nominal' : 'Leer pase' }));
      const retry = await screen.findByRole('button', { name: 'Reintentar el mismo ingreso' });
      expect(screen.getByText('Cámara pausada')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Siguiente escaneo' })).not.toBeInTheDocument();
      await user.click(retry);
      await screen.findByRole('button', { name: 'Siguiente escaneo' });
      expect(received).toHaveLength(2);
      expect(received[0]).toEqual(received[1]);
    }
  );

  it.each([
    ['ASSISTANT_ALREADY_CHECKED_IN', 409, 'Este QR ya registró un ingreso.'],
    ['PHYSICAL_PASS_ALREADY_USED', 409, 'Este pase físico ya fue utilizado.'],
    ['SCANNER_QR_NOT_FOUND', 404, 'El código QR no es válido para este Evento.'],
    ['PHYSICAL_PASS_NOT_FOUND', 404, 'El código QR no es válido para este Evento.']
  ] as const)('presenta %s sin filtrar mensajes del servidor', async (code, status, message) => {
    server.use(
      http.post('http://localhost/api/v1/scanner/:mode/:kind/scan', () =>
        HttpResponse.json({ code, message: 'private token staff foreign-event' }, { status })
      )
    );
    renderScanner('NOMINAL');
    await userEvent.click(await screen.findByRole('button', { name: 'Leer nominal' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Cámara pausada')).toBeInTheDocument();
    expect(screen.queryByText(/private token/)).not.toBeInTheDocument();
  });

  it.each(['STAFF_TOKEN_INVALID_OR_EXPIRED', 'STAFF_EVENT_NOT_OPERATIONAL'])(
    'detiene la cámara si %s ocurre durante el scan',
    async (code) => {
      server.use(
        http.post('http://localhost/api/v1/scanner/:mode/:kind/scan', () =>
          HttpResponse.json({ code, message: 'Unavailable' }, { status: 401 })
        )
      );
      renderScanner('NOMINAL');
      await userEvent.click(await screen.findByRole('button', { name: 'Leer nominal' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Leer nominal' })).not.toBeInTheDocument());
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    }
  );
});
