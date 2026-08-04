export interface LandingEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLIENT_APP_URL?: string;
  readonly VITE_APP_URL?: string;
}

export interface LandingConfigOptions {
  readonly development: boolean;
}

const productName = 'InvitacionesPremium';
const seoTitle = `${productName} — Operación digital de Eventos privados`;
const seoDescription =
  'Plataforma SaaS para Planners y Organizaciones que permite administrar invitaciones, Confirmación de asistencia y acceso a Eventos privados.';

const commercialContent = {
  brand: {
    name: productName,
    tagline: 'Plataforma SaaS de operación digital para Eventos privados.'
  },
  nav: [
    { label: 'Servicios', href: '#servicios' },
    { label: 'Demo', href: '#demo' },
    { label: 'Precios', href: '#precios' },
    { label: 'Planners', href: '#planners' },
    { label: 'Organizaciones', href: '#organizaciones' },
    { label: 'Preguntas frecuentes', href: '#faq' }
  ],
  hero: {
    badge: 'Plataforma SaaS para Planners y Organizaciones',
    title: 'Operación digital completa para Eventos privados',
    subtitle:
      'InvitacionesPremium no es solo un diseñador de invitaciones. Es una plataforma para administrar Confirmación nominal de asistencia, croquis de mesas, control de acceso QR por Asistente, Staff por token, reportes y Álbum post-Evento.',
    primaryCta: 'Registrarme como Planner',
    secondaryCta: 'Iniciar sesión'
  },
  problem: {
    title: 'El problema de la gestión tradicional de Eventos',
    subtitle: 'Métodos manuales que provocan descontrol en la recepción y fallas operativas.',
    items: [
      {
        title: 'Confirmaciones caóticas',
        description: 'Mensajes dispersos y listas manuales sin trazabilidad ni control nominal de acompañantes.'
      },
      {
        title: 'Largas filas en recepción',
        description: 'Búsquedas manuales que ralentizan el ingreso y generan fricción en la entrada.'
      },
      {
        title: 'Sin visibilidad operativa',
        description: 'Dificultad para conocer cuántos Asistentes ingresaron y en qué Mesa están ubicados.'
      }
    ]
  },
  solution: {
    title: 'Solución integral de operación digital',
    subtitle: 'Control desde la Invitación hasta el archivo del Evento.',
    ruleNotice: 'Regla de acceso: QR por Invitación; check-in individual por Asistente.',
    pillars: [
      {
        title: 'Confirmación de asistencia nominal',
        description: 'El Contacto registra a cada Asistente nominal permitido dentro de su Invitación.'
      },
      {
        title: 'Acceso QR por Asistente',
        description:
          'La Invitación genera un QR. En puerta, Staff escanea y registra el check-in individual de cada Asistente.'
      },
      {
        title: 'Croquis y asignación de Mesas',
        description: 'Plano visual con capacidad controlada y asignación individual, familiar o por Grupo.'
      },
      {
        title: 'Staff por token sin login',
        description: 'Hasta tres StaffTokens activos por Evento, con acceso temporal y acotado a la recepción.'
      },
      {
        title: 'Álbum post-Evento y reportes PDF',
        description:
          'Álbum de hasta 35 fotos para Flyer y Flipbook, con acceso público durante 30 días, y reportes operativos.'
      }
    ]
  },
  services: {
    title: 'Servicios contratados',
    subtitle: 'Elige la modalidad que corresponda a la operación de tu Evento.',
    items: [
      {
        code: 'FLIPBOOK',
        name: 'Flipbook',
        description: 'Invitación digital interactiva de hasta 10 páginas.',
        features: [
          'Hasta 10 páginas de diseño',
          'Confirmación nominal de asistencia',
          'Croquis y asignación de Mesas opcional',
          'QR por Invitación; check-in por Asistente',
          'Álbum de hasta 35 fotos, público durante 30 días'
        ],
        prices: {
          planner: { credits: 30, mxn: 600 },
          organization: { credits: 27, mxn: 540 }
        }
      },
      {
        code: 'FLYER',
        name: 'Flyer',
        description: 'Invitación digital de una sola página con Hotspots.',
        features: [
          'Una página de diseño visual con Hotspots',
          'Confirmación nominal de asistencia',
          'Croquis y asignación de Mesas opcional',
          'QR por Invitación; check-in por Asistente',
          'Álbum de hasta 35 fotos, público durante 30 días'
        ],
        prices: {
          planner: { credits: 20, mxn: 400 },
          organization: { credits: 17, mxn: 340 }
        }
      },
      {
        code: 'PHYSICAL_QR',
        name: 'QR pase físico',
        description: 'Pases individuales para control de acceso directo en puerta.',
        features: [
          'Pases individuales impresos o digitales',
          'El segundo ingreso del mismo pase queda bloqueado',
          'Asignación a Mesa si el Evento usa Croquis',
          'Sin Contactos, Confirmación de asistencia ni Álbum'
        ],
        prices: {
          planner: { credits: 15, mxn: 300 },
          organization: { credits: 10, mxn: 200 }
        }
      },
      {
        code: 'DEMO',
        name: 'Demo',
        description: 'Simulación visual para conocer la experiencia.',
        features: ['No usa backend', 'No crea Eventos', 'No consume créditos', 'No genera accesos reales'],
        prices: {
          planner: { credits: 0, mxn: 0 },
          organization: { credits: 0, mxn: 0 }
        }
      }
    ]
  },
  pricing: {
    title: 'Precios por tipo de Cliente',
    subtitle: '1 crédito = $20 MXN.',
    unitValueMxn: 20,
    planner: {
      title: 'Planner independiente',
      description: 'Registro público y créditos propios para operar sus Eventos.'
    },
    organization: {
      title: 'Organización',
      description: 'Cliente creado exclusivamente por Platform Admin.'
    }
  },
  planners: {
    title: 'Para Planners independientes',
    subtitle: 'Gestiona tus Eventos desde una cuenta propia.',
    bulletPoints: [
      'Registro público como Planner independiente.',
      'Compra de créditos según las necesidades de tus Eventos.',
      'Configuración de Invitaciones, Confirmación nominal y Mesas.',
      'Hasta tres StaffTokens activos por Evento para recepción.'
    ],
    onboardingNotice: 'Después de crear tu cuenta, inicia sesión para continuar con la configuración de tu perfil.',
    cta: 'Registrarme como Planner'
  },
  organizations: {
    title: 'Para Organizaciones',
    subtitle: 'Agencias, salones, jardines y empresas se modelan como Organización.',
    notice: 'Las Organizaciones son creadas exclusivamente por Platform Admin; no tienen registro público.',
    roles: [
      {
        name: 'Admin de Organización',
        description:
          'Gestiona contratación, compra de créditos, línea de crédito y deuda, y puede crear Planners internos.'
      },
      {
        name: 'Planner de Organización',
        description:
          'Opera únicamente los Eventos que creó dentro de la Organización. No compra créditos ni ve saldo, deuda o línea.'
      }
    ]
  },
  faq: {
    title: 'Preguntas frecuentes',
    subtitle: 'Respuestas sobre el alcance operativo de InvitacionesPremium.',
    items: [
      {
        question: '¿Qué es un crédito?',
        answer:
          'Es la unidad entera usada para activar Eventos. Su valor comercial confirmado es de $20 MXN y el costo depende del servicio contratado y del tipo de Cliente.'
      },
      {
        question: '¿Cómo funciona el QR y el ingreso?',
        answer:
          'El QR pertenece a la Invitación. En puerta, el check-in se registra individualmente por cada Asistente nominal.'
      },
      {
        question: '¿Quién puede registrarse públicamente?',
        answer:
          'Únicamente el Planner independiente. Las Organizaciones son creadas por Platform Admin y sus Planners internos no tienen acceso financiero.'
      },
      {
        question: '¿Cuáles son los límites por Evento?',
        answer: 'Cada Evento admite como máximo 150 Contactos/Invitaciones y tres StaffTokens activos.'
      },
      {
        question: '¿Cuánto tiempo está disponible el Álbum?',
        answer:
          'Flyer y Flipbook admiten hasta 35 fotos. El Álbum público permanece disponible durante 30 días desde su publicación. QR pase físico no incluye Álbum.'
      }
    ]
  },
  demo: {
    label: 'Demo visual',
    disclaimer:
      'Esta es una simulación visual: no usa backend, no crea Eventos, no consume créditos y no genera accesos reales.'
  },
  registration: {
    title: 'Registro de Planner independiente',
    intro: 'Crea tu cuenta de Planner independiente. Solo se solicitarán los datos definidos por el registro actual.',
    success: 'Tu cuenta fue creada. Inicia sesión para continuar con la configuración de tu perfil.'
  },
  footer: {
    copyright: `© 2026 ${productName}. Todos los derechos reservados.`,
    legalNotice: 'Plataforma SaaS para administración y operación digital de Eventos.'
  },
  limits: {
    contactsPerEvent: 150,
    activeStaffTokensPerEvent: 3,
    albumPhotos: 35,
    albumPublicDays: 30
  },
  seo: {
    title: seoTitle,
    description: seoDescription,
    robots: 'index, follow'
  }
} as const;

export function createLandingConfig(environment: LandingEnvironment, options: LandingConfigOptions) {
  const allowLocalhost = options.development;
  const apiBaseUrl = resolveHttpUrl(
    environment.VITE_API_BASE_URL ?? (options.development ? 'http://localhost:3000/api/v1' : undefined),
    allowLocalhost
  );
  const clientAppUrl = resolveHttpUrl(
    environment.VITE_CLIENT_APP_URL ?? (options.development ? 'http://localhost:5173' : undefined),
    allowLocalhost
  );
  const publicSiteUrl = resolveHttpUrl(
    environment.VITE_APP_URL ?? (options.development ? 'http://localhost:5176' : undefined),
    allowLocalhost
  );

  return {
    ...commercialContent,
    urls: {
      apiBaseUrl,
      clientApp: clientAppUrl,
      login: clientAppUrl ? new URL('/login', withTrailingSlash(clientAppUrl)).toString() : undefined,
      publicSite: publicSiteUrl,
      canonical: publicSiteUrl ? withTrailingSlash(publicSiteUrl) : undefined,
      ogImage: publicSiteUrl ? new URL('/og-preview.png', withTrailingSlash(publicSiteUrl)).toString() : undefined
    }
  } as const;
}

let cachedConfig: ReturnType<typeof createLandingConfig> | undefined;

export function getLandingConfig(): ReturnType<typeof createLandingConfig> {
  cachedConfig ??= createLandingConfig(import.meta.env, { development: import.meta.env.DEV });
  return cachedConfig;
}

export type LandingConfig = ReturnType<typeof createLandingConfig>;

function resolveHttpUrl(value: string | undefined, allowLocalhost: boolean): string | undefined {
  if (!value?.trim()) return undefined;

  try {
    const parsed = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (!allowLocalhost && isLocalHostname(parsed.hostname))
    ) {
      return undefined;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function withTrailingSlash(value: string): string {
  return `${value.replace(/\/+$/, '')}/`;
}
