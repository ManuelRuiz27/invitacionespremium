import { ConflictException, ForbiddenException, GoneException, Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import { Prisma } from '../generated/prisma/client';
import type { AccessOperationalSummaryDto, AccessOperationsDto } from './access-control-operations.dto';

@Injectable()
export class AccessControlOperationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessPolicy) private readonly access: EventAccessPolicy
  ) {}

  client(eventId: string, principal: AuthPrincipal, page = 1): Promise<AccessOperationsDto> {
    return this.read(eventId, principal, undefined, page) as Promise<AccessOperationsDto>;
  }
  provider(eventId: string, clientId: string, principal: AuthPrincipal): Promise<AccessOperationalSummaryDto> {
    return this.read(eventId, principal, clientId, 1);
  }

  private read(eventId: string, principal: AuthPrincipal, clientId: string | undefined, page: number) {
    return this.prisma.$transaction(
      async (tx) => {
        // MVCC only: no Event/Staff/material locks, no readiness writes or audit effects.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // This bounded OLTP projection cannot amortize LLVM compilation. Keep the
        // setting local to this snapshot; pooled connections retain their defaults.
        await tx.$executeRaw`SET LOCAL jit = off`;
        const provider = clientId !== undefined;
        if (provider) {
          if (
            principal.role !== 'PLATFORM_ADMIN' ||
            principal.clientId !== null ||
            !(await tx.user.findFirst({
              where: { id: principal.userId, role: 'PLATFORM_ADMIN', clientId: null, deletedAt: null },
              select: { id: true }
            }))
          )
            throw forbidden();
        } else if (principal.role !== 'ORGANIZATION_ADMIN' && principal.role !== 'ORGANIZATION_PLANNER')
          throw forbidden();
        const event = await tx.event.findFirst({
          where: { id: eventId, deletedAt: null, ...(provider ? { clientId } : this.access.ownedWhere(principal)) },
          include: { service: true, client: true }
        });
        if (!event) throw eventNotFound();
        if (
          event.service?.code !== 'ACCESS_CONTROL' ||
          !event.accessMode ||
          event.client.type !== 'ORGANIZATION' ||
          event.client.operatingProfile !== 'MANAGED' ||
          event.client.status !== 'ACTIVE' ||
          event.client.deletedAt ||
          event.status === 'ALBUM_PUBLISHED'
        )
          throw new ConflictException({
            code: 'ACCESS_OPERATIONS_EVENT_NOT_ELIGIBLE',
            message: 'Access operations are unavailable for this event.'
          });
        const [privacy] = await tx.$queryRaw<Array<{ expired: boolean; detailExpired: boolean }>>`
        SELECT COALESCE(transaction_timestamp() >= event_date_time + interval '6 months',false) AS expired,
          COALESCE(transaction_timestamp() >= event_date_time + interval '30 days',false) AS "detailExpired"
        FROM event WHERE id=${eventId}::uuid
      `;
        // Apply the existing report privacy boundaries even if anonymization has not run yet.
        if (privacy?.expired || (!provider && event.accessMode === 'NOMINAL' && privacy?.detailExpired))
          throw new GoneException({
            code: privacy?.expired ? 'ACCESS_OPERATIONS_CONTENT_EXPIRED' : 'ACCESS_OPERATIONS_DETAIL_EXPIRED',
            message: 'The access operations privacy window has ended.'
          });
        const [projection] = await tx.$queryRaw<
          Array<{ inconsistent: boolean; summary: AccessOperationalSummaryDto; detail: AccessOperationsDto }>
        >`
        WITH e AS (SELECT * FROM event WHERE id = ${eventId}::uuid),
        fp AS (SELECT f.* FROM floorplan f JOIN e ON f.event_id=e.id WHERE f.deleted_at IS NULL AND e.floorplan_enabled),
        tables AS (SELECT s.* FROM floorplan_shape s JOIN fp ON s.floorplan_id=fp.id AND s.event_id=fp.event_id
          WHERE s.deleted_at IS NULL AND s.kind='TABLE'),
        material AS (SELECT c.assistant_id, min(c.id::text)::uuid AS credential_id, count(*) AS copies
          FROM assistant_access_credential c JOIN e ON c.event_id=e.id
          WHERE e.access_mode='NOMINAL' AND c.revoked_at IS NULL GROUP BY c.assistant_id),
        rights AS (
          SELECT a.id AS subject_id, m.credential_id, m.copies, a.floorplan_shape_id AS table_id,
            a.floorplan_seat_id AS seat_id, a.name, g.name AS group_name,
            ci.entered_at, ci.entries
          FROM material m JOIN assistant a ON a.id=m.assistant_id JOIN e ON a.event_id=e.id
          JOIN invitation i ON i.id=a.invitation_id AND i.event_id=e.id
          JOIN contact c ON c.id=i.contact_id AND c.event_id=e.id
          LEFT JOIN contact_group g ON g.id=c.group_id AND g.event_id=e.id
          LEFT JOIN LATERAL (SELECT max(checked_in_at) AS entered_at, count(*) AS entries
            FROM check_in WHERE assistant_id=a.id AND event_id=e.id AND reverted_at IS NULL) ci ON true
          WHERE a.deleted_at IS NULL AND a.anonymized_at IS NULL AND a.name IS NOT NULL
            AND a.is_primary AND a.response_status='PENDING' AND i.deleted_at IS NULL AND i.cancelled_at IS NULL
            AND i.response_status='PENDING' AND i.mode='INDIVIDUAL' AND i.additional_assistant_limit=0
            AND c.deleted_at IS NULL AND c.anonymized_at IS NULL
          UNION ALL
          SELECT p.id, NULL::uuid, 1::bigint, p.floorplan_shape_id, NULL::uuid, NULL::text, NULL::text,
            p.used_at, CASE WHEN p.used_at IS NULL THEN 0 ELSE 1 END::bigint
          FROM physical_pass p JOIN e ON p.event_id=e.id
          WHERE e.access_mode='ANONYMOUS' AND p.revoked_at IS NULL AND p.deleted_at IS NULL
        ),
        totals AS (SELECT count(*)::int AS rights, count(*) FILTER (WHERE entered_at IS NOT NULL)::int AS entered FROM rights),
        history AS (SELECT count(*)::int AS issued, count(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS revoked FROM (
          SELECT c.revoked_at FROM assistant_access_credential c JOIN e ON c.event_id=e.id WHERE e.access_mode='NOMINAL'
          UNION ALL SELECT p.revoked_at FROM physical_pass p JOIN e ON p.event_id=e.id WHERE e.access_mode='ANONYMOUS'
        ) h),
        table_counts AS (SELECT t.id, t.name, t.normalized_name, t.capacity,
          count(r.subject_id)::int AS rights, count(r.subject_id) FILTER (WHERE r.entered_at IS NOT NULL)::int AS entered
          FROM tables t LEFT JOIN rights r ON r.table_id=t.id GROUP BY t.id,t.name,t.normalized_name,t.capacity),
        invalid AS (SELECT
          totals.rights>150 OR (e.capacity IS NULL AND totals.rights>0) OR totals.rights>e.capacity
          OR EXISTS (SELECT 1 FROM rights r WHERE r.copies<>1 OR r.entries>1)
          OR EXISTS (SELECT 1 FROM check_in ci LEFT JOIN rights r ON r.subject_id=ci.assistant_id
            WHERE ci.event_id=e.id AND ci.reverted_at IS NULL AND
              (e.access_mode<>'NOMINAL' OR r.subject_id IS NULL OR ci.assistant_access_credential_id IS DISTINCT FROM r.credential_id))
          OR EXISTS (SELECT 1 FROM rights r LEFT JOIN tables t ON t.id=r.table_id
            LEFT JOIN floorplan_seat s ON s.id=r.seat_id AND s.event_id=e.id AND s.floorplan_shape_id=t.id
              AND s.floorplan_id=t.floorplan_id AND s.deleted_at IS NULL AND NOT s.is_blocked
            WHERE (e.floorplan_enabled AND (t.id IS NULL OR
              (EXISTS(SELECT 1 FROM fp WHERE seating_mode='SEAT') AND s.id IS NULL) OR
              (EXISTS(SELECT 1 FROM fp WHERE seating_mode='TABLE') AND r.seat_id IS NOT NULL))) OR
              (NOT e.floorplan_enabled AND (r.table_id IS NOT NULL OR r.seat_id IS NOT NULL)))
          OR EXISTS (SELECT 1 FROM table_counts WHERE rights>capacity OR capacity<0)
          OR EXISTS (SELECT 1 FROM tables t JOIN fp ON fp.id=t.floorplan_id WHERE fp.seating_mode='SEAT' AND t.capacity<>
              (SELECT count(*) FROM floorplan_seat s WHERE s.floorplan_shape_id=t.id AND s.event_id=e.id
                AND s.floorplan_id=fp.id AND s.deleted_at IS NULL AND NOT s.is_blocked))
          OR (SELECT count(*) FROM fp)>1
          OR (e.access_mode='ANONYMOUS' AND EXISTS(SELECT 1 FROM fp WHERE seating_mode<>'TABLE'))
          OR EXISTS (SELECT 1 FROM physical_pass p WHERE p.event_id=e.id AND
              (e.access_mode<>'ANONYMOUS' OR p.deleted_at IS NOT NULL OR (p.used_at IS NOT NULL AND p.revoked_at IS NOT NULL)))
          OR (e.access_mode='ANONYMOUS' AND EXISTS(SELECT 1 FROM assistant_access_credential c WHERE c.event_id=e.id))
          AS inconsistent FROM e CROSS JOIN totals),
        summary AS (SELECT jsonb_build_object(
          'eventId',e.id,'accessMode',e.access_mode,'eventStatus',upper(e.status::text),'capacity',e.capacity,
          'issuedHistorical',h.issued,'revokedHistorical',h.revoked,'activeRights',totals.rights,'entered',totals.entered,
          'pending',totals.rights-totals.entered,'availableCapacity',e.capacity-totals.rights,'asOf',transaction_timestamp(),
          'tables',COALESCE((SELECT jsonb_agg(jsonb_build_object('tableId',t.id,'tableName',t.name,'capacity',t.capacity,
            'activeRights',t.rights,'entered',t.entered,'pending',t.rights-t.entered,'availableCapacity',t.capacity-t.rights)
            ORDER BY t.normalized_name,t.id) FROM table_counts t),'[]'::jsonb)) AS value
          FROM e CROSS JOIN totals CROSS JOIN history h),
        detail_rows AS (
          SELECT jsonb_build_object('assistantId',r.subject_id,'name',r.name,'group',r.group_name,
            'table',CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name) END,
            'seat',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'label',s.label) END,
            'status',CASE WHEN r.entered_at IS NULL THEN 'PENDING' ELSE 'ENTERED' END,'enteredAt',r.entered_at) AS value,
            lower(normalize(r.name,NFKC)) AS name_sort, r.subject_id::text AS id_sort, 0 AS folio
          FROM rights r JOIN e ON e.access_mode='NOMINAL' LEFT JOIN tables t ON t.id=r.table_id
          LEFT JOIN floorplan_seat s ON s.id=r.seat_id AND s.deleted_at IS NULL AND NOT s.is_blocked
          WHERE ${!provider}
          UNION ALL
          SELECT jsonb_build_object('passNumber',p.pass_number,
            'table',CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'name',t.name) END,
            'status',CASE WHEN p.revoked_at IS NOT NULL THEN 'REVOKED' WHEN p.used_at IS NOT NULL THEN 'USED' ELSE 'UNUSED' END,
            'usedAt',p.used_at), ''::text,p.id::text,p.pass_number
          FROM physical_pass p JOIN e ON p.event_id=e.id AND e.access_mode='ANONYMOUS'
          LEFT JOIN tables t ON t.id=p.floorplan_shape_id WHERE ${!provider}
        ), page_rows AS (SELECT * FROM detail_rows ORDER BY folio,name_sort,id_sort LIMIT 150 OFFSET ${(page - 1) * 150})
        SELECT COALESCE(invalid.inconsistent,false) AS inconsistent, summary.value AS summary,
          summary.value || jsonb_build_object('detailPage',${page}::int,'detailPageSize',150,
            'detailTotal',(SELECT count(*)::int FROM detail_rows),
            'details',COALESCE((SELECT jsonb_agg(value ORDER BY folio,name_sort,id_sort) FROM page_rows),'[]'::jsonb)) AS detail
        FROM summary CROSS JOIN invalid
      `;
        if (!projection || projection.inconsistent)
          throw new ConflictException({
            code: 'ACCESS_OPERATIONS_INCONSISTENT',
            message: 'Access records require operational reconciliation.'
          });
        return provider ? projection.summary : projection.detail;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 10000 }
    );
  }
}
function forbidden() {
  return new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: 'This role cannot view access operations.' });
}
