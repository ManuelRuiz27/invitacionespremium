export interface LandingEnvironment {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CLIENT_APP_URL?: string;
  readonly VITE_APP_URL?: string;
}

export interface LandingConfigOptions {
  readonly development: boolean;
}

const productName = 'InvitacionesPremium';
const seoTitle = `${productName} | Invitaciones digitales y control de acceso QR`;
const seoDescription =
  'Invitaciones digitales Flyer y Flipbook, confirmaciones RSVP, mesas y control de acceso QR. Servicios gestionados para planners, salones y jardines.';

const commercialContent = {
  brand: {
    name: productName,
    tagline: 'Invitaciones y operación de eventos.'
  },
  nav: [
    { label: 'Invitaciones', href: '#servicios' },
    { label: 'Precios', href: '#precios' },
    { label: 'Salones', href: '#venues' },
    { label: 'Cómo funciona', href: '#como-funciona' },
    { label: 'Para Planners', href: '#planners' },
    { label: 'FAQ', href: '#faq' }
  ],
  hero: {
    badge: 'Invitaciones digitales y operación gestionada',
    title: 'Invitaciones memorables. Accesos bajo control.',
    subtitle:
      'Diseñamos la invitación y preparamos la operación digital de tu evento: confirmaciones, mesas y acceso QR según el servicio que elijas.',
    primaryCta: 'Explorar invitaciones',
    secondaryCta: 'Soluciones para salones'
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
    title: 'Elige la experiencia que merece tu evento',
    subtitle:
      'Flyer y Flipbook con confirmación de asistencia, o control QR por evento sin invitación visual. Nuestro equipo prepara la parte técnica.',
    items: [
      {
        code: 'PHYSICAL_QR',
        name: 'QR / EventOps',
        description: 'Control de acceso por evento con pases físicos QR numerados, sin diseño de invitación.',
        features: [
          'Pases numerados de uso individual y único',
          'Mesas y croquis cuando aplica',
          'Accesos temporales para tu equipo de recepción',
          'Validación de ingreso con Scanner',
          'Sin RSVP público ni álbum'
        ]
      },
      {
        code: 'FLYER',
        name: 'Flyer digital',
        description: 'Una invitación personalizada conectada con toda la operación de tus invitados.',
        features: [
          'Diseño personalizado de dos piezas principales',
          'Confirmación RSVP y acompañantes',
          'Hasta dos rondas consolidadas de diseño',
          'Gestión de invitados',
          'Organización de mesas cuando aplica',
          'Accesos temporales para Staff',
          'Registro de entrada'
        ]
      },
      {
        code: 'FLIPBOOK',
        name: 'Flipbook Premium',
        description: 'Una experiencia visual tipo revista conectada con toda la operación de tus invitados.',
        features: [
          'Hasta 10 páginas',
          'Experiencia visual premium',
          'Confirmación RSVP y acompañantes',
          'Hasta dos rondas consolidadas de diseño',
          'Gestión de invitados',
          'Organización de mesas cuando aplica',
          'Accesos temporales para Staff',
          'Registro de entrada'
        ]
      }
    ]
  },
  pricing: {
    title: 'Precios por evento',
    subtitle: 'Compara el precio por evento para hasta 50, 100 o 150 personas.',
    note: 'MXN antes de IVA · Tarifas por evento según capacidad. Los planes para salones se cotizan por separado.'
  },
  howItWorks: {
    title: 'Nosotros preparamos. Tú organizas.',
    subtitle: 'Un equipo detrás de la tecnología, con un alcance definido para cada modalidad.',
    steps: [
      ['01', 'Cuéntanos qué necesitas', 'Revisamos invitaciones, control de acceso y capacidad de tu evento.'],
      ['02', 'Nosotros preparamos', 'Configuramos el evento y, cuando corresponde, diseñamos la invitación.'],
      [
        '03',
        'Tú organizas',
        'Gestionas invitados y RSVP en Flyer/Flipbook, o distribuyes pases en la modalidad anónima.'
      ],
      [
        '04',
        'Tu equipo recibe',
        'Tu personal valida los QR con conexión a internet y consulta el estado de los ingresos.'
      ]
    ]
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
    commercialCta: 'Demo para Planners',
    notice: 'La solicitud inicia una conversación comercial. No crea una cuenta ni activa servicios automáticamente.'
  },
  venue: {
    title: 'Tu salón recibe invitados. Nosotros preparamos la tecnología.',
    subtitle:
      'Evaluamos contigo una operación gestionada para tu salón o jardín: preparamos el evento y tu equipo distribuye pases QR numerados y valida cada ingreso.',
    bulletPoints: [
      {
        title: 'Pases QR de un solo uso',
        description: 'La modalidad anónima identifica folios, sin nombres de invitados ni confirmación RSVP.'
      },
      {
        title: 'Preparación técnica gestionada',
        description: 'Nuestro equipo configura el evento y el croquis cuando aplica; tu personal opera la recepción.'
      },
      {
        title: 'Visibilidad de tu operación',
        description: 'Consulta pases vigentes, utilizados y pendientes, y su distribución por mesas cuando aplica.'
      }
    ],
    cta: 'Solicitar propuesta para mi salón',
    pricingNotice: 'Planes gestionados bajo cotización. Revisamos capacidad, preparación y condiciones contigo.',
    notice:
      'Estamos coordinando demostraciones y propuestas. La activación en eventos presenciales está sujeta a las validaciones operativas finales.',
    proofCaption:
      'Imágenes de demostración del flujo digital con invitados; los pases anónimos se consultan por folio.',
    personalization: {
      title: 'Tu identidad. Tu experiencia digital.',
      description:
        'Podemos evaluar un proyecto de interfaz exclusiva con tu identidad visual y dominio o subdominio propio, conectado a la plataforma central de InvitacionesPremium.',
      notice:
        'Desarrollo a medida sujeto a alcance, plazo y cotización por separado. Su disponibilidad se acuerda antes de contratar; no incluye un backend dedicado.',
      cta: 'Cotizar interfaz exclusiva',
      inquiry: 'Me interesa cotizar una interfaz exclusiva para mi salón, con identidad visual y dominio propio.'
    }
  },
  faq: {
    title: 'Preguntas frecuentes',
    subtitle: 'Invitaciones por evento, propuestas para salones y preparación gestionada.',
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
          'El Planner habilita accesos temporales para su equipo. En Flyer/Flipbook se consulta la invitación y se registra la entrada de asistentes; con pases anónimos se valida el folio y su uso, sin identificar personas.'
      },
      {
        question: '¿Puedo crear una cuenta y preparar eventos por mi cuenta?',
        answer:
          'No en el lanzamiento M01 actual. El autoservicio se conserva como capacidad futura; el alta y la preparación se realizan hoy como parte del servicio gestionado.'
      },
      {
        question: '¿Qué diferencia hay entre Flyer y Flipbook?',
        answer:
          'Flyer incluye dos piezas gráficas principales; Flipbook ofrece hasta diez páginas. Ambos incluyen confirmación RSVP, acceso QR y hasta dos rondas consolidadas de diseño.'
      },
      {
        question: '¿Los pases QR anónimos identifican a mis invitados?',
        answer:
          'No. Identifican un folio único y su estado de uso, sin registrar el nombre de una persona ni requerir RSVP. Esta propuesta para salones se cotiza por separado de las invitaciones digitales.'
      },
      {
        question: '¿Ya puedo activar el servicio para mi salón?',
        answer:
          'Puedes solicitar una demostración y una propuesta. El inicio de la operación presencial está sujeto a las validaciones operativas finales y a la aprobación de lanzamiento.'
      },
      {
        question: '¿Puedo usar mi dominio y colores?',
        answer:
          'Se puede evaluar una interfaz exclusiva como proyecto de desarrollo aparte, conectada a la misma plataforma central. El alcance, el plazo y la disponibilidad se acuerdan en la cotización.'
      },
      {
        question: '¿Funciona sin internet?',
        answer: 'La validación de ingreso requiere conexión con el servidor. No ofrecemos operación offline.'
      },
      {
        question: '¿Cómo se contrata?',
        answer:
          'Solicita una propuesta para Planners o para tu salón. Revisamos capacidad, modalidad y alcance; la solicitud no crea una cuenta ni activa servicios automáticamente.'
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
    title: 'Hablemos de tu próximo evento.',
    description:
      'Cuéntanos si trabajas como Planner o si buscas una solución para tu salón. Nuestro equipo te ayuda a definir el alcance.',
    primaryCta: 'Demo para Planners',
    secondaryCta: 'Solicitar propuesta para mi salón'
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
