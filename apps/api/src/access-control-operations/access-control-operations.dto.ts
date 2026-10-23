import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { EventAccessMode, EventStatus } from '../generated/prisma/client';

export class AccessOperationalTableDto {
  @ApiProperty({ type: String }) tableId!: string;
  @ApiProperty({ type: String }) tableName!: string;
  @ApiProperty({ type: Number, minimum: 0 }) capacity!: number;
  @ApiProperty({ type: Number, minimum: 0 }) activeRights!: number;
  @ApiProperty({ type: Number, minimum: 0 }) entered!: number;
  @ApiProperty({ type: Number, minimum: 0 }) pending!: number;
  @ApiProperty({ type: Number, minimum: 0 }) availableCapacity!: number;
}
export class AccessOperationalSummaryDto {
  @ApiProperty({ type: String }) eventId!: string;
  @ApiProperty({ enum: EventAccessMode }) accessMode!: EventAccessMode;
  @ApiProperty({ enum: EventStatus }) eventStatus!: EventStatus;
  @ApiProperty({ type: Number, nullable: true, minimum: 1 }) capacity!: number | null;
  @ApiProperty({ type: Number, minimum: 0 }) issuedHistorical!: number;
  @ApiProperty({ type: Number, minimum: 0 }) revokedHistorical!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 150 }) activeRights!: number;
  @ApiProperty({ type: Number, minimum: 0 }) entered!: number;
  @ApiProperty({ type: Number, minimum: 0 }) pending!: number;
  @ApiProperty({ type: Number, nullable: true, minimum: 0 }) availableCapacity!: number | null;
  @ApiProperty({ type: String, format: 'date-time' }) asOf!: string;
  @ApiProperty({ type: [AccessOperationalTableDto] }) tables!: AccessOperationalTableDto[];
}
export class AccessOperationalTableReferenceDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) name!: string;
}
export class AccessOperationalSeatReferenceDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) label!: string;
}
export class NominalAccessOperationDetailDto {
  @ApiProperty({ type: String }) assistantId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ type: String, nullable: true }) group!: string | null;
  @ApiProperty({ type: AccessOperationalTableReferenceDto, nullable: true })
  table!: AccessOperationalTableReferenceDto | null;
  @ApiProperty({ type: AccessOperationalSeatReferenceDto, nullable: true })
  seat!: AccessOperationalSeatReferenceDto | null;
  @ApiProperty({ enum: ['PENDING', 'ENTERED'] }) status!: 'PENDING' | 'ENTERED';
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) enteredAt!: string | null;
}
export class AnonymousAccessOperationDetailDto {
  @ApiProperty({ type: Number, minimum: 1 }) passNumber!: number;
  @ApiProperty({ type: AccessOperationalTableReferenceDto, nullable: true })
  table!: AccessOperationalTableReferenceDto | null;
  @ApiProperty({ enum: ['UNUSED', 'USED', 'REVOKED'] }) status!: 'UNUSED' | 'USED' | 'REVOKED';
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) usedAt!: string | null;
}
class PagedAccessOperationsDto extends AccessOperationalSummaryDto {
  @ApiProperty({ type: Number, minimum: 1 }) detailPage!: number;
  @ApiProperty({ type: Number, enum: [150] }) detailPageSize!: number;
  @ApiProperty({ type: Number, minimum: 0 }) detailTotal!: number;
}
export class NominalAccessOperationsDto extends PagedAccessOperationsDto {
  @ApiProperty({ enum: ['NOMINAL'] }) declare accessMode: 'NOMINAL';
  @ApiProperty({ type: [NominalAccessOperationDetailDto] }) details!: NominalAccessOperationDetailDto[];
}
export class AnonymousAccessOperationsDto extends PagedAccessOperationsDto {
  @ApiProperty({ enum: ['ANONYMOUS'] }) declare accessMode: 'ANONYMOUS';
  @ApiProperty({ type: [AnonymousAccessOperationDetailDto] }) details!: AnonymousAccessOperationDetailDto[];
}
export type AccessOperationsDto = NominalAccessOperationsDto | AnonymousAccessOperationsDto;

export function parseAccessOperationsPage(query: unknown): number {
  if (
    typeof query !== 'object' ||
    query === null ||
    Array.isArray(query) ||
    Object.keys(query).some((key) => key !== 'page')
  )
    throw invalidPage();
  const page = (query as Record<string, unknown>).page;
  if (page === undefined) return 1;
  if (typeof page !== 'string' || !/^[1-9]\d{0,6}$/u.test(page)) throw invalidPage();
  return Number(page);
}
function invalidPage() {
  return new BadRequestException({ code: 'ACCESS_OPERATIONS_INVALID_QUERY', message: 'A positive page is required.' });
}
