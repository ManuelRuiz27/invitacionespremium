import { App } from '../../App';
import { createLandingConfig, getLandingConfig } from '../../config/landing-config';
import { publicPricingFixture } from '../../test/pricing-fixtures';
import { landingTokens } from '../../theme/landing-theme';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LandingCta } from '../LandingCta';
import { LandingDemoMock } from '../LandingDemoMock';
import { LandingHeader } from '../LandingHeader';
import { LandingHero } from '../LandingHero';
import { LandingPlanners } from '../LandingPlanners';
import { LandingPricing } from '../LandingPricing';
import { LandingServices } from '../LandingServices';
import { LandingSolution } from '../LandingSolution';
import { LandingVenue } from '../LandingVenue';

vi.mock('../../use-public-pricing', () => ({
  usePublicPricing: () => ({ state: { status: 'unavailable' }, retry: () => undefined })
}));

const content = getLandingConfig();
const renderWithTheme = (node: ReactNode) => render(<AppThemeProvider>{node}</AppThemeProvider>);

describe('LAND-01 commercial contract', () => {
  it('publishes exactly three paid SKUs and keeps Demo outside the offer', () => {
    expect(content.services.items.map((service) => service.code)).toEqual(['PHYSICAL_QR', 'FLYER', 'FLIPBOOK']);
    expect(JSON.stringify(content.services.items)).not.toContain('DEMO');
    expect(content.demo.disclaimer).toContain('no es un servicio');
    for (const service of content.services.items) expect(service).not.toHaveProperty('prices');
  });

  it('contains the exact SKU boundaries and design scope', () => {
    const physical = content.services.items.find((service) => service.code === 'PHYSICAL_QR')!;
    const flyer = content.services.items.find((service) => service.code === 'FLYER')!;
    const flipbook = content.services.items.find((service) => service.code === 'FLIPBOOK')!;
    expect(physical.features).toContain('Sin RSVP público digital');
    expect(physical.features).toContain('Sin Álbum');
    expect(flyer.features.join(' ')).toMatch(/Dos piezas principales/i);
    expect(flyer.features.join(' ')).toMatch(/dos rondas consolidadas/i);
    expect(flipbook.features.join(' ')).toMatch(/Hasta 10 páginas/i);
    expect(flipbook.features.join(' ')).toMatch(/dos rondas consolidadas/i);
  });

  it('removes historical client-type pricing and SaaS positioning from production config', () => {
    const serialized = JSON.stringify(content);
    expect(content.pricing).toEqual({
      title: 'Precio estándar por SKU y capacidad',
      subtitle: 'Consulta el PVP vigente para Eventos de hasta 50, 100 o 150 personas.',
      note: 'Los precios en MXN provienen del Price Book público vigente; los créditos se muestran como referencia secundaria.'
    });
    expect(serialized).not.toContain('Plataforma SaaS');
    expect(serialized).not.toContain('Planner independiente vs');
    expect(serialized).not.toContain('"planner":{"title"');
    expect(serialized).not.toContain('"organization":{"title"');
    expect(serialized).not.toContain('$600');
    expect(serialized).not.toContain('$400');
    expect(serialized).not.toContain('$300');
  });

  it('distinguishes Planner registration from Partner conditions and Venue conversion', () => {
    expect(content.planners.notice).toContain('no garantiza una tarifa Partner');
    expect(content.planners.commercialCta).not.toBe(content.planners.registerCta);
    expect(content.venue.notice).toContain('siguiente paso');
    expect(JSON.stringify(content.venue)).not.toContain('Organization Admin');
    expect(JSON.stringify(content.venue)).not.toContain('$1,800');
  });

  it('retains limits and the secondary credit explanation in FAQ', () => {
    expect(content.limits.contactsPerEvent).toBe(150);
    expect(content.limits.activeStaffTokensPerEvent).toBe(3);
    expect(content.faq.items.find((item) => item.question === '¿Qué es un crédito?')?.answer).toContain(
      'Un crédito equivale a $20 MXN'
    );
  });
});

describe('public pricing presentation', () => {
  it('renders the authoritative 3 by 3 MXN matrix with credits secondary', () => {
    renderWithTheme(<LandingPricing state={{ status: 'ready', prices: publicPricingFixture }} onRetry={vi.fn()} />);
    for (const price of ['$2,500', '$3,000', '$3,500', '$4,500', '$5,500', '$6,500', '$6,000', '$7,000', '$8,000']) {
      expect(screen.getByText(price, { exact: false })).toBeInTheDocument();
    }
    for (const credits of [125, 150, 175, 225, 275, 325, 300, 350, 400]) {
      expect(screen.getByText(`${credits} créditos`)).toBeInTheDocument();
    }
    expect(document.querySelector('[data-client-type]')).toBeNull();
    expect(screen.queryByText('Planner independiente')).not.toBeInTheDocument();
    expect(screen.queryByText('Organización')).not.toBeInTheDocument();
    expect(screen.queryByText('$600 MXN')).not.toBeInTheDocument();
  });

  it('shows loading and unavailable states without numeric fallback', () => {
    const view = renderWithTheme(<LandingPricing state={{ status: 'loading' }} onRetry={vi.fn()} />);
    expect(screen.getByLabelText('Consultando precios públicos')).toBeInTheDocument();
    view.rerender(wrapper(<LandingPricing state={{ status: 'unavailable' }} onRetry={vi.fn()} />));
    expect(screen.getByText('Los precios no están disponibles en este entorno.')).toBeInTheDocument();
    expect(document.querySelector('[data-service-code]')).toBeNull();
  });

  it('offers a manual retry on request errors without showing stale prices', () => {
    const retry = vi.fn();
    renderWithTheme(<LandingPricing state={{ status: 'error' }} onRetry={retry} />);
    expect(screen.getByText('No pudimos consultar los precios en este momento.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-service-code]')).toBeNull();
  });

  it('rejects an incomplete matrix instead of rendering a partial offer', () => {
    renderWithTheme(
      <LandingPricing state={{ status: 'ready', prices: publicPricingFixture.slice(0, -1) }} onRetry={vi.fn()} />
    );
    expect(screen.getByText('Los precios públicos están temporalmente no disponibles.')).toBeInTheDocument();
    expect(document.querySelector('[data-service-code]')).toBeNull();
  });
});

describe('navigation, channels and accessibility', () => {
  it('uses the contractual navigation and existing sections', () => {
    expect(content.nav.map((item) => item.href)).toEqual([
      '#servicios',
      '#precios',
      '#planners',
      '#venues',
      '#demo',
      '#faq'
    ]);
    renderWithTheme(<App />);
    for (const item of content.nav) expect(document.querySelector(item.href)).toBeInTheDocument();
  });

  it('keeps a single h1 and sends Hero actions to pricing and Planners', () => {
    const prices = document.createElement('section');
    prices.id = 'precios';
    const planners = document.createElement('section');
    planners.id = 'planners';
    document.body.append(prices, planners);
    const priceScroll = vi.fn();
    const plannerScroll = vi.fn();
    prices.scrollIntoView = priceScroll;
    planners.scrollIntoView = plannerScroll;
    renderWithTheme(<LandingHero />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ver precios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Para Planners y agencias' }));
    expect(priceScroll).toHaveBeenCalledOnce();
    expect(plannerScroll).toHaveBeenCalledOnce();
  });

  it('keeps login and Planner account creation as distinct header actions', () => {
    useDesktopMedia();
    const openRegister = vi.fn();
    renderWithTheme(<LandingHeader onOpenRegister={openRegister} />);
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta de Planner' }));
    expect(openRegister).toHaveBeenCalledOnce();
  });

  it('preserves mobile drawer semantics, actions and focus restoration', async () => {
    useMobileMedia();
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Abrir menú de navegación' });
    fireEvent.click(trigger);
    const drawer = screen.getByRole('navigation', { name: 'Navegación principal' });
    for (const item of content.nav) expect(within(drawer).getByText(item.label)).toBeInTheDocument();
    expect(within(drawer).getByText('Crear cuenta de Planner')).toBeInTheDocument();
    expect(within(drawer).getByText('Iniciar sesión')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('shows two distinct Planner actions while Venue never opens registration', () => {
    const register = vi.fn();
    renderWithTheme(<LandingPlanners onOpenRegister={register} />);
    expect(screen.getByText(/registro de cuenta no garantiza/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: content.planners.registerCta }));
    expect(register).toHaveBeenCalledOnce();

    renderWithTheme(<LandingVenue />);
    expect(screen.getByText(content.venue.cta)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: content.venue.cta })).not.toBeInTheDocument();
  });

  it('preserves section heading relationships and the existing visual system', () => {
    renderWithTheme(<LandingServices />);
    const section = document.getElementById('servicios');
    const heading = screen.getByRole('heading', { level: 2 });
    expect(section).toHaveAttribute('aria-labelledby', heading.id);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(heading).toHaveStyle({ color: landingTokens.colors.light.text });
  });

  it('keeps Demo a lazy visual walkthrough after Venue and before FAQ', async () => {
    renderWithTheme(<App />);
    await screen.findByRole('heading', { name: content.demo.title });
    const main = document.getElementById('main-content')!;
    const ids = Array.from(main.children)
      .map((element) => element.id)
      .filter(Boolean);
    expect(ids).toEqual(['problema', 'solucion', 'servicios', 'precios', 'planners', 'venues', 'demo', 'faq']);
  });

  it('keeps Demo copy scoped to digital SKUs', () => {
    renderWithTheme(<LandingDemoMock />);
    expect(screen.getByText(/simulación de Flyer o Flipbook/i)).toBeInTheDocument();
    expect(screen.queryByText(/QR \/ EventOps.*RSVP/i)).not.toBeInTheDocument();
  });

  it('keeps Solution operator-led and the final CTA channel-aware', () => {
    renderWithTheme(<LandingSolution />);
    expect(screen.getByText(/InvitacionesPremium configura el Evento/i)).toBeInTheDocument();
    expect(screen.getByText(/Planner decide y opera/i)).toBeInTheDocument();

    renderWithTheme(<LandingCta />);
    expect(screen.getByRole('button', { name: 'Ver precios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opciones para Planners' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Opciones para venues' })).toHaveAttribute('href', '#venues');
  });

  it('disables login safely when no Client URL is configured', () => {
    useDesktopMedia();
    const production = createLandingConfig({}, { development: false });
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} config={production} />);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
  });
});

function wrapper(node: ReactNode) {
  return <AppThemeProvider>{node}</AppThemeProvider>;
}

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
