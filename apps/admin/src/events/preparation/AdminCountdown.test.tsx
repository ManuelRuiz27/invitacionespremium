import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminInvitationDesign, Countdown } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { beforeEach, expect, it, vi } from 'vitest';
import { adminEvent, mockAdminApi } from '../../test/fixtures';
import { AdminCountdown } from './AdminCountdown';

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:provider-countdown') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

it('Provider saves through explicit Admin ownership and retains configuration after save', async () => {
  const api = mockAdminApi();
  vi.mocked(api.adminEventPreparation.invitationAssetContent).mockResolvedValue(new Blob(['image']));
  vi.mocked(api.adminEventPreparation.saveCountdown).mockImplementation(async (_client, _event, input) => ({
    ...input,
    id: 'saved',
    revision: 1
  }));
  function Harness() {
    const [design, setDesign] = useState<AdminInvitationDesign>({
      id: 'design',
      eventId: adminEvent.id,
      type: 'FLYER',
      flyerInitialAssetId: 'asset',
      flyerQrAssetId: 'qr-asset',
      pages: [],
      hotspots: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    });
    return (
      <AppThemeProvider>
        <AdminCountdown
          apiClient={api}
          event={adminEvent}
          design={design}
          disabled={false}
          onSaved={(countdown: Countdown | null) => setDesign((current) => ({ ...current, countdown }))}
        />
      </AppThemeProvider>
    );
  }
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'Agregar cuenta regresiva' }));
  const image = await screen.findByRole('img', { name: 'Flyer' });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 1120 },
    naturalHeight: { configurable: true, value: 1520 }
  });
  fireEvent.load(image);
  fireEvent.change(screen.getByLabelText('Color de fondo'), { target: { value: '#abc' } });
  fireEvent.change(screen.getByLabelText('Opacidad (%)'), { target: { value: '70' } });
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() =>
    expect(api.adminEventPreparation.saveCountdown).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      expect.objectContaining({ backgroundColor: '#AABBCC', backgroundOpacity: 0.7, revision: 0 })
    )
  );
  expect(api.design.saveCountdown).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Editar cuenta regresiva' }));
  expect(screen.getByLabelText('Color de fondo')).toHaveValue('#AABBCC');
  expect(screen.getByLabelText('Opacidad (%)')).toHaveValue(70);
});
