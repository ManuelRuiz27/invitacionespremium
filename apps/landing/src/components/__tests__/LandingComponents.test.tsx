import { App } from '../../App';
import { createLandingConfig, getLandingConfig } from '../../config/landing-config';
import { publicPricingFixture } from '../../test/pricing-fixtures';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LandingCta } from '../LandingCta';
import { LandingHeader } from '../LandingHeader';
import { LandingHero } from '../LandingHero';
import { LandingPricing } from '../LandingPricing';
import { LandingProductProof } from '../LandingProductProof';
import { LandingServices } from '../LandingServices';

vi.mock('../../use-public-pricing', () => ({
  usePublicPricing: () => ({ state: { status: 'unavailable' }, retry: vi.fn() })
}));

const content = getLandingConfig();
const renderWithTheme = (node: ReactNode) => render(<AppThemeProvider>{node}</AppThemeProvider>);

describe('LAND-03B commercial presentation', () => {
  it('publishes the approved information architecture', () => {
    expect(content.nav.map((item) => item.href)).toEqual([
      '#producto',
      '#como-funciona',
      '#servicios',
      '#precios',
      '#planners',
      '#venues',
      '#faq'
    ]);
    renderWithTheme(<App />);
    for (const item of content.nav) expect(document.querySelector(item.href)).toBeInTheDocument();
    expect(document.querySelector('#problema')).toBeNull();
    expect(document.querySelector('#demo')).toBeNull();
  });

  it('uses the approved Hero promise and routes both CTAs', () => {
    document.body.insertAdjacentHTML('beforeend', '<section id="producto"></section><section id="precios"></section>');
    const product = document.getElementById('producto')!;
    const pricing = document.getElementById('precios')!;
    product.scrollIntoView = vi.fn();
    pricing.scrollIntoView = vi.fn();
    renderWithTheme(<LandingHero />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Invitaciones, invitados, Mesas y acceso. Todo conectado.' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver cómo funciona' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver opciones y precios' }));
    expect(product.scrollIntoView).toHaveBeenCalledOnce();
    expect(pricing.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('shows the five product-proof moments with real-image alternatives', () => {
    renderWithTheme(<LandingProductProof />);
    expect(screen.getByRole('heading', { name: 'Así se vive un Evento conectado' })).toBeInTheDocument();
    for (const label of ['Invitación', 'Confirmación', 'Invitados', 'Mesas', 'Acceso'])
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(6);
  });

  it('keeps exactly three contractual paid SKUs', () => {
    expect(content.services.items.map((service) => service.code)).toEqual(['PHYSICAL_QR', 'FLYER', 'FLIPBOOK']);
    renderWithTheme(<LandingServices />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });

  it('renders the authoritative 3 by 3 MXN matrix with credits secondary', () => {
    renderWithTheme(<LandingPricing state={{ status: 'ready', prices: publicPricingFixture }} onRetry={vi.fn()} />);
    for (const price of ['$2,500', '$3,000', '$3,500', '$4,500', '$5,500', '$6,500', '$6,000', '$7,000', '$8,000'])
      expect(screen.getByText(price, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('$1,800 MXN')).not.toBeInTheDocument();
  });

  it('keeps Planner and Venue conversion as distinct lead actions', () => {
    const planner = vi.fn();
    const venue = vi.fn();
    renderWithTheme(<LandingCta onOpenPlanner={planner} onOpenVenue={venue} />);
    fireEvent.click(screen.getByRole('button', { name: content.cta.secondaryCta }));
    fireEvent.click(screen.getByRole('button', { name: content.cta.venueLink }));
    expect(planner).toHaveBeenCalledOnce();
    expect(venue).toHaveBeenCalledOnce();
  });

  it('keeps mobile navigation semantic and complete', () => {
    useMobileMedia();
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    const drawer = screen.getByRole('navigation', { name: 'Navegación principal' });
    for (const item of content.nav) expect(within(drawer).getByText(item.label)).toBeInTheDocument();
  });

  it('disables login safely without a configured Client URL', () => {
    useDesktopMedia();
    renderWithTheme(
      <LandingHeader onOpenRegister={vi.fn()} config={createLandingConfig({}, { development: false })} />
    );
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
