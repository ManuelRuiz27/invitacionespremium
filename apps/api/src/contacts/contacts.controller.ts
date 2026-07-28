import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  CommitImportRequestDto,
  CommitImportResponseDto,
  ContactGroupResponseDto,
  ContactResponseDto,
  CreateContactRequestDto,
  GroupRequestDto,
  ImportPreviewResponseDto,
  parseCommitImportRequest,
  parseContactId,
  parseCreateContactRequest,
  parseEventId,
  parseGroupId,
  parseGroupRequest,
  parseUpdateContactRequest,
  UpdateContactRequestDto
} from './contacts.dto';
import { ContactsService, type UploadedCsvFile } from './contacts.service';

@ApiTags('contacts')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId')
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  @Get('contacts')
  @ApiOkResponse({ type: ContactResponseDto, isArray: true })
  listContacts(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ContactResponseDto[]> {
    return this.contacts.listContacts(parseEventId(eventId), principal);
  }

  @Post('contacts')
  @ApiBody({ type: CreateContactRequestDto })
  @ApiCreatedResponse({ type: ContactResponseDto })
  createContact(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ContactResponseDto> {
    return this.contacts.createContact(
      parseEventId(eventId),
      parseCreateContactRequest(body),
      principal,
      request.operationId
    );
  }

  @Patch('contacts/:contactId')
  @ApiBody({ type: UpdateContactRequestDto })
  @ApiOkResponse({ type: ContactResponseDto })
  updateContact(
    @Param('eventId') eventId: string,
    @Param('contactId') contactId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ContactResponseDto> {
    return this.contacts.updateContact(
      parseEventId(eventId),
      parseContactId(contactId),
      parseUpdateContactRequest(body),
      principal,
      request.operationId
    );
  }

  @Delete('contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteContact(
    @Param('eventId') eventId: string,
    @Param('contactId') contactId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.contacts.deleteContact(parseEventId(eventId), parseContactId(contactId), principal, request.operationId);
  }

  @Get('groups')
  @ApiOkResponse({ type: ContactGroupResponseDto, isArray: true })
  listGroups(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ContactGroupResponseDto[]> {
    return this.contacts.listGroups(parseEventId(eventId), principal);
  }

  @Post('groups')
  @ApiBody({ type: GroupRequestDto })
  @ApiCreatedResponse({ type: ContactGroupResponseDto })
  createGroup(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ContactGroupResponseDto> {
    return this.contacts.createGroup(parseEventId(eventId), parseGroupRequest(body), principal, request.operationId);
  }

  @Patch('groups/:groupId')
  @ApiBody({ type: GroupRequestDto })
  @ApiOkResponse({ type: ContactGroupResponseDto })
  updateGroup(
    @Param('eventId') eventId: string,
    @Param('groupId') groupId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ContactGroupResponseDto> {
    return this.contacts.updateGroup(
      parseEventId(eventId),
      parseGroupId(groupId),
      parseGroupRequest(body),
      principal,
      request.operationId
    );
  }

  @Get('contacts/import-template')
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'UTF-8 CSV template.' })
  async template(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const template = await this.contacts.getCsvTemplate(parseEventId(eventId), principal);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="contacts-template.csv"');
    response.send(template);
  }

  @Post('contacts/import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1_048_576, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } }
    }
  })
  @ApiCreatedResponse({ type: ImportPreviewResponseDto })
  previewImport(
    @Param('eventId') eventId: string,
    @UploadedFile() file: UploadedCsvFile | undefined,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ImportPreviewResponseDto> {
    return this.contacts.previewImport(parseEventId(eventId), file, principal, request.operationId);
  }

  @Post('contacts/import/commit')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: CommitImportRequestDto })
  @ApiOkResponse({ type: CommitImportResponseDto })
  commitImport(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<CommitImportResponseDto> {
    const input = parseCommitImportRequest(body);
    return this.contacts.commitImport(
      parseEventId(eventId),
      input.previewId,
      parseIdempotencyKey(idempotencyKey),
      principal,
      request.operationId
    );
  }
}
