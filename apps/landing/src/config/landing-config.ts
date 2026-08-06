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
    badge: 'Invitaciones digitales y control de acceso para Eventos',
    title: 'Haz que tu Evento se sienta organizado desde la primera Invitación',
    subtitle:
      'Crea una experiencia cuidada para tus Invitados y mantén Confirmaciones, Mesas y accesos bajo control desde un solo lugar.',
    primaryCta: 'Registrarme como Planner',
    secondaryCta: 'Iniciar sesión'
  },
  problem: {
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
  },
  solution: {
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
    title: 'Elige la experiencia que mejor representa tu Evento',
    subtitle:
      'Compara las modalidades disponibles y selecciona la que corresponda a la experiencia y operación que necesitas.',
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
    title: 'Crea experiencias memorables sin perder el control',
    subtitle:
      'Diseña, organiza y opera cada Evento desde un solo lugar, con una experiencia clara para tus Invitados y tu equipo.',
    bulletPoints: [
      'Presenta tu Evento con una Invitación digital cuidada.',
      'Gestiona Confirmaciones y acompañantes sin listas dispersas.',
      'Organiza Mesas y accesos desde un mismo flujo.',
      'Coordina la recepción con accesos temporales para tu Staff.'
    ],
    onboardingNotice: 'Regístrate como Planner independiente y comienza a preparar tu próximo Evento.',
    cta: 'Registrarme como Planner'
  },
  organizations: {
    title: 'Una operación consistente para cada Evento de tu Organización',
    subtitle: 'Centraliza la gestión del equipo y la operación de tus Eventos sin perder visibilidad.',
    notice:
      'Las Organizaciones se crean de forma administrada dentro de la plataforma y no cuentan con registro público.',
    roles: [
      {
        name: 'Admin de Organización',
        description:
          'Administra créditos, deuda y acceso del equipo, además de supervisar los Eventos de la Organización.'
      },
      {
        name: 'Planner de Organización',
        description: 'Configura y opera únicamente los Eventos que creó, sin acceso a saldo, deuda o línea de crédito.'
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
  },
  registration: {
    title: 'Registro de Planner independiente',
    intro: 'Crea tu cuenta de Planner independiente. Solo se solicitarán los datos definidos por el registro actual.',
    success: 'Tu cuenta fue creada. Inicia sesión para continuar con la configuración de tu perfil.'
  },
  cta: {
    title: 'Lleva tu Evento al siguiente nivel',
    description:
      'Comienza a organizar la experiencia completa con InvitacionesPremium. El registro como Planner independiente es público y sin costo inicial.',
    primaryCta: 'Registrarme como Planner',
    secondaryCta: 'Iniciar sesión'
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
