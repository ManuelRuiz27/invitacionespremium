import type { components } from '../generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from '../api-client';

export type AdminService = components['schemas']['ServiceResponseDto'];
export type CreateAdminServiceInput = components['schemas']['CreateServiceRequestDto'];
export type UpdateAdminServiceInput = components['schemas']['UpdateServiceRequestDto'];
export type AdminPrice = components['schemas']['PriceResponseDto'];
export type CreateAdminPriceInput = components['schemas']['CreatePriceRequestDto'];
export type CloseAdminPriceInput = components['schemas']['ClosePriceRequestDto'];
export type AdminPromotion = components['schemas']['PromotionResponseDto'];
export type CreateAdminPromotionInput = components['schemas']['CreatePromotionRequestDto'];
export type UpdateAdminPromotionInput = components['schemas']['UpdatePromotionRequestDto'];

export interface AdminCatalogClient {
  createService(input: CreateAdminServiceInput, signal?: AbortSignal): Promise<AdminService>;
  updateService(serviceId: string, input: UpdateAdminServiceInput, signal?: AbortSignal): Promise<AdminService>;
  listPrices(signal?: AbortSignal): Promise<AdminPrice[]>;
  createPrice(input: CreateAdminPriceInput, signal?: AbortSignal): Promise<AdminPrice>;
  closePrice(priceId: string, input: CloseAdminPriceInput, signal?: AbortSignal): Promise<AdminPrice>;
  listPromotions(signal?: AbortSignal): Promise<AdminPromotion[]>;
  createPromotion(input: CreateAdminPromotionInput, signal?: AbortSignal): Promise<AdminPromotion>;
  updatePromotion(promotionId: string, input: UpdateAdminPromotionInput, signal?: AbortSignal): Promise<AdminPromotion>;
  activatePromotion(promotionId: string, signal?: AbortSignal): Promise<AdminPromotion>;
  deactivatePromotion(promotionId: string, signal?: AbortSignal): Promise<AdminPromotion>;
}

export function createAdminCatalogClient(request: ApiRequester): AdminCatalogClient {
  const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
  const servicePath = (id: string) => `/admin/services/${encodeURIComponent(id)}`;
  const pricePath = (id: string) => `/admin/prices/${encodeURIComponent(id)}`;
  const promotionPath = (id: string) => `/admin/promotions/${encodeURIComponent(id)}`;
  return {
    createService: (body, signal) =>
      request({ method: 'POST', path: '/admin/services', body, response: 'json', ...withSignal(signal) }, isService),
    updateService: (id, body, signal) =>
      request({ method: 'PATCH', path: servicePath(id), body, response: 'json', ...withSignal(signal) }, isService),
    listPrices: (signal) => request({ path: '/admin/prices', response: 'json', ...withSignal(signal) }, isPriceArray),
    createPrice: (body, signal) =>
      request({ method: 'POST', path: '/admin/prices', body, response: 'json', ...withSignal(signal) }, isPrice),
    closePrice: (id, body, signal) =>
      request({ method: 'PATCH', path: pricePath(id), body, response: 'json', ...withSignal(signal) }, isPrice),
    listPromotions: (signal) =>
      request({ path: '/admin/promotions', response: 'json', ...withSignal(signal) }, isPromotionArray),
    createPromotion: (body, signal) =>
      request(
        { method: 'POST', path: '/admin/promotions', body, response: 'json', ...withSignal(signal) },
        isPromotion
      ),
    updatePromotion: (id, body, signal) =>
      request({ method: 'PATCH', path: promotionPath(id), body, response: 'json', ...withSignal(signal) }, isPromotion),
    activatePromotion: (id, signal) =>
      request(
        { method: 'POST', path: `${promotionPath(id)}/activate`, response: 'json', ...withSignal(signal) },
        isPromotion
      ),
    deactivatePromotion: (id, signal) =>
      request(
        { method: 'POST', path: `${promotionPath(id)}/deactivate`, response: 'json', ...withSignal(signal) },
        isPromotion
      )
  };
}

function isService(value: unknown): value is AdminService {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    serviceCodes.has(value.code) &&
    typeof value.isActive === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isPrice(value: unknown): value is AdminPrice {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.serviceId === 'string' &&
    serviceCodes.has(value.serviceCode) &&
    clientTypes.has(value.clientType) &&
    typeof value.credits === 'number' &&
    typeof value.validFrom === 'string' &&
    (value.validUntil === null || typeof value.validUntil === 'string') &&
    typeof value.createdAt === 'string'
  );
}

function isPromotion(value: unknown): value is AdminPromotion {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    promotionScopes.has(value.scope) &&
    typeof value.isActive === 'boolean' &&
    typeof value.allowsStacking === 'boolean' &&
    typeof value.validFrom === 'string' &&
    (value.validUntil === null || typeof value.validUntil === 'string') &&
    (value.clientId === null || typeof value.clientId === 'string') &&
    (value.clientType === null || clientTypes.has(value.clientType)) &&
    (value.serviceId === null || typeof value.serviceId === 'string') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

const isPriceArray = (value: unknown): value is AdminPrice[] => isRecordArray(value) && value.every(isPrice);
const isPromotionArray = (value: unknown): value is AdminPromotion[] =>
  isRecordArray(value) && value.every(isPromotion);

const serviceCodes = new Set<unknown>(['FLIPBOOK', 'FLYER', 'PHYSICAL_QR', 'DEMO']);
const clientTypes = new Set<unknown>(['PLANNER', 'ORGANIZATION']);
const promotionScopes = new Set<unknown>(['CREDIT_PURCHASE', 'EVENT_ACTIVATION']);
