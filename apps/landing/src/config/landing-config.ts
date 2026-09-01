export interface LandingEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLIENT_APP_URL?: string;
  readonly VITE_APP_URL?: string;
}

export interface LandingConfigOptions {
  readonly development: boolean;
}

const productName = 'InvitacionesPremium';
const seoTitle = `${productName} — Gestión digital de invitados para tu evento`;
const seoDescription =
  'Organiza invitaciones, confirmaciones, mesas y accesos con un servicio que acompaña a tus invitados hasta su llegada al evento.';

const commercialContent = {
  brand: {
    name: productName,
    tagline: 'Gestión digital de invitados para eventos.'
  },
  nav: [
    { label: 'Producto', href: '#producto' },
    { label: 'Cómo funciona', href: '#como-funciona' },
    { label: 'Servicios', href: '#servicios' },
    { label: 'Precios', href: '#precios' },
    { label: 'Planners', href: '#planners' },
    { label: 'Salones y jardines', href: '#venues' },
    { label: 'FAQ', href: '#faq' }
  ],
  hero: {
    badge: 'De la invitación a la llegada',
    title: 'Invitados organizados. Un evento más fácil de operar.',
    subtitle:
      'Nos encargamos de la gestión digital de tus invitados, desde la invitación y las confirmaciones hasta las mesas y el acceso al evento.',
    primaryCta: 'Ver cómo funciona',
    secondaryCta: 'Ver servicios y precios'
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
    title: 'Todo lo que necesitas para organizar a tus invitados',
    subtitle: 'Una experiencia continua desde que reciben la invitación hasta que llegan a tu evento.',
    ruleNotice: 'Cada acceso conserva la información necesaria para recibir a tus invitados.',
    pillars: [
      {
        title: 'Una invitación clara desde el primer momento',
        description: 'Preparamos la experiencia de acuerdo con tu evento y el servicio que elijas.'
      },
      {
        title: 'Confirmaciones en un solo lugar',
        description: 'Consulta respuestas y acompañantes sin perseguir conversaciones dispersas.'
      },
      {
        title: 'Mesas más fáciles de organizar',
        description: 'Visualiza la distribución y decide dónde se sentará cada persona.'
      },
      {
        title: 'Una recepción con información a la mano',
        description: 'Tu equipo de recepción consulta cada acceso y registra la entrada.'
      },
      {
        title: 'Un cierre con resultados claros',
        description: 'Al terminar, cuentas con un reporte y, cuando aplica, un álbum para compartir.'
      }
    ]
  },
  services: {
    title: 'Elige el servicio para tu evento',
    subtitle: 'Tres maneras de acompañar a tus invitados, con el mismo cuidado de principio a fin.',
    items: [
      {
        code: 'PHYSICAL_QR',
        name: 'Gestión de Invitados',
        description:
          'Todo lo necesario para organizar invitados y accesos, sin contratar una invitación personalizada.',
        features: [
          'Control de invitados y accesos',
          'Confirmaciones coordinadas según la modalidad contratada',
          'Organización de mesas cuando aplica',
          'Accesos digitales',
          'Equipo de recepción y control de entrada',
          'Reporte del evento',
          'No incluye formulario público de confirmación'
        ]
      },
      {
        code: 'FLYER',
        name: 'Invitación Digital',
        description: 'Una invitación personalizada conectada con toda la gestión de tus invitados.',
        features: [
          'Diseño digital personalizado',
          'Confirmaciones y acompañantes',
          'Gestión de invitados',
          'Organización de mesas',
          'Accesos y control de entrada',
          'Álbum del evento',
          'Hasta dos rondas consolidadas de cambios'
        ]
      },
      {
        code: 'FLIPBOOK',
        name: 'Invitación Premium',
        description: 'Una experiencia visual tipo revista conectada con toda la operación de tus invitados.',
        features: [
          'Hasta 10 páginas',
          'Experiencia visual premium',
          'Confirmaciones e invitados',
          'Organización de mesas',
          'Accesos y control de entrada',
          'Álbum del evento',
          'Hasta dos rondas consolidadas de cambios'
        ]
      }
    ]
  },
  pricing: {
    title: 'Servicios y precios',
    subtitle: 'Compara el precio por evento para hasta 50, 100 o 150 personas.',
    note: 'Precio por evento · MXN'
  },
  planners: {
    title: 'Tú organizas el evento. Nosotros nos encargamos de la gestión digital de tus invitados.',
    subtitle:
      'Te entregamos el servicio preparado para trabajar: invitación cuando aplica, confirmaciones, organización de mesas y accesos. Tú mantienes el control con tu cliente y puedes generar un margen adicional por cada evento.',
    bulletPoints: [
      {
        title: 'Menos trabajo administrativo',
        description: 'Centraliza invitados, confirmaciones, cambios y mesas.'
      },
      {
        title: 'Mantienes el control',
        description: 'Tu cliente sigue siendo tu cliente y tú conservas las decisiones del evento.'
      },
      {
        title: 'Generas un ingreso adicional',
        description: 'Puedes acceder a condiciones Partner y definir el precio que presentas a tu cliente.'
      }
    ],
    commercialCta: 'Quiero trabajar como Planner Partner',
    registerCta: 'Crear cuenta de Planner',
    notice: 'Crear una cuenta Planner no asigna automáticamente condiciones Partner.'
  },
  venue: {
    title: 'Agrega gestión digital de invitados a tus paquetes sin aumentar tu carga de trabajo.',
    subtitle:
      'Tus clientes pueden organizar invitados y mesas, mientras tu equipo recibe el evento preparado para controlar accesos el día de la celebración.',
    bulletPoints: [
      {
        title: 'Un servicio más para tus paquetes',
        description: 'Integra la operación digital sin desarrollar tu propia tecnología.'
      },
      {
        title: 'Una recepción más organizada',
        description: 'Tu equipo recibe información y accesos preparados para operar.'
      },
      {
        title: 'Una solución que puedes repetir',
        description: 'Utiliza el servicio evento tras evento.'
      },
      {
        title: 'Mejor tarifa con mayor volumen',
        description: 'Las condiciones mejoran conforme aumenta el número real de eventos operados.'
      }
    ],
    cta: 'Quiero ofrecerlo en mi salón',
    notice: 'La solicitud inicia una conversación comercial; no crea una cuenta ni asigna una tarifa automáticamente.'
  },
  faq: {
    title: 'Preguntas frecuentes',
    subtitle: 'Respuestas sobre el alcance comercial y operativo de InvitacionesPremium.',
    items: [
      {
        question: '¿Cómo se define el precio estándar?',
        answer: 'Por el servicio elegido y la capacidad del evento: hasta 50, 100 o 150 personas.'
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
        question: '¿Cómo funciona para salones y jardines?',
        answer:
          'Revisamos el volumen real de eventos para ofrecer condiciones comerciales. La solicitud no crea una cuenta automáticamente.'
      },
      {
        question: '¿Qué incluye Gestión de Invitados?',
        answer:
          'Incluye organización de accesos, mesas cuando aplican, equipo de recepción, control de entrada y reporte. No incluye formulario público de confirmación ni álbum.'
      },
      {
        question: '¿Cuáles son los límites por Evento?',
        answer: 'Cada evento admite como máximo 150 invitados y tres accesos activos para el equipo de recepción.'
      }
    ]
  },
  demo: {
    label: 'Recorrido visual',
    title: 'Mira cómo se vive un flujo digital',
    subtitle:
      'Explora una simulación de Invitación Digital o Invitación Premium desde la invitación hasta la recepción; las funciones varían según el servicio.',
    disclaimer: 'Esta demostración es un recorrido visual: no crea un evento ni genera accesos reales.',
    scenes: [
      {
        code: 'INVITATION',
        label: 'Invitación',
        title: 'Una primera impresión a la altura del Evento',
        description:
          'La Invitación Digital y la Invitación Premium presentan la información y acciones principales en una experiencia personalizada.'
      },
      {
        code: 'CONFIRMATION',
        label: 'Confirmación',
        title: 'Respuestas claras, sin perseguir mensajes',
        description:
          'En Invitación Digital e Invitación Premium, cada invitación concentra la asistencia y los acompañantes permitidos.'
      },
      {
        code: 'ACCESS',
        label: 'Acceso',
        title: 'Una recepción más ágil',
        description: 'El equipo usa los accesos preparados para registrar el ingreso de cada persona.'
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
    intro: 'Crea tu cuenta de Planner. El registro no asigna automáticamente condiciones Partner.',
    success: 'Tu cuenta fue creada. Inicia sesión para continuar con la configuración de tu perfil.'
  },
  cta: {
    title: 'Tu evento puede ser mucho más fácil de organizar.',
    description: 'Elige el camino que mejor describe lo que necesitas.',
    eventLabel: 'Estoy organizando un evento',
    primaryCta: 'Ver servicios y precios',
    plannerLabel: 'Soy Planner o agencia',
    secondaryCta: 'Quiero trabajar como Partner',
    venueLabel: 'Tengo un salón o jardín',
    venueLink: 'Quiero ofrecerlo en mis eventos'
  },
  footer: {
    copyright: `© 2026 ${productName}. Todos los derechos reservados.`,
    legalNotice: 'Gestión digital de invitados, desde la invitación hasta su llegada al evento.'
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
