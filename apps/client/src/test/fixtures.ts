import type {
  ApiClient,
  AuthUser,
  Event,
  FinanceBalance,
  LedgerMovement,
  LoginResult,
  Receipt
} from '@invitaciones/api-client';
import { vi } from 'vitest';

export const independentUser = {
  id: '0671cde3-18cf-4d47-b960-1fd2de185e53',
  email: 'planner@example.com',
  role: 'INDEPENDENT_PLANNER',
  clientId: '7ae8117e-22df-41a8-8cbc-64778ea1a3b1',
  clientType: 'PLANNER',
  clientStatus: 'ACTIVE'
} satisfies AuthUser;

export const organizationAdmin = {
  ...independentUser,
  email: 'admin@organizacion.mx',
  role: 'ORGANIZATION_ADMIN',
  clientType: 'ORGANIZATION'
} satisfies AuthUser;

export const organizationPlanner = {
  ...independentUser,
  email: 'planner@organizacion.mx',
  role: 'ORGANIZATION_PLANNER',
  clientType: 'ORGANIZATION'
} satisfies AuthUser;

export const platformAdmin = {
  ...independentUser,
  email: 'platform@example.com',
  role: 'PLATFORM_ADMIN',
  clientId: null,
  clientType: null,
  clientStatus: null
} satisfies AuthUser;

export const configuredEvent = {
  id: 'ac1c081a-3893-47ce-a63d-aa2d33bf57e1',
  clientId: independentUser.clientId,
  createdByUserId: independentUser.id,
  serviceId: null,
  serviceCode: null,
  name: 'Boda de Ana y Luis',
  socialType: 'WEDDING',
  status: 'CONFIGURED',
  eventDateTime: '2026-01-01T02:00:00.000Z',
  timeZone: 'America/Mexico_City',
  capacity: 120,
  confirmationEnabled: false,
  locationUrl: null,
  giftRegistryUrl: null,
  confirmationClosedAt: null,
  confirmationClosedByUserId: null,
  floorplanEnabled: false,
  activatedAt: null,
  activatedByUserId: null,
  activatedServiceId: null,
  activatedServicePriceId: null,
  baseCostCredits: null,
  promotionDiscountCredits: null,
  finalCostCredits: null,
  purchasedCreditsUsed: null,
  creditLineCreditsUsed: null,
  creditUnitValueMxnCentsSnapshot: null,
  activationReceiptId: null,
  activationIdempotencyKey: null,
  createdAt: '2025-12-10T18:00:00.000Z',
  updatedAt: '2026-01-01T02:00:00.000Z',
  deletedAt: null
} satisfies Event;

export const activeEvent = {
  ...configuredEvent,
  id: '870f8084-c546-445c-8516-f84a41237028',
  name: 'Cumpleaños de Sofía',
  socialType: 'BIRTHDAY',
  status: 'ACTIVE'
} satisfies Event;

export const financeBalance = {
  clientId: independentUser.clientId,
  purchasedCredits: 18,
  debtCredits: 3,
  debtMxnCents: 6000,
  creditLine: {
    limitCredits: 20,
    usedCredits: 4,
    availableCredits: 16,
    status: 'ACTIVE',
    assignedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    notes: null
  },
  lastLedgerSequence: '9',
  updatedAt: '2026-07-30T18:00:00.000Z',
  reconciliation: {
    matchesLedger: true,
    purchasedCredits: 18,
    creditLineUsed: 4,
    debtCredits: 3,
    debtMxnCents: 6000,
    lastLedgerSequence: '9'
  }
} satisfies FinanceBalance;

export const movement = {
  id: '18cb65a9-c912-4568-9cf5-8ec51230a559',
  sequence: '9',
  clientId: independentUser.clientId,
  movementType: 'CREDIT_PURCHASE',
  purchasedCreditDelta: 18,
  creditLineUsedDelta: 0,
  debtDelta: 0,
  cashMxnDelta: 36000,
  creditUnitValueMxnCentsSnapshot: 2000,
  currency: 'MXN',
  operationReference: 'purchase-1',
  paymentId: null,
  receiptId: '39d14909-3c17-4fb1-9fb2-f7ed52c44019',
  dueAt: null,
  allocationMetadata: null,
  metadata: null,
  createdAt: '2026-07-30T18:00:00.000Z'
} satisfies LedgerMovement;

export const receipt = {
  id: '39d14909-3c17-4fb1-9fb2-f7ed52c44019',
  folio: '000009',
  clientId: independentUser.clientId,
  operationType: 'CREDIT_PURCHASE',
  operationReference: 'purchase-1',
  createdAt: '2026-07-30T18:00:00.000Z'
} satisfies Receipt;

export function loginResult(user: AuthUser): LoginResult {
  return { user, expiresAt: '2026-07-31T18:00:00.000Z' };
}

export function mockApiClient(user: AuthUser = independentUser): ApiClient {
  return {
    auth: {
      login: vi.fn().mockResolvedValue(loginResult(user)),
      logout: vi.fn().mockResolvedValue(undefined),
      me: vi.fn().mockResolvedValue(user)
    },
    adminClients: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      createOrganization: vi.fn(),
      update: vi.fn(),
      suspend: vi.fn(),
      restore: vi.fn(),
      listUsers: vi.fn().mockResolvedValue([]),
      createPlanner: vi.fn(),
      updateUser: vi.fn()
    },
    adminEvents: { list: vi.fn().mockResolvedValue([]), get: vi.fn(), restore: vi.fn() },
    adminFinance: {
      balance: vi.fn(),
      assignCredits: vi.fn(),
      configureCreditLine: vi.fn(),
      manualPayment: vi.fn(),
      rebuildBalance: vi.fn(),
      dailyCut: vi.fn(),
      monthlyCut: vi.fn()
    },
    adminCatalog: {
      createService: vi.fn(),
      updateService: vi.fn(),
      listPrices: vi.fn(),
      createPrice: vi.fn(),
      closePrice: vi.fn(),
      listPromotions: vi.fn(),
      createPromotion: vi.fn(),
      updatePromotion: vi.fn(),
      activatePromotion: vi.fn(),
      deactivatePromotion: vi.fn()
    },
    adminReports: { list: vi.fn(), listEvent: vi.fn() },
    adminAudit: { listAuditLogs: vi.fn() },
    events: {
      list: vi.fn().mockResolvedValue([configuredEvent, activeEvent]),
      get: vi.fn().mockResolvedValue(configuredEvent),
      create: vi.fn().mockResolvedValue(configuredEvent),
      update: vi.fn().mockResolvedValue(configuredEvent),
      activate: vi.fn().mockResolvedValue({ event: activeEvent })
    },
    finance: {
      balance: vi.fn().mockResolvedValue(financeBalance),
      movements: vi.fn().mockResolvedValue([movement]),
      receipts: vi.fn().mockResolvedValue([receipt])
    },
    services: {
      listAvailable: vi.fn().mockResolvedValue([
        { id: 'service-flyer', code: 'FLYER', credits: 5, validFrom: '2026-01-01T00:00:00.000Z', validUntil: null },
        {
          id: 'service-physical',
          code: 'PHYSICAL_QR',
          credits: 3,
          validFrom: '2026-01-01T00:00:00.000Z',
          validUntil: null
        }
      ])
    },
    contacts: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      groups: vi.fn().mockResolvedValue([]),
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      template: vi.fn(),
      preview: vi.fn(),
      commit: vi.fn()
    },
    invitations: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      update: vi.fn(),
      addAssistant: vi.fn(),
      updateAssistant: vi.fn(),
      removeAssistant: vi.fn()
    },
    fileAssets: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
      content: vi.fn()
    },
    design: {
      get: vi.fn(),
      readiness: vi.fn().mockResolvedValue({ complete: true, blockers: [], designType: 'FLYER' }),
      createFlyer: vi.fn(),
      replaceFlyerInitial: vi.fn(),
      replaceFlyerQr: vi.fn(),
      createFlipbook: vi.fn(),
      addPage: vi.fn(),
      reorderPages: vi.fn(),
      replacePage: vi.fn(),
      removePage: vi.fn(),
      hotspots: vi.fn().mockResolvedValue([]),
      createHotspot: vi.fn(),
      updateHotspot: vi.fn(),
      removeHotspot: vi.fn()
    },
    floorplan: {
      get: vi.fn(),
      seating: vi.fn(),
      assign: vi.fn(),
      assignFamily: vi.fn(),
      assignGroup: vi.fn(),
      updateSeating: vi.fn(),
      setImage: vi.fn(),
      replaceImage: vi.fn(),
      addShape: vi.fn(),
      updateShape: vi.fn(),
      removeShape: vi.fn(),
      lock: vi.fn(),
      unlock: vi.fn()
    },
    physicalPasses: { list: vi.fn().mockResolvedValue([]), generate: vi.fn(), svg: vi.fn() },
    scanner: {
      getSession: vi.fn(),
      scan: vi.fn(),
      search: vi.fn(),
      checkIn: vi.fn(),
      scanPhysicalPass: vi.fn(),
      getFloorplan: vi.fn()
    },
    publicInvitation: {
      resolve: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
      updateAssistants: vi.fn(),
      asset: vi.fn(),
      qr: vi.fn()
    },
    publicAlbum: { resolve: vi.fn(), photo: vi.fn() }
  };
}
