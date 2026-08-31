import sharp from 'sharp';

export const demo = {
  eventId: 'a1100000-0000-4000-8000-000000000001',
  invitationToken: 'landing-demo-invitation',
  staffToken: 'st1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  invitationId: 'a1100000-0000-4000-8000-000000000002',
  pageIds: ['a1100000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000004'],
  assetIds: ['a1100000-0000-4000-8000-000000000005', 'a1100000-0000-4000-8000-000000000006'],
  tableIds: [
    'a1100000-0000-4000-8000-000000000010',
    'a1100000-0000-4000-8000-000000000011',
    'a1100000-0000-4000-8000-000000000012',
    'a1100000-0000-4000-8000-000000000013',
    'a1100000-0000-4000-8000-000000000014',
    'a1100000-0000-4000-8000-000000000015'
  ]
};

const iso = '2026-10-17T18:30:00.000-06:00';
const createdAt = '2026-08-31T12:00:00.000Z';
const assistantNames = ['Sofía Navarro', 'Daniel Ruiz', 'Mariana Torres', 'Emilio Vega', 'Lucía Herrera'];
const tableNames = ['Olivo', 'Magnolia', 'Encino', 'Lavanda', 'Jacaranda', 'Principal'];

export const user = {
  id: 'a1100000-0000-4000-8000-000000000020',
  email: 'planner-product-proof@example.invalid',
  role: 'INDEPENDENT_PLANNER',
  clientId: 'a1100000-0000-4000-8000-000000000021',
  clientType: 'PLANNER',
  clientStatus: 'ACTIVE'
};

export const event = {
  id: demo.eventId,
  clientId: user.clientId,
  createdByUserId: user.id,
  assignedPlannerUserId: user.id,
  serviceId: 'a1100000-0000-4000-8000-000000000022',
  serviceCode: 'FLIPBOOK',
  name: 'Boda de Elena & Mateo',
  socialType: 'WEDDING',
  status: 'ACTIVE',
  eventDateTime: iso,
  timeZone: 'America/Mexico_City',
  capacity: 100,
  confirmationEnabled: true,
  locationUrl: 'https://example.invalid/jardin-del-olivo',
  giftRegistryUrl: 'https://example.invalid/mesa-de-regalos',
  confirmationClosedAt: null,
  confirmationClosedByUserId: null,
  floorplanEnabled: true,
  commercialAuthorizedAt: createdAt,
  commercialPriceLockedAt: createdAt,
  commercialServicePriceId: 'a1100000-0000-4000-8000-000000000023',
  commercialBaseCostCredits: 350,
  commercialPromotionDiscountCredits: 0,
  commercialFinalCostCredits: 350,
  commercialChannelSnapshot: 'STANDARD',
  commercialCapacitySnapshot: 100,
  designKickoffAt: createdAt,
  commercialTermsValid: true,
  activatedAt: createdAt,
  activatedByUserId: user.id,
  activatedServiceId: 'a1100000-0000-4000-8000-000000000022',
  activatedServicePriceId: 'a1100000-0000-4000-8000-000000000023',
  baseCostCredits: 350,
  promotionDiscountCredits: 0,
  finalCostCredits: 350,
  purchasedCreditsUsed: 350,
  creditLineCreditsUsed: 0,
  creditUnitValueMxnCentsSnapshot: 2000,
  activationReceiptId: 'a1100000-0000-4000-8000-000000000024',
  activationIdempotencyKey: 'landing-product-proof-activation',
  createdAt,
  updatedAt: createdAt,
  deletedAt: null
};

export const contacts = assistantNames.map((name, index) => ({
  id: `a1100000-0000-4000-8000-00000000003${index}`,
  eventId: demo.eventId,
  groupId: index < 2 ? 'a1100000-0000-4000-8000-000000000040' : null,
  groupName: index < 2 ? 'Familia Navarro' : null,
  name,
  whatsappPhone: `+52 55 0000 010${index + 1}`,
  createdAt,
  updatedAt: createdAt
}));

export const invitations = contacts.map((contact, index) => ({
  id: index === 0 ? demo.invitationId : `a1100000-0000-4000-8000-00000000005${index}`,
  eventId: demo.eventId,
  contactId: contact.id,
  contactName: contact.name,
  mode: index === 0 ? 'FAMILY_NOMINAL' : 'INDIVIDUAL',
  responseStatus: index === 0 || index === 2 ? 'CONFIRMED' : 'PENDING',
  additionalAssistantLimit: index === 0 ? 1 : 0,
  invitationLink: `https://invitaciones.example.invalid/invitacion/elena-mateo-${index + 1}`,
  cancelledAt: null,
  assistants: [
    {
      id: `a1100000-0000-4000-8000-00000000006${index}`,
      eventId: demo.eventId,
      invitationId: index === 0 ? demo.invitationId : `a1100000-0000-4000-8000-00000000005${index}`,
      name: contact.name,
      isPrimary: true,
      responseStatus: index === 0 || index === 2 ? 'CONFIRMED' : 'PENDING',
      floorplanShapeId: index < demo.tableIds.length ? demo.tableIds[index] : null,
      createdAt,
      updatedAt: createdAt
    }
  ],
  createdAt,
  updatedAt: createdAt
}));

const tablePositions = [
  [0.1, 0.16],
  [0.36, 0.12],
  [0.65, 0.16],
  [0.16, 0.52],
  [0.45, 0.56],
  [0.72, 0.5]
];

export const floorplan = {
  id: 'a1100000-0000-4000-8000-000000000070',
  eventId: demo.eventId,
  image: {
    fileAssetId: 'a1100000-0000-4000-8000-000000000071',
    contentPath: `/api/v1/events/${demo.eventId}/file-assets/a1100000-0000-4000-8000-000000000071/content`
  },
  locked: true,
  lockedAt: createdAt,
  shapes: tableNames.map((name, index) => ({
    id: demo.tableIds[index],
    kind: 'TABLE',
    geometry: index === 5 ? 'RECTANGLE' : 'CIRCLE',
    name,
    capacity: index === 5 ? 10 : 8,
    occupancy: [6, 8, 5, 7, 4, 8][index],
    availableCapacity: [2, 0, 3, 1, 4, 2][index],
    x: tablePositions[index][0],
    y: tablePositions[index][1],
    width: index === 5 ? 0.18 : 0.13,
    height: 0.13,
    rotation: 0,
    polygonPoints: null
  })),
  createdAt,
  updatedAt: createdAt
};

export const seating = {
  items: [
    {
      assistantId: 'a1100000-0000-4000-8000-000000000080',
      name: 'Emilio Vega',
      invitation: { id: 'a1100000-0000-4000-8000-000000000081', eligibleAssistantCount: 2, assignedAssistantCount: 0 },
      group: {
        id: 'a1100000-0000-4000-8000-000000000082',
        name: 'Amigos',
        eligibleAssistantCount: 4,
        assignedAssistantCount: 2
      },
      table: null,
      checkedIn: false
    },
    {
      assistantId: 'a1100000-0000-4000-8000-000000000083',
      name: 'Lucía Herrera',
      invitation: { id: 'a1100000-0000-4000-8000-000000000084', eligibleAssistantCount: 1, assignedAssistantCount: 0 },
      group: null,
      table: null,
      checkedIn: false
    }
  ],
  summary: { unassignedCount: 2, selectedTable: null },
  nextCursor: null
};

export const publicInvitation = {
  status: 'AVAILABLE',
  event: { name: event.name, eventDateTime: iso, timeZone: event.timeZone },
  invitation: {
    id: demo.invitationId,
    mode: 'FAMILY_NOMINAL',
    responseStatus: 'PENDING',
    additionalAssistantLimit: 1,
    cancelled: false
  },
  confirmation: { open: true },
  assistants: [
    {
      id: 'a1100000-0000-4000-8000-000000000090',
      name: 'Sofía Navarro',
      isPrimary: true,
      responseStatus: 'PENDING'
    }
  ],
  designType: 'FLIPBOOK',
  design: {
    type: 'FLIPBOOK',
    pages: demo.pageIds.map((id, index) => ({
      id,
      position: index + 1,
      asset: {
        id: demo.assetIds[index],
        contentPath: `/api/v1/public/invitations/${demo.invitationToken}/assets/${demo.assetIds[index]}/content`
      }
    })),
    hotspots: [
      {
        id: 'a1100000-0000-4000-8000-000000000091',
        action: 'RSVP',
        destination: null,
        flipbookPageId: demo.pageIds[0],
        visualOwnerType: 'FLIPBOOK_PAGE',
        x: 0.2,
        y: 0.76,
        width: 0.6,
        height: 0.1,
        priority: 0
      }
    ]
  },
  qr: { available: false }
};

export const scannerSession = {
  status: 'AVAILABLE',
  staff: { alias: 'Acceso principal' },
  event: {
    id: demo.eventId,
    name: event.name,
    status: 'EVENT_DAY',
    eventDateTime: iso,
    timeZone: event.timeZone,
    floorplanEnabled: true
  }
};

const pendingAssistants = [
  {
    id: 'a1100000-0000-4000-8000-000000000100',
    name: 'Sofía Navarro',
    isPrimary: true,
    table: { id: demo.tableIds[0], name: 'Olivo' }
  },
  {
    id: 'a1100000-0000-4000-8000-000000000101',
    name: 'Daniel Ruiz',
    isPrimary: false,
    table: { id: demo.tableIds[0], name: 'Olivo' }
  }
];

export const scannerResult = {
  status: 'AVAILABLE',
  invitation: { id: demo.invitationId, mode: 'FAMILY_NOMINAL' },
  confirmedCount: 2,
  checkedInCount: 0,
  pendingCount: 2,
  pendingAssistants
};

export const scannerCheckIn = {
  status: 'CHECKED_IN',
  invitationId: demo.invitationId,
  checkedIn: pendingAssistants.map((assistant, index) => ({
    assistantId: assistant.id,
    checkInId: `a1100000-0000-4000-8000-00000000011${index}`,
    name: assistant.name,
    table: assistant.table,
    checkedInAt: '2026-10-18T00:31:00.000Z'
  })),
  remainingPendingAssistants: [],
  remainingPendingCount: 0
};

export function apiJson(pathname, method = 'GET') {
  const apiPath = pathname.replace(/^\/api\/v1/u, '');
  if (apiPath === '/auth/me') return user;
  if (apiPath === '/auth/login' && method === 'POST') return { user, expiresAt: '2026-10-18T08:00:00.000Z' };
  if (apiPath === `/events/${demo.eventId}`) return event;
  if (apiPath === `/events/${demo.eventId}/contacts`) return contacts;
  if (apiPath === `/events/${demo.eventId}/groups`)
    return [{ id: 'a1100000-0000-4000-8000-000000000082', name: 'Amigos' }];
  if (apiPath === `/events/${demo.eventId}/invitations`) return invitations;
  if (apiPath === `/events/${demo.eventId}/floorplan`) return floorplan;
  if (apiPath.startsWith(`/events/${demo.eventId}/seating`)) return seating;
  if (apiPath === `/public/invitations/${demo.invitationToken}`) return publicInvitation;
  if (apiPath === `/scanner/${demo.staffToken}/session`) return scannerSession;
  if (apiPath === `/scanner/${demo.staffToken}/search` && method === 'POST') {
    return { status: 'MATCHES', results: [scannerResult] };
  }
  if (apiPath === `/scanner/${demo.staffToken}/scan` && method === 'POST') return scannerResult;
  if (apiPath === `/scanner/${demo.staffToken}/check-in` && method === 'POST') return scannerCheckIn;
  if (apiPath === `/scanner/${demo.staffToken}/floorplan`) {
    return {
      floorplanId: floorplan.id,
      contentPath: '/api/v1/scanner/demo/floorplan/content',
      shapes: floorplan.shapes
    };
  }
  return undefined;
}

export async function createFixtureImages() {
  const pages = await Promise.all(
    [invitationPageOne(), invitationPageTwo()].map((svg) => sharp(Buffer.from(svg)).png().toBuffer())
  );
  const floorplanImage = await sharp(Buffer.from(floorplanSvg())).png().toBuffer();
  return { pages, floorplanImage };
}

function invitationPageOne() {
  return `
  <svg width="1200" height="1600" viewBox="0 0 1200 1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1600" fill="#101814"/>
    <circle cx="1050" cy="180" r="360" fill="#71806b" opacity=".22"/>
    <circle cx="110" cy="1420" r="300" fill="#a68b5b" opacity=".16"/>
    <path d="M890 0c-45 220-30 420 90 600M970 40c-130 190-170 400-110 610M0 1270c190-20 350 75 470 285" fill="none" stroke="#8fa083" stroke-width="12" opacity=".42"/>
    <text x="600" y="280" fill="#d4bd84" font-size="28" font-family="Arial" text-anchor="middle" letter-spacing="8">17 · OCTUBRE · 2026</text>
    <text x="600" y="640" fill="#f4efe3" font-size="118" font-family="Georgia" text-anchor="middle">Elena</text>
    <text x="600" y="750" fill="#d4bd84" font-size="54" font-family="Georgia" text-anchor="middle">&amp;</text>
    <text x="600" y="880" fill="#f4efe3" font-size="118" font-family="Georgia" text-anchor="middle">Mateo</text>
    <line x1="390" y1="980" x2="810" y2="980" stroke="#d4bd84" stroke-width="2"/>
    <text x="600" y="1060" fill="#cbd2c7" font-size="31" font-family="Arial" text-anchor="middle" letter-spacing="5">JARDÍN DEL OLIVO</text>
    <text x="600" y="1120" fill="#cbd2c7" font-size="25" font-family="Arial" text-anchor="middle" letter-spacing="3">6:30 P. M.</text>
    </svg>`;
}

function invitationPageTwo() {
  return `
  <svg width="1200" height="1600" viewBox="0 0 1200 1600" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1600" fill="#f2eee2"/>
    <path d="M0 0h330c60 250 20 500-130 720C80 900 40 1190 150 1600H0z" fill="#71806b" opacity=".2"/>
    <path d="M1200 0h-260c-90 250-80 550 70 760 130 190 160 530 55 840h135z" fill="#a68b5b" opacity=".18"/>
    <text x="600" y="300" fill="#8c7349" font-size="27" font-family="Arial" text-anchor="middle" letter-spacing="7">NUESTRO DÍA</text>
    <text x="600" y="540" fill="#111814" font-size="82" font-family="Georgia" text-anchor="middle">Ceremonia</text>
    <text x="600" y="615" fill="#475247" font-size="28" font-family="Arial" text-anchor="middle">Jardín del Olivo · 6:30 p. m.</text>
    <line x1="420" y1="720" x2="780" y2="720" stroke="#a68b5b" stroke-width="2"/>
    <text x="600" y="890" fill="#111814" font-size="82" font-family="Georgia" text-anchor="middle">Celebración</text>
    <text x="600" y="965" fill="#475247" font-size="28" font-family="Arial" text-anchor="middle">Cena y recepción · 8:00 p. m.</text>
    <text x="600" y="1230" fill="#8c7349" font-size="24" font-family="Arial" text-anchor="middle" letter-spacing="5">NOS ENCANTARÁ CELEBRAR CONTIGO</text>
  </svg>`;
}

function floorplanSvg() {
  return `
  <svg width="1400" height="900" viewBox="0 0 1400 900" xmlns="http://www.w3.org/2000/svg">
    <rect width="1400" height="900" fill="#ece8dc"/>
    <rect x="55" y="55" width="1290" height="790" rx="40" fill="#f8f6ef" stroke="#b9ae93" stroke-width="4"/>
    <rect x="520" y="310" width="360" height="250" rx="20" fill="#d8d2c1" stroke="#9e947c" stroke-width="3"/>
    <text x="700" y="445" fill="#6c6657" font-size="38" font-family="Arial" text-anchor="middle" letter-spacing="7">PISTA</text>
    <rect x="75" y="325" width="135" height="250" rx="10" fill="#71806b" opacity=".28"/>
    <text x="142" y="455" fill="#475247" font-size="25" font-family="Arial" text-anchor="middle" transform="rotate(-90 142 455)">ACCESO</text>
    <rect x="1050" y="90" width="230" height="105" rx="18" fill="#a68b5b" opacity=".24"/>
    <text x="1165" y="153" fill="#6d5937" font-size="25" font-family="Arial" text-anchor="middle">TERRAZA</text>
  </svg>`;
}
