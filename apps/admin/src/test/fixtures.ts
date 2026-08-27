import type {
  AdminClient,
  AdminClientUser,
  AdminEvent,
  AdminFinanceBalance,
  ApiClient,
  AuthUser
} from '@invitaciones/api-client';
import { vi } from 'vitest';

export const platformAdmin = {
  id: 'admin-1',
  email: 'platform@example.com',
  role: 'PLATFORM_ADMIN',
  clientId: null,
  clientType: null,
  clientStatus: null
} satisfies AuthUser;
export const plannerUser = {
  id: 'planner-user',
  email: 'planner@example.com',
  role: 'INDEPENDENT_PLANNER',
  clientId: 'client-a',
  clientType: 'PLANNER',
  clientStatus: 'ACTIVE'
} satisfies AuthUser;
export const organization = {
  id: 'client-a',
  name: 'Casa Aurora',
  type: 'ORGANIZATION',
  commercialChannel: null,
  status: 'ACTIVE',
  suspendedAt: null,
  suspensionReason: null,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z'
} satisfies AdminClient;
export const suspendedPlanner = {
  ...organization,
  id: 'client-b',
  name: 'Laura Eventos',
  type: 'PLANNER',
  status: 'SUSPENDED',
  suspendedAt: '2026-06-01T12:00:00.000Z',
  suspensionReason: 'Revision'
} satisfies AdminClient;
export const clientUser = {
  id: 'user-a',
  clientId: organization.id,
  email: 'admin@aurora.mx',
  role: 'ORGANIZATION_ADMIN',
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt
} satisfies AdminClientUser;
export const adminEvent = {
  id: 'event-a',
  clientId: organization.id,
  createdByUserId: clientUser.id,
  serviceId: 'service-a',
  serviceCode: 'FLYER',
  name: 'Boda Aurora',
  socialType: 'WEDDING',
  status: 'ACTIVE',
  eventDateTime: '2026-09-12T23:00:00.000Z',
  timeZone: 'America/Mexico_City',
  capacity: 120,
  confirmationEnabled: true,
  locationUrl: null,
  giftRegistryUrl: null,
  confirmationClosedAt: null,
  confirmationClosedByUserId: null,
  floorplanEnabled: false,
  commercialAuthorizedAt: '2026-07-15T12:00:00.000Z',
  commercialPriceLockedAt: '2026-07-15T12:00:00.000Z',
  commercialServicePriceId: 'price-a',
  commercialBaseCostCredits: 10,
  commercialPromotionDiscountCredits: 0,
  commercialFinalCostCredits: 10,
  commercialChannelSnapshot: 'STANDARD',
  commercialCapacitySnapshot: 120,
  designKickoffAt: '2026-07-16T12:00:00.000Z',
  commercialTermsValid: true,
  activatedAt: '2026-08-01T12:00:00.000Z',
  activatedByUserId: clientUser.id,
  activatedServiceId: 'service-a',
  activatedServicePriceId: 'price-a',
  baseCostCredits: 10,
  promotionDiscountCredits: 0,
  finalCostCredits: 10,
  purchasedCreditsUsed: 10,
  creditLineCreditsUsed: 0,
  creditUnitValueMxnCentsSnapshot: 2000,
  activationReceiptId: 'receipt-a',
  activationIdempotencyKey: 'hidden',
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt,
  deletedAt: null
} satisfies AdminEvent;
export const deletedEvent = {
  ...adminEvent,
  id: 'event-b',
  name: 'Evento eliminado',
  status: 'CLOSED',
  deletedAt: '2026-07-01T12:00:00.000Z'
} satisfies AdminEvent;
export const adminBalance = {
  clientId: organization.id,
  purchasedCredits: 18,
  debtCredits: 3,
  debtMxnCents: 6000,
  creditLine: {
    limitCredits: 20,
    usedCredits: 4,
    availableCredits: 16,
    status: 'ACTIVE',
    assignedAt: organization.createdAt,
    expiresAt: null,
    notes: null
  },
  lastLedgerSequence: '9',
  updatedAt: organization.updatedAt,
  reconciliation: {
    matchesLedger: true,
    purchasedCredits: 18,
    creditLineUsed: 4,
    debtCredits: 3,
    debtMxnCents: 6000,
    lastLedgerSequence: '9'
  }
} satisfies AdminFinanceBalance;

const mutationResult = {
  balance: adminBalance,
  movement: null,
  payment: null,
  receipt: {
    id: 'receipt-a',
    folio: '0001',
    clientId: organization.id,
    operationType: 'MANUAL_CREDIT_GRANT',
    operationReference: 'manual',
    createdAt: organization.updatedAt
  }
} as const;

type AdminTestApiClient = ApiClient & { adminAudit: NonNullable<ApiClient['adminAudit']> };

export function mockAdminApi(user: AuthUser = platformAdmin): AdminTestApiClient {
  return {
    auth: {
      login: vi.fn().mockResolvedValue({ user, expiresAt: '2026-08-03T00:00:00.000Z' }),
      logout: vi.fn().mockResolvedValue(undefined),
      me: vi.fn().mockResolvedValue(user)
    },
    adminClients: {
      list: vi.fn().mockResolvedValue([organization, suspendedPlanner]),
      get: vi.fn().mockResolvedValue(organization),
      createOrganization: vi.fn().mockResolvedValue({ client: organization, user: clientUser }),
      update: vi.fn().mockResolvedValue(organization),
      suspend: vi.fn().mockResolvedValue(suspendedPlanner),
      restore: vi.fn().mockResolvedValue(organization),
      listUsers: vi.fn().mockResolvedValue([clientUser]),
      createPlanner: vi.fn().mockResolvedValue(clientUser),
      updateUser: vi.fn().mockResolvedValue(clientUser)
    },
    adminEvents: {
      list: vi.fn().mockResolvedValue([adminEvent, deletedEvent]),
      get: vi.fn().mockResolvedValue(adminEvent),
      restore: vi.fn().mockResolvedValue(adminEvent)
    },
    adminEventPreparation: {
      getCommercialQuote: vi.fn().mockResolvedValue({
        quoteSource: 'LOCKED',
        eventId: adminEvent.id,
        clientId: adminEvent.clientId,
        clientName: organization.name,
        commercialChannel: 'STANDARD',
        serviceId: adminEvent.serviceId!,
        serviceCode: 'FLYER',
        capacity: adminEvent.capacity!,
        servicePriceId: 'price-a',
        capacityMin: 101,
        capacityMax: 150,
        venueTier: null,
        baseCostCredits: 10,
        promotionDiscountCredits: 0,
        finalCostCredits: 10,
        amountMxnCents: 20000,
        lockedServicePriceId: adminEvent.commercialServicePriceId,
        lockedBaseCostCredits: adminEvent.commercialBaseCostCredits,
        lockedPromotionDiscountCredits: adminEvent.commercialPromotionDiscountCredits,
        lockedFinalCostCredits: adminEvent.commercialFinalCostCredits,
        lockedAmountMxnCents: 20000,
        coverage: { purchasedCredits: 18, creditLineAvailableCredits: 16, totalAvailableCredits: 34, sufficient: true },
        authorizedAt: adminEvent.commercialAuthorizedAt,
        priceLockedAt: adminEvent.commercialPriceLockedAt,
        designKickoffAt: adminEvent.designKickoffAt,
        lockMatchesCurrentContext: true,
        customWorkExists: true
      }),
      authorizeCommercial: vi.fn(),
      startDesignKickoff: vi.fn(),
      requoteCommercial: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue(adminEvent),
      getDesign: vi.fn(),
      getReadiness: vi.fn().mockResolvedValue({ complete: false, blockers: [] }),
      createFlyer: vi.fn(),
      replaceFlyerInitial: vi.fn(),
      replaceFlyerQr: vi.fn(),
      createFlipbook: vi.fn(),
      addPage: vi.fn(),
      reorderPages: vi.fn(),
      replacePage: vi.fn(),
      removePage: vi.fn(),
      listHotspots: vi.fn().mockResolvedValue([]),
      createHotspot: vi.fn(),
      updateHotspot: vi.fn(),
      removeHotspot: vi.fn(),
      listInvitationAssets: vi.fn().mockResolvedValue([]),
      uploadInvitationAsset: vi.fn(),
      invitationAssetContent: vi.fn(),
      removeInvitationAsset: vi.fn(),
      getFloorplan: vi.fn(),
      createFloorplan: vi.fn(),
      replaceFloorplanImage: vi.fn(),
      listFloorplanAssets: vi.fn().mockResolvedValue([]),
      uploadFloorplanAsset: vi.fn(),
      floorplanAssetContent: vi.fn(),
      removeFloorplanAsset: vi.fn(),
      lockFloorplan: vi.fn(),
      createFloorplanShape: vi.fn(),
      updateFloorplanShape: vi.fn(),
      removeFloorplanShape: vi.fn(),
      unlockFloorplan: vi.fn(),
      listPilotObservations: vi.fn().mockResolvedValue({
        observations: [],
        summary: {
          preparationMinutesTotal: 0,
          invitationPreparationMinutes: 0,
          floorplanPreparationMinutes: 0,
          plannerSupportMinutes: 0,
          plannerSupportEntries: 0,
          incidents: 0,
          checkinIncidents: 0,
          lastMinuteChanges: 0,
          manualWorkMinutes: 0,
          manualWorkEntries: 0,
          guestCount: 0,
          tableCount: 0
        }
      }),
      createPilotObservation: vi.fn()
    },
    adminFinance: {
      balance: vi.fn().mockResolvedValue(adminBalance),
      assignCredits: vi.fn().mockResolvedValue(mutationResult),
      configureCreditLine: vi.fn().mockResolvedValue(mutationResult),
      manualPayment: vi.fn().mockResolvedValue(mutationResult),
      rebuildBalance: vi.fn().mockResolvedValue(mutationResult),
      dailyCut: vi.fn().mockResolvedValue({
        from: '2026-08-03T00:00:00.000Z',
        until: '2026-08-04T00:00:00.000Z',
        incomeMxnCents: 10000,
        creditsSold: 5,
        creditsGranted: 1,
        creditsConsumed: 3,
        creditsLent: 2,
        debtGeneratedCredits: 2,
        debtGeneratedMxnCents: 4000,
        debtPaidCredits: 1,
        debtPaidMxnCents: 2000,
        pendingDebtCredits: 1,
        pendingDebtMxnCents: 2000,
        pendingPurchasedCredits: 12,
        internalRefundCredits: 0,
        reversalCount: 0
      }),
      monthlyCut: vi.fn().mockResolvedValue({
        from: '2026-08-01T00:00:00.000Z',
        until: '2026-09-01T00:00:00.000Z',
        incomeMxnCents: 10000,
        creditsSold: 5,
        creditsGranted: 1,
        creditsConsumed: 3,
        creditsLent: 2,
        debtGeneratedCredits: 2,
        debtGeneratedMxnCents: 4000,
        debtPaidCredits: 1,
        debtPaidMxnCents: 2000,
        pendingDebtCredits: 1,
        pendingDebtMxnCents: 2000,
        pendingPurchasedCredits: 12,
        internalRefundCredits: 0,
        reversalCount: 0
      })
    },
    adminCatalog: {
      createService: vi.fn(),
      updateService: vi.fn(),
      listPrices: vi.fn().mockResolvedValue([]),
      createPrice: vi.fn(),
      closePrice: vi.fn(),
      listPromotions: vi.fn().mockResolvedValue([]),
      createPromotion: vi.fn(),
      updatePromotion: vi.fn(),
      activatePromotion: vi.fn(),
      deactivatePromotion: vi.fn()
    },
    adminReports: { list: vi.fn().mockResolvedValue([]), listEvent: vi.fn().mockResolvedValue([]) },
    adminAudit: { listAuditLogs: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) },
    events: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), activate: vi.fn() },
    finance: { balance: vi.fn(), movements: vi.fn(), receipts: vi.fn() },
    services: { listAvailable: vi.fn() },
    contacts: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      groups: vi.fn(),
      createGroup: vi.fn(),
      updateGroup: vi.fn(),
      template: vi.fn(),
      preview: vi.fn(),
      commit: vi.fn()
    },
    invitations: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      addAssistant: vi.fn(),
      updateAssistant: vi.fn(),
      removeAssistant: vi.fn()
    },
    fileAssets: { list: vi.fn(), get: vi.fn(), upload: vi.fn(), remove: vi.fn(), content: vi.fn() },
    design: {
      get: vi.fn(),
      readiness: vi.fn(),
      createFlyer: vi.fn(),
      replaceFlyerInitial: vi.fn(),
      replaceFlyerQr: vi.fn(),
      createFlipbook: vi.fn(),
      addPage: vi.fn(),
      reorderPages: vi.fn(),
      replacePage: vi.fn(),
      removePage: vi.fn(),
      hotspots: vi.fn(),
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
    physicalPasses: { list: vi.fn(), generate: vi.fn(), svg: vi.fn() },
    staffTokens: { list: vi.fn(), create: vi.fn() },
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
    publicAlbum: { resolve: vi.fn(), photo: vi.fn() },
    publicPricing: { list: vi.fn().mockResolvedValue([]) }
  };
}
