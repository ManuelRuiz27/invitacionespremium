import { App } from '../../App';
import { createLandingConfig, getLandingConfig } from '../../config/landing-config';
import { LandingDemoMock } from '../LandingDemoMock';
import { LandingProblem } from '../LandingProblem';
import { LandingSolution } from '../LandingSolution';
import { LandingServices } from '../LandingServices';
import { LandingHeader } from '../LandingHeader';
import { LandingHero } from '../LandingHero';
import { LandingPricing } from '../LandingPricing';
import { LandingPlanners } from '../LandingPlanners';
import { LandingOrganizations } from '../LandingOrganizations';
import { LandingSectionIntro } from '../primitives/LandingSectionIntro';
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

  it('contains the exact authorized commercial copy', () => {
    expect(content.hero).toEqual({
      badge: 'Invitaciones digitales y control de acceso para Eventos',
      title: 'Haz que tu Evento se sienta organizado desde la primera Invitación',
      subtitle:
        'Crea una experiencia cuidada para tus Invitados y mantén Confirmaciones, Mesas y accesos bajo control desde un solo lugar.',
      primaryCta: 'Registrarme como Planner',
      secondaryCta: 'Iniciar sesión'
    });

    expect(content.problem).toEqual({
      title: 'Organizar un Evento no debería significar perseguir mensajes y listas',
      subtitle:
        'Cuando la información está dispersa, cada cambio complica la experiencia de tus Invitados y de tu equipo.',
      items: [
        {
          title: 'Respuestas por todos lados',
          description:
            'Confirmaciones, cambios y acompañantes terminan repartidos entre chats y listas difíciles de mantener al día.'
        },
        {
          title: 'Una recepción que empieza con fricción',
          description: 'Buscar nombres manualmente retrasa el ingreso y hace más difícil ofrecer una bienvenida ágil.'
        },
        {
          title: 'Decisiones sin una vista clara',
          description:
            'Sin información actualizada es complicado coordinar asistencia, Mesas y accesos durante el Evento.'
        }
      ]
    });

    expect(content.solution).toEqual({
      title: 'Una experiencia clara para tus Invitados. Control real para tu equipo',
      subtitle: 'Conecta Invitación, Confirmación, Mesas y acceso dentro de un mismo flujo.',
      ruleNotice: 'Cada Invitación utiliza un QR único y el ingreso se registra por Asistente.',
      pillars: [
        {
          title: 'Una Invitación que representa tu Evento',
          description:
            'Presenta la información esencial y las acciones importantes dentro de una experiencia digital cuidada.'
        },
        {
          title: 'Confirmaciones fáciles de seguir',
          description: 'Consulta quién asistirá y los acompañantes permitidos sin depender de conversaciones dispersas.'
        },
        {
          title: 'Mesas organizadas en un mismo lugar',
          description: 'Asigna a cada Asistente y consulta la distribución del Evento desde una vista central.'
        },
        {
          title: 'Una recepción más ágil',
          description: 'Tu equipo accede de forma temporal y registra el ingreso de cada Asistente desde la Invitación.'
        },
        {
          title: 'Un cierre que también forma parte de la experiencia',
          description: 'Entrega un Álbum post-Evento a los asistentes y conserva el resumen operativo del Evento.'
        }
      ]
    });

    expect(content.demo).toEqual({
      label: 'Recorrido visual',
      title: 'Mira cómo se vive el Evento antes de operarlo',
      subtitle: 'Explora una experiencia visual desde la Invitación hasta la recepción, sin crear un Evento real.',
      disclaimer:
        'Esta demostración es una simulación visual: no usa backend, no crea Eventos, no consume créditos y no genera accesos reales.',
      scenes: [
        {
          code: 'INVITATION',
          label: 'Invitación',
          title: 'Una primera impresión a la altura del Evento',
          description:
            'Presenta la información esencial y facilita las acciones importantes dentro de una experiencia cuidada.'
        },
        {
          code: 'CONFIRMATION',
          label: 'Confirmación',
          title: 'Respuestas claras, sin perseguir mensajes',
          description: 'Cada Invitación concentra la asistencia y los acompañantes permitidos.'
        },
        {
          code: 'ACCESS',
          label: 'Acceso',
          title: 'Una recepción más ágil',
          description: 'El equipo consulta la Invitación y registra el ingreso de cada Asistente.'
        },
        {
          code: 'TABLES',
          label: 'Mesas',
          title: 'Cada persona en el lugar correcto',
          description: 'Consulta la asignación y ubica la Mesa desde el mismo flujo de recepción.'
        }
      ]
    });
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
    expect(content.solution.ruleNotice).toBe(
      'Cada Invitación utiliza un QR único y el ingreso se registra por Asistente.'
    );
    expect(serializedContent).toContain('QR único');
    expect(serializedContent).toContain('ingreso se registra por Asistente');
    for (const forbiddenClaim of ['QR por Asistente', 'QR individual por Asistente', 'un QR para cada Asistente']) {
      expect(serializedContent).not.toContain(forbiddenClaim);
    }
  });

  it('states the physical-pass and Organization restrictions', () => {
    const physical = content.services.items.find((service) => service.code === 'PHYSICAL_QR');
    expect(physical?.features.join(' ')).toContain('Sin Contactos, Confirmación de asistencia ni Álbum');
    expect(content.organizations.notice).toContain('no cuentan con registro público');
    expect(content.organizations.roles[1].description).toContain('sin acceso a saldo, deuda o línea');
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

  it('renders LandingDemoMock obeying strict commercial rules', () => {
    renderWithTheme(<LandingDemoMock />);
    
    const section = document.getElementById('demo');
    expect(section).toBeInTheDocument();
    
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    
    expect(tabs[0]).toHaveTextContent('Invitación');
    expect(tabs[1]).toHaveTextContent('Confirmación');
    expect(tabs[2]).toHaveTextContent('Acceso');
    expect(tabs[3]).toHaveTextContent('Mesas');
    
    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(4);
    
    for (const scene of content.demo.scenes) {
      const tab = screen.getByRole('tab', { name: scene.label });
      const panelId = tab.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();

      const panel = document.getElementById(panelId!);
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);

      expect(tab.id).not.toBe('');
      expect(panel?.id).not.toBe('');
    }

    const invitationTab = screen.getByRole('tab', { name: 'Invitación' });
    const confirmationTab = screen.getByRole('tab', { name: 'Confirmación' });
    
    // 1. El primer tab inicia seleccionado
    expect(invitationTab).toHaveAttribute('aria-selected', 'true');
    expect(confirmationTab).toHaveAttribute('aria-selected', 'false');
    expect(document.getElementById(invitationTab.getAttribute('aria-controls')!)).not.toHaveAttribute('hidden');
    expect(document.getElementById(confirmationTab.getAttribute('aria-controls')!)).toHaveAttribute('hidden');

    // 2. Se enfoca el primer tab
    invitationTab.focus();
    expect(invitationTab).toHaveFocus();

    // 3. ArrowRight mueve el foco o selección a Confirmación
    fireEvent.keyDown(invitationTab, { key: 'ArrowRight' });
    expect(confirmationTab).toHaveFocus();
    
    // 5. El panel activo cambia de forma coherente y (6/7) solo un tab/panel está activo
    expect(confirmationTab).toHaveAttribute('aria-selected', 'true');
    expect(invitationTab).toHaveAttribute('aria-selected', 'false');
    expect(document.getElementById(confirmationTab.getAttribute('aria-controls')!)).not.toHaveAttribute('hidden');
    expect(document.getElementById(invitationTab.getAttribute('aria-controls')!)).toHaveAttribute('hidden');

    // 4. ArrowLeft regresa a Invitación
    fireEvent.keyDown(confirmationTab, { key: 'ArrowLeft' });
    expect(invitationTab).toHaveFocus();
    expect(invitationTab).toHaveAttribute('aria-selected', 'true');
    expect(document.getElementById(invitationTab.getAttribute('aria-controls')!)).not.toHaveAttribute('hidden');
    
    const forbidden = ['Fam. Mendoza', 'Carlos Mendoza', 'Lucía García', 'Sofía', 'Mateo', 'Hotspot', 'Reiniciar Demo', 'StaffTokens', 'Check-in:'];
    for (const text of forbidden) {
      expect(screen.queryByText(new RegExp(text, 'i'))).not.toBeInTheDocument();
    }
    
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('form')).toBeNull();
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
    const handleRegister = vi.fn();
    renderWithTheme(<LandingHero onOpenRegister={handleRegister} />);
    expect(screen.getByText(content.hero.badge)).toBeInTheDocument();
    
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(content.hero.title);
    
    expect(screen.getByText(content.hero.subtitle)).toBeInTheDocument();
    
    const primaryBtn = screen.getByRole('button', { name: content.hero.primaryCta });
    const secondaryLink = screen.getByRole('link', { name: content.hero.secondaryCta });
    expect(primaryBtn).toBeInTheDocument();
    expect(secondaryLink).toBeInTheDocument();
    
    fireEvent.click(primaryBtn);
    expect(handleRegister).toHaveBeenCalledOnce();

    expect(screen.queryByText(content.brand.tagline)).not.toBeInTheDocument();
    expect(screen.queryByText(content.solution.ruleNotice)).not.toBeInTheDocument();
    const demoTitles: string[] = content.demo.scenes.map(s => s.title);
    for (const pillar of content.solution.pillars) {
      if (!demoTitles.includes(pillar.title)) {
        expect(screen.queryByText(pillar.title)).not.toBeInTheDocument();
      }
    }
  });

  it('hero product stage renders LandingHeroExperience from config', () => {
    renderWithTheme(<LandingHero onOpenRegister={vi.fn()} />);
    // Check for some elements rendered by LandingHeroExperience
    const invScene = content.demo.scenes.find((s) => s.code === 'INVITATION');
    if (invScene) {
      expect(screen.getByText(invScene.title)).toBeInTheDocument();
    }
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

  it('renders components in correct order: Hero, Demo, Problem, Solution, Services', async () => {
    renderWithTheme(<App />);
    
    await screen.findByRole('heading', {
      level: 2,
      name: content.demo.title
    });
    
    const heroHeading = screen.getByRole('heading', {
      level: 1,
      name: content.hero.title
    });

    const demoHeading = screen.getByRole('heading', {
      level: 2,
      name: content.demo.title
    });

    const problemHeading = screen.getByRole('heading', {
      level: 2,
      name: content.problem.title
    });

    const solutionHeading = screen.getByRole('heading', {
      level: 2,
      name: content.solution.title
    });

    const servicesHeading = screen.getByRole('heading', {
      level: 2,
      name: content.services.title
    });
    
    expect(heroHeading.compareDocumentPosition(demoHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(demoHeading.compareDocumentPosition(problemHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(problemHeading.compareDocumentPosition(solutionHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(solutionHeading.compareDocumentPosition(servicesHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);

    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');

    // Buscar la sección usando el rol explícito
    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    expect(section).not.toHaveAttribute('aria-label');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    // No links ni buttons extra
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders LandingSectionIntro handling dark prop without errors', () => {
    const { unmount } = renderWithTheme(
      <LandingSectionIntro headingId="test-heading" title="Test Title" subtitle="Test Sub" />
    );
    const h2 = screen.getByRole('heading', { level: 2, name: 'Test Title' });
    expect(h2).toHaveAttribute('id', 'test-heading');
    expect(screen.getByText('Test Sub')).toBeInTheDocument();
    unmount();

    renderWithTheme(
      <LandingSectionIntro headingId="test-heading-dark" title="Test Title Dark" subtitle="Test Sub Dark" dark />
    );
    const h2Dark = screen.getByRole('heading', { level: 2, name: 'Test Title Dark' });
    expect(h2Dark).toHaveAttribute('id', 'test-heading-dark');
    expect(screen.getByText('Test Sub Dark')).toBeInTheDocument();
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

    // Semántica: aria-labelledby y un solo h2
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);

    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    expect(section).not.toHaveAttribute('aria-label');

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

    // Semántica: aria-labelledby y un solo h2
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);

    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    expect(section).not.toHaveAttribute('aria-label');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    expect(screen.queryByText(/Más popular/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recomendado/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders LandingPricing exactly with config content', () => {
    renderWithTheme(<LandingPricing />);

    expect(screen.getByRole('heading', { level: 2, name: content.pricing.title })).toBeInTheDocument();
    expect(screen.getByText(content.pricing.subtitle)).toBeInTheDocument();
    expect(screen.getByText('1 crédito = $20 MXN')).toBeInTheDocument();

    const plannerHeadings = screen.getAllByRole('heading', { level: 3, name: content.pricing.planner.title });
    expect(plannerHeadings).toHaveLength(1);

    const orgHeadings = screen.getAllByRole('heading', { level: 3, name: content.pricing.organization.title });
    expect(orgHeadings).toHaveLength(1);

    const serviceCodes = content.services.items.map((s) => s.code);
    expect(serviceCodes).toEqual(['FLIPBOOK', 'FLYER', 'PHYSICAL_QR', 'DEMO']);

    content.services.items.forEach((s) => {
      const row = document.querySelector(`[data-service-code="${s.code}"]`);
      expect(row).toBeInTheDocument();
      expect(within(row! as HTMLElement).getByRole('heading', { level: 4, name: s.name })).toBeInTheDocument();

      const plannerCell = row!.querySelector('[data-client-type="planner"]');
      const organizationCell = row!.querySelector('[data-client-type="organization"]');

      expect(plannerCell).toBeInTheDocument();
      expect(organizationCell).toBeInTheDocument();

      const plannerContent = within(plannerCell! as HTMLElement);
      expect(plannerContent.getByText(new RegExp(`^${s.prices.planner.credits}$`))).toBeInTheDocument();
      expect(plannerContent.getByText(`$${s.prices.planner.mxn} MXN`)).toBeInTheDocument();

      const orgContent = within(organizationCell! as HTMLElement);
      expect(orgContent.getByText(new RegExp(`^${s.prices.organization.credits}$`))).toBeInTheDocument();
      expect(orgContent.getByText(`$${s.prices.organization.mxn} MXN`)).toBeInTheDocument();
    });

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    expect(section).not.toHaveAttribute('aria-label');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    expect(screen.queryByText(/Más popular/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recomendado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ahorro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mejor precio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders LandingPlanners exactly with config content', () => {
    const mockRegister = vi.fn();
    renderWithTheme(<LandingPlanners onOpenRegister={mockRegister} />);

    expect(screen.getByRole('heading', { level: 2, name: content.planners.title })).toBeInTheDocument();
    expect(screen.getByText(content.planners.subtitle)).toBeInTheDocument();
    expect(screen.getByText(content.planners.onboardingNotice)).toBeInTheDocument();

    const list = screen.getByRole('list');
    const listItems = within(list).getAllByRole('listitem');
    expect(listItems).toHaveLength(4);

    content.planners.bulletPoints.forEach((point) => {
      expect(within(list).getByText(point)).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!).toHaveTextContent(content.planners.cta);

    fireEvent.click(buttons[0]!);
    expect(mockRegister).toHaveBeenCalledOnce();

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    expect(section).not.toHaveAttribute('aria-label');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    expect(screen.queryByText(/MODELO PLANNER INDEPENDIENTE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/¿Eres Planner Independiente?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/VIP Pass/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Acceso concedido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mesa 12/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/ADMINISTRADO/i)).not.toBeInTheDocument();
  });

  it('renders LandingOrganizations exactly with config content', () => {
    renderWithTheme(<LandingOrganizations />);

    expect(screen.getByRole('heading', { level: 2, name: content.organizations.title })).toBeInTheDocument();
    expect(screen.getByText(content.organizations.subtitle)).toBeInTheDocument();
    expect(screen.getByText(content.organizations.notice)).toBeInTheDocument();

    content.organizations.roles.forEach((role) => {
      expect(screen.getByRole('heading', { name: role.name })).toBeInTheDocument();
      expect(screen.getByText(role.description)).toBeInTheDocument();
    });

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    const h2 = headings[0]!;
    expect(h2.id).not.toBe('');

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', h2.id);
    expect(section).not.toHaveAttribute('aria-label');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('ADMINISTRADO')).not.toBeInTheDocument();

    // Ensure no alert component with warning or error semantics exists
    const alerts = screen.queryAllByRole('alert');
    expect(alerts.length).toBe(0);
  });
});
