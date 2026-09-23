import { App } from '../../App';
import { createLandingConfig, getLandingConfig } from '../../config/landing-config';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LandingCta } from '../LandingCta';
import { LandingHeader } from '../LandingHeader';
import { LandingHero } from '../LandingHero';
import { LandingProductProof } from '../LandingProductProof';
import { LandingServices } from '../LandingServices';

const content = getLandingConfig();
const renderWithTheme = (node: ReactNode) => render(<AppThemeProvider>{node}</AppThemeProvider>);

describe('M01 Managed landing presentation', () => {
  it('publishes only the active M01 information architecture', () => {
    expect(content.nav.map((item) => item.href)).toEqual([
      '#producto',
      '#como-funciona',
      '#servicios',
      '#planners',
      '#faq'
    ]);
    renderWithTheme(<App />);
    for (const item of content.nav) expect(document.querySelector(item.href)).toBeInTheDocument();
    expect(document.querySelector('#precios')).toBeNull();
    expect(document.querySelector('#venues')).toBeNull();
    expect(screen.queryByText(/Crear cuenta de Planner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Planner Partner/i)).not.toBeInTheDocument();
  });

  it('uses the Managed Hero promise and routes its CTAs to active sections', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<section id="producto"></section><section id="servicios"></section>'
    );
    const product = document.getElementById('producto')!;
    const services = document.getElementById('servicios')!;
    product.scrollIntoView = vi.fn();
    services.scrollIntoView = vi.fn();
    renderWithTheme(<LandingHero />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Tú organizas el evento. Nosotros preparamos la operación digital.'
      })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver cómo funciona' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conocer los servicios' }));
    expect(product.scrollIntoView).toHaveBeenCalledOnce();
    expect(services.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('shows the five product-proof moments with real-image alternatives', () => {
    renderWithTheme(<LandingProductProof />);
    expect(screen.getByRole('heading', { name: 'Así acompañamos a tus invitados' })).toBeInTheDocument();
    for (const label of [
      'Reciben su invitación',
      'Confirman su asistencia',
      'Organizas el croquis de mesas',
      'Cada invitado recibe su acceso',
      'Tu equipo recibe a cada persona'
    ])
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(6);
  });

  it('keeps the three operational services without promising Reports or Album', () => {
    expect(content.services.items.map((service) => service.code)).toEqual(['PHYSICAL_QR', 'FLYER', 'FLIPBOOK']);
    expect(content.services.items.map((service) => service.name)).toEqual([
      'Gestión de Invitados',
      'Invitación Digital',
      'Invitación Premium'
    ]);
    renderWithTheme(<LandingServices />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.queryByText(/reporte del evento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/álbum del evento/i)).not.toBeInTheDocument();
  });

  it('uses one Managed commercial conversion instead of public pricing, registration or Venue paths', () => {
    const openCommercial = vi.fn();
    renderWithTheme(<LandingCta onOpenCommercial={openCommercial} />);
    fireEvent.click(screen.getByRole('button', { name: content.cta.primaryCta }));
    expect(openCommercial).toHaveBeenCalledOnce();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  });

  it('keeps mobile navigation semantic and complete', () => {
    useMobileMedia();
    renderWithTheme(<LandingHeader onOpenCommercial={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    const drawer = screen.getByRole('navigation', { name: 'Navegación principal' });
    for (const item of content.nav) expect(within(drawer).getByText(item.label)).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: content.cta.primaryCta })).toBeInTheDocument();
  });

  it('routes the desktop commercial CTA and disables login safely without a configured Client URL', () => {
    useDesktopMedia();
    const openCommercial = vi.fn();
    renderWithTheme(
      <LandingHeader onOpenCommercial={openCommercial} config={createLandingConfig({}, { development: false })} />
    );
    fireEvent.click(screen.getByRole('button', { name: content.cta.primaryCta }));
    expect(openCommercial).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
  });
});

function useDesktopMedia() {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

function useMobileMedia() {
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
}
