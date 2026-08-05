import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ScannerSessionPage } from '../pages/ScannerSessionPage';
import { createApiClient, type ApiClient } from '@invitaciones/api-client';

// Mock getUserMedia
Object.defineProperty(window.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    })
  }
});

const server = setupServer(
  http.get('*/api/v1/scanner/valid-token/session', () => {
    return HttpResponse.json({
      staff: { name: 'Staff User', role: 'PLANNER' },
      event: { name: 'Boda M&M', status: 'EVENT_DAY' }
    });
  }),
  http.get('*/api/v1/scanner/invalid-token/session', () => {
    return new HttpResponse(null, { status: 401 });
  }),
  http.get('*/api/v1/scanner/closed-event/session', () => {
    return HttpResponse.json({
      staff: { name: 'Staff User', role: 'PLANNER' },
      event: { name: 'Boda M&M', status: 'CLOSED' }
    });
  }),
  http.post('*/api/v1/scanner/valid-token/scan', () => {
    return HttpResponse.json({
      status: 'AVAILABLE',
      invitation: { id: 'inv-1', name: 'Familia Perez' },
      pendingAssistants: [
        { id: 'ast-1', name: 'Juan Perez' },
        { id: 'ast-2', name: 'Maria Perez' }
      ]
    });
  }),
  http.post('*/api/v1/scanner/valid-token/check-in', () => {
    return HttpResponse.json({
      status: 'CHECKED_IN',
      invitationId: 'inv-1',
      checkedIn: [{ id: 'ast-1', name: 'Juan Perez', checkedInAt: new Date().toISOString() }],
      remainingPendingAssistants: [],
      remainingPendingCount: 0
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function renderWithProviders(token: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  
  const apiClient = createApiClient({ baseUrl: 'http://localhost' }) as unknown as Record<string, unknown>;
  apiClient.scanner = {
    getSession: async (t: string) => {
      const res = await fetch(`http://localhost/api/v1/scanner/${t}/session`);
      if (!res.ok) throw { status: res.status };
      return res.json();
    },
    scan: async (t: string, _body: unknown) => {
      const res = await fetch(`http://localhost/api/v1/scanner/${t}/scan`, { method: 'POST' });
      if (!res.ok) throw { status: res.status };
      return res.json();
    },
    checkIn: async (t: string, _body: unknown) => {
      const res = await fetch(`http://localhost/api/v1/scanner/${t}/check-in`, { method: 'POST' });
      if (!res.ok) throw { status: res.status };
      return res.json();
    }
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/scanner/${token}`]}>
        <Routes>
          <Route path="/scanner/:staffToken" element={<ScannerSessionPage apiClient={apiClient as unknown as ApiClient} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ScannerFlow', () => {
  it('muestra error 401 si el token es invalido', async () => {
    renderWithProviders('invalid-token');
    expect(await screen.findByText('Token revocado, expirado o inválido.')).toBeInTheDocument();
  });

  it('muestra advertencia si el evento esta cerrado', async () => {
    renderWithProviders('closed-event');
    expect(await screen.findByText(/El evento está cerrado/)).toBeInTheDocument();
  });

  it('carga la sesion y levanta camara con token valido', async () => {
    renderWithProviders('valid-token');
    expect(await screen.findByText('Boda M&M')).toBeInTheDocument();
    expect(screen.getByText('Staff: Staff User (PLANNER)')).toBeInTheDocument();
    // Video element from CameraReader
    expect(document.querySelector('video')).toBeInTheDocument();
  });
});
