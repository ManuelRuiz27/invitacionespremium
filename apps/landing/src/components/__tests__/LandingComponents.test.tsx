import { App } from '../../App';
import { createLandingConfig, getLandingConfig } from '../../config/landing-config';
import { LandingDemoMock } from '../LandingDemoMock';
import { LandingProblem } from '../LandingProblem';
import { LandingSolution } from '../LandingSolution';
import { LandingServices } from '../LandingServices';
import { LandingHeader } from '../LandingHeader';
import { LandingHero } from '../LandingHero';
import { AppThemeProvider } from '@invitaciones/ui';
import { landingTokens } from '../../theme/landing-theme';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('Landing accessibility and navigation', () => {
  it('contains a skip link targeting the main content', () => {
    renderWithTheme(<App />);
    const skipLink = screen.getByText('Saltar al contenido principal');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
    const main = document.getElementById('main-content');
    expect(main).toBeInTheDocument();
    expect(main?.tagName.toLowerCase()).toBe('main');
  });

  it('header displays all navigation items from config', () => {
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
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} />);
    for (const item of content.nav) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('register opens from header CTA', () => {
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
    const handleRegister = vi.fn();
    renderWithTheme(<LandingHeader onOpenRegister={handleRegister} />);
    const registerBtn = screen.getByRole('button', { name: /Registrarme/i });
    fireEvent.click(registerBtn);
    expect(handleRegister).toHaveBeenCalledOnce();
  });

  it('register opens from hero CTA', () => {
    const handleRegister = vi.fn();
    renderWithTheme(<LandingHero onOpenRegister={handleRegister} />);
    const registerBtn = screen.getByRole('button', { name: content.hero.primaryCta });
    fireEvent.click(registerBtn);
    expect(handleRegister).toHaveBeenCalledOnce();
  });

  it('login is disabled in header when no URL is configured', () => {
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
    const noLoginConfig = createLandingConfig({}, { development: false });
    renderWithTheme(<LandingHeader onOpenRegister={vi.fn()} config={noLoginConfig} />);
    const loginBtn = screen.getByRole('button', { name: content.hero.secondaryCta });
    expect(loginBtn).toBeDisabled();
  });

  it('login is disabled in hero when no URL is configured', () => {
    const noLoginConfig = createLandingConfig({}, { development: false });
    renderWithTheme(<LandingHero onOpenRegister={vi.fn()} config={noLoginConfig} />);
    const loginBtn = screen.getByRole('button', { name: content.hero.secondaryCta });
    expect(loginBtn).toBeDisabled();
  });

  it('hero preserves content from landing-config', () => {
    renderWithTheme(<LandingHero onOpenRegister={vi.fn()} />);
    expect(screen.getByText(content.hero.badge)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(content.hero.title);
    expect(screen.getByText(content.hero.subtitle)).toBeInTheDocument();
    expect(screen.getByText(content.hero.primaryCta)).toBeInTheDocument();
    expect(screen.getByText(content.hero.secondaryCta)).toBeInTheDocument();
  });

  it('hero product stage renders solution pillars from config', () => {
    renderWithTheme(<LandingHero onOpenRegister={vi.fn()} />);
    for (const pillar of content.solution.pillars) {
      expect(screen.getByText(pillar.title)).toBeInTheDocument();
    }
    expect(screen.getByText(content.solution.ruleNotice)).toBeInTheDocument();
  });

  it('mobile drawer contains all navigation items and both CTAs', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));
    const drawer = screen.getByRole('navigation', { name: 'Navegación principal' });
    for (const item of content.nav) {
      expect(within(drawer).getByText(item.label)).toBeInTheDocument();
    }
    expect(within(drawer).getByText('Registrarme como Planner')).toBeInTheDocument();
    expect(within(drawer).getByText(content.hero.secondaryCta)).toBeInTheDocument();
  });
});

describe('LandingProductStage visual contrast', () => {
  function hexToRgb(hex: string) {
    const c = hex.replace('#', '');
    return {
      r: parseInt(c.substring(0, 2), 16),
      g: parseInt(c.substring(2, 4), 16),
      b: parseInt(c.substring(4, 6), 16)
    };
  }

  function relativeLuminance(r: number, g: number, b: number) {
    const toS = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toS(r) + 0.7152 * toS(g) + 0.0722 * toS(b);
  }

  function contrastRatio(hex1: string, hex2: string) {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  it('guarantees WCAG 2.1 AA compliant contrast for the dark surface semantic tokens', () => {
    const { background, accent, accentMuted, textPrimary, textSecondary } = landingTokens.colors.darkSurface;

    expect(contrastRatio(accent, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(textPrimary, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(textSecondary, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentMuted, background)).toBeGreaterThanOrEqual(3.0);
  });
});

describe('Landing section semantics and content', () => {
  it('renders LandingProblem exactly with config content', () => {
    renderWithTheme(<LandingProblem />);

    // Título y subtítulo
    expect(screen.getByRole('heading', { level: 2, name: content.problem.title })).toBeInTheDocument();
    expect(screen.getByText(content.problem.subtitle)).toBeInTheDocument();

    // Tres problemas
    const problemHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(problemHeadings).toHaveLength(3);
    content.problem.items.forEach((item) => {
      expect(screen.getByRole('heading', { level: 3, name: item.title })).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
    });

    // Semántica: aria-labelledby y un solo h2
    const section = screen.getByRole('region', { name: content.problem.title });
    expect(section).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    // No links ni buttons extra
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders LandingSolution exactly with config content', () => {
    renderWithTheme(<LandingSolution />);

    expect(screen.getByRole('heading', { level: 2, name: content.solution.title })).toBeInTheDocument();
    expect(screen.getByText(content.solution.subtitle)).toBeInTheDocument();
    expect(screen.getByText(content.solution.ruleNotice)).toBeInTheDocument();

    const pillarHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(pillarHeadings).toHaveLength(5);
    content.solution.pillars.forEach((pillar) => {
      expect(screen.getByRole('heading', { level: 3, name: pillar.title })).toBeInTheDocument();
      expect(screen.getByText(pillar.description)).toBeInTheDocument();
    });

    // Semántica
    const section = screen.getByRole('region', { name: content.solution.title });
    expect(section).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    expect(screen.queryByText(/Recomendado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Prioridad/i)).not.toBeInTheDocument();
  });

  it('renders LandingServices exactly with config content', () => {
    renderWithTheme(<LandingServices />);

    expect(screen.getByRole('heading', { level: 2, name: content.services.title })).toBeInTheDocument();

    const serviceHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(serviceHeadings).toHaveLength(4); // 3 pagados + 1 Demo

    // Demo characteristics
    const demoService = content.services.items.find((s) => s.code === 'DEMO')!;
    expect(screen.getByRole('heading', { level: 3, name: demoService.name })).toBeInTheDocument();

    // Lists
    const lists = screen.getAllByRole('list');
    expect(lists.length).toBeGreaterThanOrEqual(4); // one for each service

    // Semántica
    const section = screen.getByRole('region', { name: content.services.title });
    expect(section).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    expect(screen.queryByText(/Más popular/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recomendado/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
