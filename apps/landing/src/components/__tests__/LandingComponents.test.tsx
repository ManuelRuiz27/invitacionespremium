import { App } from '../../App';
import { createLandingConfig, getLandingConfig } from '../../config/landing-config';
import { LandingDemoMock } from '../LandingDemoMock';
import { LandingServices } from '../LandingServices';
import { LandingHeader } from '../LandingHeader';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const content = getLandingConfig();
const renderWithTheme = (node: ReactNode) => render(<AppThemeProvider>{node}</AppThemeProvider>);

describe('Landing commercial content', () => {
  it('uses the exact product identity without a secondary brand', () => {
    const legacyBrand = ['Soft', 'Monky'].join('-');
    expect(content.brand.name).toBe('InvitacionesPremium');
    expect(JSON.stringify(content)).not.toContain(legacyBrand);
  });

  it('contains exactly the four documented services', () => {
    expect(content.services.items.map((service) => service.code)).toEqual(['FLIPBOOK', 'FLYER', 'PHYSICAL_QR', 'DEMO']);
  });

  it('keeps the exact Planner prices', () => {
    expect(content.services.items.map((service) => service.prices.planner)).toEqual([
      { credits: 30, mxn: 600 },
      { credits: 20, mxn: 400 },
      { credits: 15, mxn: 300 },
      { credits: 0, mxn: 0 }
    ]);
  });

  it('keeps the exact Organization prices', () => {
    expect(content.services.items.map((service) => service.prices.organization)).toEqual([
      { credits: 27, mxn: 540 },
      { credits: 17, mxn: 340 },
      { credits: 10, mxn: 200 },
      { credits: 0, mxn: 0 }
    ]);
  });

  it('keeps the confirmed unit credit value and visible limits', () => {
    expect(content.pricing.unitValueMxn).toBe(20);
    expect(content.limits).toEqual({
      contactsPerEvent: 150,
      activeStaffTokensPerEvent: 3,
      albumPhotos: 35,
      albumPublicDays: 30
    });
  });

  it('states the precise Invitation and Assistant access rule', () => {
    const serializedContent = JSON.stringify(content);
    expect(content.solution.ruleNotice).toBe('Regla de acceso: QR por Invitación; check-in individual por Asistente.');
    expect(serializedContent).toContain('QR por Invitación');
    expect(serializedContent).toContain('check-in individual por Asistente');
    for (const forbiddenClaim of ['QR por Asistente', 'QR individual por Asistente', 'un QR para cada Asistente']) {
      expect(serializedContent).not.toContain(forbiddenClaim);
    }
    expect(serializedContent).toContain('un segundo ingreso válido del mismo Asistente queda bloqueado');
    expect(serializedContent).toContain('El segundo ingreso del mismo pase queda bloqueado');
    expect(serializedContent).not.toContain('QR de un solo uso');
  });

  it('states the physical-pass and Organization restrictions', () => {
    const physical = content.services.items.find((service) => service.code === 'PHYSICAL_QR');
    expect(physical?.features.join(' ')).toContain('Sin Contactos, Confirmación de asistencia ni Álbum');
    expect(content.organizations.notice).toContain('no tienen registro público');
    expect(content.organizations.roles[1].description).toContain('No compra créditos ni ve saldo, deuda o línea');
  });

  it('identifies the demo permanently as a backend-free simulation', () => {
    expect(content.demo.disclaimer).toContain('simulación visual');
    expect(content.demo.disclaimer).toContain('no usa backend');
    expect(content.demo.disclaimer).toContain('no crea Eventos');
    expect(content.demo.disclaimer).toContain('no consume créditos');
    expect(content.demo.disclaimer).toContain('no genera accesos reales');
  });

  it('renders all services, including Demo at zero credits', () => {
    renderWithTheme(<LandingServices />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Demo' })).toBeInTheDocument();
    expect(screen.getByText('0 créditos')).toBeInTheDocument();
  });

  it('renders a single h1 and the accessible demo tabs', () => {
    const app = renderWithTheme(<App />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    app.unmount();

    renderWithTheme(<LandingDemoMock />);
    expect(screen.getByRole('tablist', { name: 'Recorrido de la simulación visual' })).toBeInTheDocument();
    expect(screen.getByText(content.demo.disclaimer)).toBeInTheDocument();
    expect(screen.getByText('Domingo 15 de noviembre de 2026 • 18:00 HRS')).toBeInTheDocument();
  });

  it('does not publish localhost URLs in production without explicit configuration', () => {
    const production = createLandingConfig({}, { development: false });
    expect(production.urls).toEqual({
      apiBaseUrl: undefined,
      clientApp: undefined,
      login: undefined,
      publicSite: undefined,
      canonical: undefined,
      ogImage: undefined
    });
  });

  it('opens the mobile navigation with an accessible control', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Abrir menú de navegación' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
  });

  it('closes the mobile navigation with Escape and restores focus', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Abrir menú de navegación' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
