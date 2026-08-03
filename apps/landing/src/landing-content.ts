const getClientAppUrl = (): string => {
  const envUrl = import.meta.env.VITE_CLIENT_APP_URL;
  return envUrl && envUrl.trim().length > 0 ? envUrl : 'http://localhost:5173';
};

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  return envUrl && envUrl.trim().length > 0 ? envUrl : 'http://localhost:3000/api/v1';
};

export const landingContent = {
  brand: {
    name: 'InvitacionesPremium',
    fullName: 'InvitacionesPremium bt Soft-Monky',
    tagline: 'Plataforma SaaS de operación digital para Eventos privados.'
  },
  urls: {
    clientApp: getClientAppUrl(),
    login: `${getClientAppUrl()}/login`,
    registerPlannerApi: `${getApiBaseUrl()}/clients/register-planner`
  },
  nav: [
    { label: 'Servicios', href: '#servicios' },
    { label: 'Demo', href: '#demo' },
    { label: 'Precios', href: '#precios' },
    { label: 'Planners', href: '#planners' },
    { label: 'Organizaciones', href: '#organizaciones' },
    { label: 'Preguntas Frecuentes', href: '#faq' }
  ],
  hero: {
    badge: 'Plataforma SaaS para Planners y Organizaciones',
    title: 'Operación digital completa para Eventos privados',
    subtitle:
      'InvitacionesPremium no es solo un diseñador de invitaciones. Es una plataforma integral para administrar Confirmación nominal de asistencia, croquis de mesas, control de acceso QR en puerta por Asistente, Staff por token, reportes y Álbum post-evento.',
    primaryCta: 'Registrarme como Planner',
    secondaryCta: 'Iniciar sesión'
  },
  problem: {
    title: 'El problema de la gestión tradicional de eventos',
    subtitle: 'Métodos manuales que provocan descontrol en la recepción y fallas operativas.',
    items: [
      {
        title: 'Confirmaciones caóticas',
        description:
          'Mensajes dispersos de WhatsApp y listas manuales sin trazabilidad ni control nominal de acompañantes.'
      },
      {
        title: 'Largas filas en recepción',
        description: 'Búsquedas manuales en papel que ralentizan el ingreso y generan fricción entre los invitados.'
      },
      {
        title: 'Sin visibilidad en tiempo real',
        description: 'Imposibilidad de saber cuántos asistentes reales han ingresado ni en qué mesa están ubicados.'
      }
    ]
  },
  solution: {
    title: 'Solución integral de operación digital',
    subtitle: 'Control preciso desde la distribución de la invitación hasta el archivo del evento.',
    ruleNotice: 'Regla de acceso: QR por Invitación; check-in individual por Asistente.',
    pillars: [
      {
        title: 'Confirmación de asistencia nominal',
        description: 'El contacto registra nombre y apellido de cada asistente nominal asignado a su invitación.'
      },
      {
        title: 'Acceso QR en puerta por Asistente',
        description:
          'La invitación genera un QR único. En puerta, el Staff escanea y registra el check-in individual por Asistente.'
      },
      {
        title: 'Croquis y asignación de mesas',
        description: 'Diseño visual del recinto con capacidad de mesa controlada y asignación individual o familiar.'
      },
      {
        title: 'Staff por token sin login',
        description: 'Accesos temporales seguros para hasta 3 receptores en puerta con escáner e información acotada.'
      },
      {
        title: 'Álbum post-evento y reportes PDF',
        description:
          'Galería de fotos post-evento para invitaciones elegibles con vigencia de 30 días y reportes operativos.'
      }
    ]
  },
  services: {
    title: 'Catálogo de servicios contratados',
    subtitle: 'Elige la modalidad que mejor se adapte a las necesidades de tu evento.',
    items: [
      {
        code: 'FLIPBOOK',
        name: 'Flipbook',
        description: 'Invitación digital interactiva multipágina estilo revista.',
        features: [
          'Hasta 10 páginas continuas de diseño',
          'Confirmación nominal de asistencia',
          'Croquis y asignación de mesas opcional',
          'QR por Invitación; check-in por Asistente',
          'Álbum post-evento (hasta 35 fotos, 30 días vigencia)'
        ],
        plannerCredits: 30,
        organizationCredits: 27
      },
      {
        code: 'FLYER',
        name: 'Flyer',
        description: 'Invitación digital ejecutiva de una sola página.',
        features: [
          '1 página de diseño visual con Hotspots',
          'Confirmación nominal de asistencia',
          'Croquis y asignación de mesas opcional',
          'QR por Invitación; check-in por Asistente',
          'Álbum post-evento (hasta 35 fotos, 30 días vigencia)'
        ],
        plannerCredits: 20,
        organizationCredits: 17
      },
      {
        code: 'PHYSICAL_QR',
        name: 'QR Pase Físico',
        description: 'Lotes de pases impresos para control de acceso directo en puerta.',
        features: [
          'Pases individuales impresos o digitales',
          'QR de un solo uso en puerta',
          'Asignación a mesa si el evento usa Croquis',
          'Sin Contactos, Confirmación nominal ni Álbum'
        ],
        plannerCredits: 15,
        organizationCredits: 10
      },
      {
        code: 'DEMO',
        name: 'Demo',
        description: 'Modalidad de prueba para conocer la plataforma.',
        features: [
          'Sin consumo de créditos',
          'No activa un Evento real',
          'No genera StaffTokens ni envía invitaciones reales',
          'Exclusivamente con datos demostrativos'
        ],
        plannerCredits: 0,
        organizationCredits: 0
      }
    ]
  },
  pricing: {
    title: 'Matriz de precios por tarifa de crédito',
    subtitle: 'Valor unitario de referencia: $20 MXN (2,000 centavos) por crédito.',
    unitValueMxn: 20,
    planner: {
      title: 'Planner independiente',
      description: 'Registro público desde landing. Compra directa de créditos para operar eventos propios.',
      rates: [
        { service: 'Flipbook', credits: 30, mxn: 600 },
        { service: 'Flyer', credits: 20, mxn: 400 },
        { service: 'QR Pase Físico', credits: 15, mxn: 300 }
      ]
    },
    organization: {
      title: 'Organización',
      description:
        'Alta exclusiva por Platform Admin. Tarifa preferencial para salones, jardines, agencias y empresas.',
      rates: [
        { service: 'Flipbook', credits: 27, mxn: 540 },
        { service: 'Flyer', credits: 17, mxn: 340 },
        { service: 'QR Pase Físico', credits: 10, mxn: 200 }
      ]
    }
  },
  planners: {
    title: 'Información para Planners independientes',
    subtitle: 'Gestiona la operación digital de tus clientes con total independencia.',
    bulletPoints: [
      'Registro público inmediato como Planner independiente.',
      'Compra de créditos según las necesidades de tus eventos.',
      'Configuración de invitaciones, confirmación nominal y mesas.',
      'Entrega de StaffTokens temporales para recepción en puerta.'
    ],
    cta: 'Registrarme como Planner'
  },
  organizations: {
    title: 'Información para Organizaciones',
    subtitle: 'Agencias, salones de eventos, jardines y empresas.',
    notice: 'Las Organizaciones son creadas exclusivamente por Platform Admin.',
    roles: [
      {
        name: 'Admin de Organización',
        description:
          'Gestiona la contratación, compra de créditos, consulta de línea de crédito/deuda y puede crear Planners internos.'
      },
      {
        name: 'Planner de Organización',
        description:
          'Usuario interno que crea y opera únicamente sus eventos asignados. No gestiona compras ni ve datos financieros.'
      }
    ]
  },
  faq: {
    title: 'Preguntas Frecuentes',
    subtitle: 'Respuestas a las dudas más comunes sobre la operación del sistema.',
    items: [
      {
        question: '¿Qué es un crédito y cómo se utiliza?',
        answer:
          'Un crédito es la unidad entera interna usada para activar Eventos. El costo en créditos depende del servicio contratado (Flipbook, Flyer o QR pase físico) y del tipo de Cliente (Planner independiente u Organización).'
      },
      {
        question: '¿Cómo funciona la regla de QR e ingreso en puerta?',
        answer:
          'El QR pertenece a la Invitación y se genera únicamente después de haber confirmado asistencia. Sin embargo, el check-in en puerta se registra individualmente por cada Asistente nominal.'
      },
      {
        question: '¿Quiénes pueden registrarse públicamente en la plataforma?',
        answer:
          'Únicamente los Planners independientes pueden registrarse públicamente desde la landing. Las Organizaciones son creadas exclusivamente por Platform Admin.'
      },
      {
        question: '¿Cuáles son los límites operativos del MVP por evento?',
        answer:
          'Cada evento admite hasta 150 Contactos/Invitaciones activas y un máximo de 3 StaffTokens activos simultáneamente para el personal de recepción.'
      },
      {
        question: '¿Cuánto tiempo permanece disponible el Álbum post-evento?',
        answer:
          'El Álbum tiene una vigencia pública de 30 días a partir de su publicación para invitaciones elegibles. Cumplidos los 30 días, el evento se archiva automáticamente.'
      }
    ]
  },
  footer: {
    copyright: '© 2026 InvitacionesPremium bt Soft-Monky. Todos los derechos reservados.',
    legalNotice: 'Plataforma SaaS para administración y operación digital de eventos.'
  }
} as const;
