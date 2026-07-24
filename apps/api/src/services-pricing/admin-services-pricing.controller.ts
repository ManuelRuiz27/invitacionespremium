import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  ClosePriceRequestDto,
  CreatePriceRequestDto,
  CreatePromotionRequestDto,
  CreateServiceRequestDto,
  PriceResponseDto,
  PromotionResponseDto,
  ServiceResponseDto,
  UpdatePromotionRequestDto,
  UpdateServiceRequestDto,
  parseClosePriceRequest,
  parseCreatePriceRequest,
  parseCreatePromotionRequest,
  parseCreateServiceRequest,
  parseUpdatePromotionRequest,
  parseUpdateServiceRequest,
  parseUuidParameter
} from './services-pricing.dto';
import { ServicesPricingService } from './services-pricing.service';

@ApiTags('admin-services-pricing')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin')
export class AdminServicesPricingController {
  constructor(@Inject(ServicesPricingService) private readonly servicesPricing: ServicesPricingService) {}

  @Post('services')
  @ApiBody({ type: CreateServiceRequestDto })
  @ApiCreatedResponse({ type: ServiceResponseDto })
  createService(
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ServiceResponseDto> {
    return this.servicesPricing.createService(parseCreateServiceRequest(body), principal, request.operationId);
  }

  @Patch('services/:serviceId')
  @ApiBody({ type: UpdateServiceRequestDto })
  @ApiOkResponse({ type: ServiceResponseDto })
  updateService(
    @Param('serviceId') serviceIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ServiceResponseDto> {
    return this.servicesPricing.updateService(
      parseUuidParameter(serviceIdInput, 'serviceId'),
      parseUpdateServiceRequest(body),
      principal,
      request.operationId
    );
  }

  @Get('prices')
  @ApiOkResponse({ type: PriceResponseDto, isArray: true })
  listPrices(): Promise<PriceResponseDto[]> {
    return this.servicesPricing.listPrices();
  }

  @Post('prices')
  @ApiBody({ type: CreatePriceRequestDto })
  @ApiCreatedResponse({ type: PriceResponseDto })
  createPrice(
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PriceResponseDto> {
    return this.servicesPricing.createPrice(parseCreatePriceRequest(body), principal, request.operationId);
  }

  @Patch('prices/:priceId')
  @ApiBody({ type: ClosePriceRequestDto })
  @ApiOkResponse({ type: PriceResponseDto })
  closePrice(
    @Param('priceId') priceIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PriceResponseDto> {
    return this.servicesPricing.closePrice(
      parseUuidParameter(priceIdInput, 'priceId'),
      parseClosePriceRequest(body),
      principal,
      request.operationId
    );
  }

  @Get('promotions')
  @ApiOkResponse({ type: PromotionResponseDto, isArray: true })
  listPromotions(): Promise<PromotionResponseDto[]> {
    return this.servicesPricing.listPromotions();
  }

  @Post('promotions')
  @ApiBody({ type: CreatePromotionRequestDto })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  createPromotion(
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PromotionResponseDto> {
    return this.servicesPricing.createPromotion(parseCreatePromotionRequest(body), principal, request.operationId);
  }

  @Patch('promotions/:promotionId')
  @ApiBody({ type: UpdatePromotionRequestDto })
  @ApiOkResponse({ type: PromotionResponseDto })
  updatePromotion(
    @Param('promotionId') promotionIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PromotionResponseDto> {
    return this.servicesPricing.updatePromotion(
      parseUuidParameter(promotionIdInput, 'promotionId'),
      parseUpdatePromotionRequest(body),
      principal,
      request.operationId
    );
  }

  @Post('promotions/:promotionId/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PromotionResponseDto })
  activatePromotion(
    @Param('promotionId') promotionIdInput: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PromotionResponseDto> {
    return this.servicesPricing.setPromotionActive(
      parseUuidParameter(promotionIdInput, 'promotionId'),
      true,
      principal,
      request.operationId
    );
  }

  @Post('promotions/:promotionId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PromotionResponseDto })
  deactivatePromotion(
    @Param('promotionId') promotionIdInput: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PromotionResponseDto> {
    return this.servicesPricing.setPromotionActive(
      parseUuidParameter(promotionIdInput, 'promotionId'),
      false,
      principal,
      request.operationId
    );
  }
}
