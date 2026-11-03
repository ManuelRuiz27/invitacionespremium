import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type Countdown, type InvitationDesign } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../../test/fixtures';
import { DesignCountdown } from './DesignCountdown';

const initial: InvitationDesign = {
  id: 'design',
  eventId: configuredEvent.id,
  type: 'FLYER',
  flyerInitialAssetId: 'initial-image',
  flyerQrAssetId: 'qr-image',
  pages: [],
  hotspots: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};
beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:countdown') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

function setup() {
  const api = mockApiClient();
  vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image']));
  vi.mocked(api.design.saveCountdown).mockImplementation(async (_event, input) => ({
    ...input,
    id: 'saved',
    revision: 1
  }));
  function Harness() {
    const [design, setDesign] = useState(initial);
    return (
      <AppThemeProvider>
        <DesignCountdown
          apiClient={api}
          event={configuredEvent}
          design={design}
          disabled={false}
          onSaved={(countdown: Countdown | null) => setDesign((current) => ({ ...current, countdown }))}
        />
      </AppThemeProvider>
    );
  }
  return { api, ...render(<Harness />) };
}
async function loadImage() {
  const image = await screen.findByRole('img', { name: 'Flyer' });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 1120 },
    naturalHeight: { configurable: true, value: 1520 }
  });
  fireEvent.load(image);
}

describe('Client countdown persistence adapter', () => {
  it('saves all five colors and background opacity and reopens the saved configuration', async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cuenta regresiva' }));
    await loadImage();
    const palette = { números: '#123456', etiquetas: '#234567', fondo: '#F0E0D0', borde: '#345678', sombra: '#456789' };
    for (const [label, value] of Object.entries(palette))
      fireEvent.change(screen.getByLabelText(`Color de ${label}`), { target: { value } });
    fireEvent.change(screen.getByLabelText('Opacidad (%)'), { target: { value: '64' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.design.saveCountdown).toHaveBeenCalledWith(
        configuredEvent.id,
        expect.objectContaining({
          numberColor: '#123456',
          labelColor: '#234567',
          backgroundColor: '#F0E0D0',
          borderColor: '#345678',
          shadowColor: '#456789',
          backgroundOpacity: 0.64,
          visualOwnerType: 'FLYER',
          flipbookPageId: null,
          revision: 0
        })
      )
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar cuenta regresiva' }));
    expect(screen.getByLabelText('Color de números')).toHaveValue('#123456');
    expect(screen.getByLabelText('Opacidad (%)')).toHaveValue(64);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(api.design.saveCountdown).toHaveBeenLastCalledWith(
        configuredEvent.id,
        expect.objectContaining({ revision: 1 })
      )
    );
    expect(vi.mocked(api.design.saveCountdown).mock.calls.at(-1)![1]).not.toHaveProperty('id');
  });

  it('blocks invalid HEX and preserves the draft after a concurrent edit conflict', async () => {
    const { api } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar cuenta regresiva' }));
    await loadImage();
    fireEvent.change(screen.getByLabelText('Color de números'), { target: { value: '#XYZ' } });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Color de números'), { target: { value: '#abc' } });
    vi.mocked(api.design.saveCountdown).mockRejectedValueOnce(
      new ApiError(409, 'COUNTDOWN_REVISION_CONFLICT', 'Conflict')
    );
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    });
    expect(await screen.findByText(/cambió en otra sesión/)).toBeInTheDocument();
    expect(screen.getByLabelText('Color de números')).toHaveValue('#abc');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });
});
