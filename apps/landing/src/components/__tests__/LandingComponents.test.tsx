import { landingContent } from '../../landing-content';
import { LandingHero } from '../LandingHero';
import { LandingServices } from '../LandingServices';
import { LandingSolution } from '../LandingSolution';
import { RegisterPlannerModal } from '../RegisterPlannerModal';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('Landing Components & Content Integration', () => {
  it('has consistent content structure in landingContent', () => {
    expect(landingContent.brand.fullName).toBe('InvitacionesPremium bt Soft-Monky');
    expect(landingContent.urls.login).toContain('/login');
    expect(landingContent.solution.ruleNotice).toBe(
      'Regla de acceso: QR por Invitación; check-in individual por Asistente.'
    );
    expect(landingContent.services.items).toHaveLength(4);
  });

  it('renders LandingHero with title and primary CTA', () => {
    const handleOpenRegister = vi.fn();
    render(
      <AppThemeProvider>
        <LandingHero onOpenRegister={handleOpenRegister} />
      </AppThemeProvider>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Operación digital completa para Eventos privados'
    );

    const registerBtn = screen.getByRole('button', { name: /Registrarme como Planner/i });
    expect(registerBtn).toBeInTheDocument();

    fireEvent.click(registerBtn);
    expect(handleOpenRegister).toHaveBeenCalledTimes(1);
  });

  it('renders LandingSolution displaying the conceptual rule notice', () => {
    render(
      <AppThemeProvider>
        <LandingSolution />
      </AppThemeProvider>
    );

    expect(
      screen.getByText('Regla de acceso: QR por Invitación; check-in individual por Asistente.')
    ).toBeInTheDocument();
  });

  it('renders LandingServices with catalog items and credit rates', () => {
    render(
      <AppThemeProvider>
        <LandingServices />
      </AppThemeProvider>
    );

    expect(screen.getByText('Flipbook')).toBeInTheDocument();
    expect(screen.getByText('Flyer')).toBeInTheDocument();
    expect(screen.getByText('QR Pase Físico')).toBeInTheDocument();
    expect(screen.getByText('30 créditos')).toBeInTheDocument();
  });

  it('handles RegisterPlannerModal validation and API call', async () => {
    const handleClose = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ client: { id: 'client-1' }, user: { id: 'user-1' } })
    } as Response);

    render(
      <AppThemeProvider>
        <RegisterPlannerModal open={true} onClose={handleClose} />
      </AppThemeProvider>
    );

    expect(screen.getByRole('heading', { name: /Registro de Planner/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nombre o Firma del Planner/i);
    const emailInput = screen.getByLabelText(/Correo Electrónico/i);
    const passwordInput = screen.getByLabelText(/Contraseña/i);
    const submitBtn = screen.getByRole('button', { name: /Crear Cuenta de Planner/i });

    fireEvent.change(nameInput, { target: { value: 'Sofía Planners' } });
    fireEvent.change(emailInput, { target: { value: 'sofia@planner.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password12345' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        landingContent.urls.registerPlannerApi,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Sofía Planners',
            email: 'sofia@planner.com',
            password: 'password12345'
          })
        })
      );
    });

    expect(
      await screen.findByText(/¡Registro exitoso! Tu cuenta de Planner independiente ha sido creada correctamente./i)
    ).toBeInTheDocument();

    fetchSpy.mockRestore();
  });
});
