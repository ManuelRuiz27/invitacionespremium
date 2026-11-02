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

vi.mock('../../pricing-client', () => ({ createLandingPricingClient: () => undefined }));

const content = getLandingConfig();
const renderWithTheme = (node: ReactNode) => render(<AppThemeProvider>{node}</AppThemeProvider>);

describe('Managed landing commercial presentation', () => {
  it('uses customer language in visible, accessible and SEO copy without changing service boundaries', () => {
    renderWithTheme(<App />);
    const internalJargon = /\b(?:SKU|bracket|lead|DTO|API|Provider|M-1|RSVP|Scanner|Staff|Venue|PVP)\b/i;
    expect(document.querySelector('main')!.textContent).not.toMatch(internalJargon);
    expect(content.seo.description).not.toMatch(internalJargon);
    for (const element of document.querySelectorAll('[alt], [aria-label]')) {
      expect(element.getAttribute('alt') ?? element.getAttribute('aria-label')).not.toMatch(internalJargon);
    }
    expect(
      within(document.querySelector('#servicios')!).getByText('Sin confirmación pública de asistencia ni álbum')
    ).toBeInTheDocument();
    expect(content.services.items[1].description).toContain('invitación digital personalizada');
    expect(content.services.items[2].description).toContain('invitación digital tipo revista');
    expect(content.services.items[1].features).toContain('Diseño personalizado de dos piezas principales');
    expect(content.services.items[2].features).toContain('Hasta 10 páginas');
  });

  it('publishes working invitation, pricing and Venue navigation without self-service promises', () => {
    expect(content.nav.map((item) => item.href)).toEqual([
      '#servicios',
      '#precios',
      '#venues',
      '#como-funciona',
      '#planners',
      '#faq'
    ]);
    renderWithTheme(<App />);
    for (const item of content.nav) expect(document.querySelector(item.href)).toBeInTheDocument();
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      expect(document.querySelector(link.hash)).toBeInTheDocument();
    }
    expect(screen.queryByText(/Crear cuenta de Planner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Planner Partner/i)).not.toBeInTheDocument();
  });

  it('uses the Managed Hero promise and routes its CTAs to active sections', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<section id="como-funciona"></section><section id="servicios"></section>'
    );
    const venues = document.getElementById('como-funciona')!;
    const services = document.getElementById('servicios')!;
    venues.scrollIntoView = vi.fn();
    services.scrollIntoView = vi.fn();
    renderWithTheme(<LandingHero />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Menos listas dispersas. Más control de tu evento.'
      })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver servicios y precios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cómo funciona' }));
    expect(venues.scrollIntoView).toHaveBeenCalledOnce();
    expect(services.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('shows the five product-proof moments with real-image alternatives', () => {
    renderWithTheme(<LandingProductProof />);
    expect(screen.getByRole('heading', { name: 'Así acompañamos a tus invitados' })).toBeInTheDocument();
    for (const label of [
      'Reciben su invitación',
      'Confirman su asistencia',
      'Organizas la distribución de mesas',
      'Cada invitado recibe su acceso',
      'Tu equipo recibe a cada persona'
    ])
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(6);
  });

  it('keeps the three operational services without promising Reports or Album', () => {
    expect(content.services.items.map((service) => service.code)).toEqual(['PHYSICAL_QR', 'FLYER', 'FLIPBOOK']);
    expect(content.services.items.map((service) => service.name)).toEqual([
      'QR / EventOps',
      'Flyer digital',
      'Flipbook Premium'
    ]);
    renderWithTheme(<LandingServices />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.queryByText(/reporte del evento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/álbum del evento/i)).not.toBeInTheDocument();
  });

  it('offers explicit Planner and Venue conversions without checkout', () => {
    const openCommercial = vi.fn();
    const openVenue = vi.fn();
    renderWithTheme(<LandingCta onOpenCommercial={openCommercial} onOpenVenue={openVenue} />);
    fireEvent.click(screen.getByRole('button', { name: content.cta.primaryCta }));
    expect(openCommercial).toHaveBeenCalledOnce();
    expect(openVenue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: content.cta.secondaryCta }));
    expect(openVenue).toHaveBeenCalledOnce();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  });

  it('keeps mobile navigation semantic and complete', () => {
    useMobileMedia();
    renderWithTheme(<LandingHeader onOpenCommercial={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    const drawer = screen.getByRole('navigation', { name: 'Navegación principal' });
    for (const item of content.nav)
      expect(within(drawer).getByRole('button', { name: item.label })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Elegir cómo contratar' })).toBeInTheDocument();
  });

  it('routes the desktop commercial CTA and disables login safely without a configured Client URL', () => {
    useDesktopMedia();
    const openCommercial = vi.fn();
    renderWithTheme(
      <LandingHeader onOpenCommercial={openCommercial} config={createLandingConfig({}, { development: false })} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Elegir cómo contratar' }));
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
