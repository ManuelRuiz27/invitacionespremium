export interface LandingEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLIENT_APP_URL?: string;
  readonly VITE_APP_URL?: string;
}

export interface LandingConfigOptions {
  readonly development: boolean;
}

const productName = 'InvitacionesPremium';
const seoTitle = `${productName} — Gestión digital de invitados para Planners`;
const seoDescription =
  'InvitacionesPremium prepara la operación digital del evento para que el Planner gestione invitaciones, confirmaciones, mesas y accesos.';

const commercialContent = {
  brand: {
    name: productName,
    tagline: 'Gestión digital de invitados para Planners.'
  },
  nav: [
    { label: 'Producto', href: '#producto' },
    { label: 'Cómo funciona', href: '#como-funciona' },
    { label: 'Servicios', href: '#servicios' },
    { label: 'Para Planners', href: '#planners' },
    { label: 'FAQ', href: '#faq' }
  ],
  hero: {
    badge: 'Servicio gestionado para Planners',
    title: 'Tú organizas el evento. Nosotros preparamos la operación digital.',
    subtitle:
      'Te entregamos un evento listo para trabajar para que gestiones invitados, confirmaciones, mesas y accesos sin encargarte de la configuración técnica.',
    primaryCta: 'Ver cómo funciona',
    secondaryCta: 'Conocer los servicios'
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
        title: 'Una operación conectada hasta el cierre',
        description: 'Invitados, confirmaciones, mesas y accesos permanecen dentro del mismo flujo operativo.'
      }
    ]
  },
  services: {
    title: 'Tres formas de acompañar a tus invitados',
    subtitle:
      'La experiencia de invitación puede cambiar; la gestión de invitados, mesas y accesos permanece conectada.',
    items: [
      {
        code: 'PHYSICAL_QR',
        name: 'Gestión de Invitados',
        description:
          'Para eventos que ya cuentan con su propia invitación y necesitan ordenar invitados, mesas y acceso.',
        features: [
          'Gestión de invitados y acompañantes',
          'Organización de mesas cuando aplica',
          'Accesos temporales para tu equipo de recepción',
          'Búsqueda y registro de entrada',
          'No incluye formulario público de confirmación'
        ]
      },
      {
        code: 'FLYER',
        name: 'Invitación Digital',
        description: 'Una invitación personalizada conectada con toda la operación de tus invitados.',
        features: [
          'Invitación digital preparada por nuestro equipo',
          'Confirmaciones y acompañantes',
          'Gestión de invitados',
          'Organización de mesas',
          'Accesos temporales para Staff',
          'Registro de entrada'
        ]
      },
      {
        code: 'FLIPBOOK',
        name: 'Invitación Premium',
        description: 'Una experiencia visual tipo revista conectada con toda la operación de tus invitados.',
        features: [
          'Hasta 10 páginas',
          'Experiencia visual premium',
          'Confirmaciones y acompañantes',
          'Gestión de invitados',
          'Organización de mesas',
          'Accesos temporales para Staff',
          'Registro de entrada'
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
    title: 'Nosotros preparamos. Tú operas el evento.',
    subtitle:
      'InvitacionesPremium deja lista la parte técnica. Tú decides quién asiste, revisas confirmaciones, organizas mesas y habilitas a tu equipo de recepción.',
    bulletPoints: [
      {
        title: 'Preparación técnica incluida',
        description: 'Configuramos la experiencia digital y la estructura necesaria antes de entregarte el evento.'
      },
      {
        title: 'Tus decisiones siguen siendo tuyas',
        description: 'Tú controlas invitados, acompañantes, confirmaciones y distribución en mesas.'
      },
      {
        title: 'Acceso listo para tu equipo',
        description: 'Creas accesos temporales para que tu Staff opere únicamente ese evento.'
      }
    ],
    commercialCta: 'Solicitar una demo',
    notice: 'La solicitud inicia una conversación comercial. No crea una cuenta ni activa servicios automáticamente.'
  },
  venue: {
    title: 'Soluciones para salones y jardines',
    subtitle:
      'Esta modalidad se evalúa de forma comercial y no forma parte del lanzamiento M01 Managed para Planner independiente.',
    bulletPoints: [
      {
        title: 'Mismo núcleo operativo',
        description: 'La modalidad futura reutiliza la gestión de invitados, mesas y acceso del producto.'
      },
      {
        title: 'Organización y ownership explícitos',
        description: 'Cualquier extensión debe conservar los roles y límites definidos para Organizaciones.'
      },
      {
        title: 'Sin capacidad implícita por volumen',
        description: 'El volumen comercial no habilita permisos ni funciones adicionales por sí solo.'
      }
    ],
    cta: 'Hablar con nuestro equipo',
    notice: 'Esta modalidad no forma parte de la landing activa M01.'
  },
  faq: {
    title: 'Preguntas frecuentes',
    subtitle: 'Respuestas sobre el servicio Managed que hoy ofrecemos a Planners independientes.',
    items: [
      {
        question: '¿Qué prepara InvitacionesPremium?',
        answer:
          'Preparamos la parte técnica del evento: la experiencia digital, la invitación cuando aplica y la estructura necesaria para que puedas operar invitados, mesas y accesos.'
      },
      {
        question: '¿Qué administra el Planner?',
        answer:
          'El Planner mantiene invitados y acompañantes, distribuye invitaciones, revisa confirmaciones, organiza personas en mesas y crea accesos temporales para su Staff.'
      },
      {
        question: '¿Necesito configurar toda la plataforma?',
        answer:
          'No. El lanzamiento actual es un servicio gestionado: InvitacionesPremium prepara el evento y te lo entrega listo para la operación.'
      },
      {
        question: '¿Cómo funciona el acceso el día del evento?',
        answer:
          'El Planner habilita accesos temporales para su equipo. Staff puede buscar o escanear, identificar a los asistentes y registrar su entrada únicamente dentro de ese evento.'
      },
      {
        question: '¿Puedo crear una cuenta y preparar eventos por mi cuenta?',
        answer:
          'No en el lanzamiento M01 actual. El autoservicio se conserva como capacidad futura; el alta y la preparación se realizan hoy como parte del servicio gestionado.'
      },
      {
        question: '¿Cómo se contrata?',
        answer:
          'La contratación se acuerda directamente con InvitacionesPremium. En esta fase no dependemos de compra de créditos, checkout ni pagos automáticos dentro de la plataforma.'
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
    title: 'Registro de Planner',
    intro: 'El alta de Planner forma parte actualmente del proceso comercial de InvitacionesPremium.',
    success: 'Tu cuenta fue creada. Inicia sesión para continuar.'
  },
  cta: {
    title: '¿Organizas eventos y quieres operar invitados sin cargar con la parte técnica?',
    description:
      'Solicita una demo del flujo Managed y revisa cómo InvitacionesPremium prepara el evento para que tú puedas operarlo.',
    primaryCta: 'Solicitar una demo'
  },
  footer: {
    copyright: `© 2026 ${productName}. Todos los derechos reservados.`,
    legalNotice: 'Servicio gestionado de invitados, confirmaciones, mesas y accesos para eventos.'
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
