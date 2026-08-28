export interface LandingEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLIENT_APP_URL?: string;
  readonly VITE_APP_URL?: string;
}

export interface LandingConfigOptions {
  readonly development: boolean;
}

const productName = 'InvitacionesPremium';
const seoTitle = `${productName} — Operación digital gestionada para Eventos`;
const seoDescription =
  'Servicio gestionado de operación digital para Eventos: invitados, RSVP, Mesas y acceso QR/check-in según el SKU contratado.';

const commercialContent = {
  brand: {
    name: productName,
    tagline: 'Servicio gestionado de operación digital para Eventos privados.'
  },
  nav: [
    { label: 'Servicios', href: '#servicios' },
    { label: 'Precios', href: '#precios' },
    { label: 'Planners', href: '#planners' },
    { label: 'Venues', href: '#venues' },
    { label: 'Demo', href: '#demo' },
    { label: 'FAQ', href: '#faq' }
  ],
  hero: {
    badge: 'Servicio gestionado de operación digital de Eventos',
    title:
      'InvitacionesPremium gestiona la infraestructura digital de tu Evento para que tú mantengas el control de tus invitados y operación.',
    subtitle:
      'Preparamos la infraestructura técnica, la Invitación y el Croquis cuando aplican; tú o tu Planner conservan la operación de invitados.',
    primaryCta: 'Ver precios',
    secondaryCta: 'Para Planners y agencias'
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
    title: 'Infraestructura preparada por nosotros. Operación bajo tu control',
    subtitle: 'Cada parte del Evento tiene un responsable claro desde la preparación hasta el día de operación.',
    ruleNotice: 'Cada Invitación utiliza un QR único y el ingreso se registra por Asistente.',
    pillars: [
      {
        title: 'Infraestructura técnica lista para operar',
        description:
          'InvitacionesPremium configura el Evento, su infraestructura digital y la Invitación personalizada cuando el SKU la incluye.'
      },
      {
        title: 'Confirmaciones bajo control del cliente',
        description:
          'El Planner o cliente mantiene invitados, distribución y seguimiento RSVP mientras el Provider sostiene la infraestructura.'
      },
      {
        title: 'Croquis técnico y Seating separados',
        description:
          'InvitacionesPremium prepara el Croquis técnico cuando aplica; el Planner decide y opera la asignación de personas a Mesas.'
      },
      {
        title: 'Staff preparado para el día del Evento',
        description:
          'El Planner administra los accesos temporales de Staff y coordina la recepción con Scanner y check-in.'
      },
      {
        title: 'Cierre operativo con información útil',
        description:
          'El Evento concluye con reporte operativo y, para Flyer o Flipbook, una experiencia de Álbum postevento.'
      }
    ]
  },
  services: {
    title: 'Tres formas de operar tu Evento',
    subtitle: 'Elige el SKU por la experiencia y la operación que realmente necesitas.',
    items: [
      {
        code: 'PHYSICAL_QR',
        name: 'QR / EventOps',
        description: 'Control de acceso y operación digital sin diseño personalizado de Invitación.',
        features: [
          'QR y control de acceso',
          'Staff y Scanner',
          'Croquis y Mesas cuando aplique',
          'Reporte operativo',
          'Sin diseño personalizado de Invitación',
          'Sin Álbum',
          'Sin RSVP público digital'
        ]
      },
      {
        code: 'FLYER',
        name: 'Flyer',
        description: 'Diseño personalizado de dos piezas principales para una experiencia digital directa.',
        features: [
          'Dos piezas principales de diseño personalizado',
          'RSVP y gestión de invitados',
          'Croquis y Mesas opcional',
          'QR y check-in',
          'Álbum',
          'Hasta dos rondas consolidadas de cambios'
        ]
      },
      {
        code: 'FLIPBOOK',
        name: 'Flipbook',
        description: 'Diseño personalizado de hasta 10 páginas para una experiencia digital narrativa.',
        features: [
          'Hasta 10 páginas de diseño personalizado',
          'RSVP y gestión de invitados',
          'Croquis y Mesas opcional',
          'QR y check-in',
          'Álbum',
          'Hasta dos rondas consolidadas de cambios'
        ]
      }
    ]
  },
  pricing: {
    title: 'Precio estándar por SKU y capacidad',
    subtitle: 'Consulta el PVP vigente para Eventos de hasta 50, 100 o 150 personas.',
    note: 'Los precios en MXN provienen del Price Book público vigente; los créditos se muestran como referencia secundaria.'
  },
  planners: {
    title: 'Una alianza para Planners y agencias',
    subtitle:
      'InvitacionesPremium prepara la infraestructura técnica mientras tú conservas la relación y operación con tu cliente.',
    bulletPoints: [
      'Conservas la relación comercial con tu cliente.',
      'Operas invitados y seguimiento RSVP.',
      'Decides Seating y administras accesos de Staff.',
      'Pueden existir tarifas Partner explícitas según condiciones comerciales.'
    ],
    commercialCta: 'Conocer condiciones para Planners',
    registerCta: 'Crear cuenta de Planner',
    notice:
      'El registro de cuenta no garantiza una tarifa Partner. Las condiciones comerciales requieren revisión explícita.'
  },
  venue: {
    title: 'Operación recurrente para salones, jardines y venues',
    subtitle: 'Estandariza el acceso y la operación digital de cada Evento con una infraestructura repetible.',
    bulletPoints: [
      'QR / EventOps para control de acceso',
      'Staff y Scanner para la recepción',
      'Croquis y Mesas cuando aplique',
      'Reportes operativos por Evento',
      'Tarifas que pueden mejorar según volumen efectivo'
    ],
    cta: 'Solicitar propuesta para mi venue',
    notice:
      'La solicitud es el siguiente paso para seguimiento comercial; no crea una cuenta, venue ni tarifa automáticamente.'
  },
  faq: {
    title: 'Preguntas frecuentes',
    subtitle: 'Respuestas sobre el alcance comercial y operativo de InvitacionesPremium.',
    items: [
      {
        question: '¿Cómo se define el precio estándar?',
        answer: 'Por el SKU contratado y la capacidad del Evento: hasta 50, 100 o 150 personas.'
      },
      {
        question: '¿Qué es un crédito?',
        answer:
          'Es la unidad financiera del sistema. Un crédito equivale a $20 MXN; el precio público se muestra principalmente en MXN.'
      },
      {
        question: '¿Registrarme como Planner me da tarifa Partner?',
        answer:
          'No. El registro de cuenta y la clasificación Partner son procesos distintos y requieren condiciones comerciales explícitas.'
      },
      {
        question: '¿Cómo funciona Venue?',
        answer:
          'Puede acceder a un esquema comercial recurrente según volumen efectivo. No existe registro público de Organization.'
      },
      {
        question: '¿Qué incluye QR / EventOps?',
        answer:
          'Incluye control de acceso, Staff/Scanner, Croquis y Mesas cuando aplican, y reporte operativo. No incluye RSVP público digital ni Álbum.'
      },
      {
        question: '¿Cuáles son los límites por Evento?',
        answer: 'Cada Evento admite como máximo 150 invitados y tres accesos Staff activos.'
      }
    ]
  },
  demo: {
    label: 'Recorrido visual',
    title: 'Mira cómo se vive un flujo digital',
    subtitle:
      'Explora una simulación de Flyer o Flipbook desde la Invitación hasta la recepción; las capacidades varían según el SKU.',
    disclaimer:
      'Esta demostración es un recorrido visual: no es un servicio, no usa backend, no crea Eventos, no consume créditos y no genera accesos reales.',
    scenes: [
      {
        code: 'INVITATION',
        label: 'Invitación',
        title: 'Una primera impresión a la altura del Evento',
        description:
          'Flyer y Flipbook pueden presentar la información y acciones principales dentro de una experiencia personalizada.'
      },
      {
        code: 'CONFIRMATION',
        label: 'Confirmación',
        title: 'Respuestas claras, sin perseguir mensajes',
        description: 'En Flyer y Flipbook, cada Invitación concentra la asistencia y los acompañantes permitidos.'
      },
      {
        code: 'ACCESS',
        label: 'Acceso',
        title: 'Una recepción más ágil',
        description: 'El equipo usa QR y Scanner para registrar el ingreso de cada Asistente.'
      },
      {
        code: 'TABLES',
        label: 'Mesas',
        title: 'Cada persona en el lugar correcto',
        description: 'Cuando el Evento usa Croquis, el Planner consulta y opera la asignación a Mesas.'
      }
    ]
  },
  registration: {
    title: 'Crear cuenta de Planner',
    intro:
      'Crea una cuenta Standard de Planner independiente. El registro no asigna automáticamente condiciones Partner.',
    success: 'Tu cuenta fue creada. Inicia sesión para continuar con la configuración de tu perfil.'
  },
  cta: {
    title: 'Elige la operación correcta para tu Evento',
    description: 'Compara el precio estándar o revisa las opciones comerciales para Planners y venues.',
    primaryCta: 'Ver precios',
    secondaryCta: 'Opciones para Planners',
    venueLink: 'Opciones para venues'
  },
  footer: {
    copyright: `© 2026 ${productName}. Todos los derechos reservados.`,
    legalNotice: 'Servicio gestionado de administración y operación digital de Eventos.'
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
    environment.VITE_API_BASE_URL ?? (options.development ? developmentUrl(3000, '/api/v1') : undefined),
    allowLocalhost
  );
  const clientAppUrl = resolveHttpUrl(
    environment.VITE_CLIENT_APP_URL ?? (options.development ? developmentUrl(5173) : undefined),
    allowLocalhost
  );
  const publicSiteUrl = resolveHttpUrl(
    environment.VITE_APP_URL ?? (options.development ? developmentUrl(5176) : undefined),
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

function developmentUrl(port: number, path = ''): string {
  const hostname = typeof window === 'undefined' ? 'dev.invalid' : window.location.hostname;
  return `http://${hostname}:${port}${path}`;
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
