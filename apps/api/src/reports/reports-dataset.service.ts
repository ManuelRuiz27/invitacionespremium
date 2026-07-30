import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { GeneratedReportPrivacyMode, GeneratedReportType } from '../generated/prisma/client';

interface ReportEvent {
  id: string;
  name: string | null;
  socialType: string | null;
  eventDateTime: Date | null;
  timeZone: string | null;
}

@Injectable()
export class ReportsDatasetService {
  async build(
    transaction: Prisma.TransactionClient,
    event: ReportEvent,
    type: GeneratedReportType,
    privacy: GeneratedReportPrivacyMode
  ): Promise<Record<string, unknown>> {
    return type === GeneratedReportType.ATTENDANCE
      ? this.attendance(transaction, event, privacy)
      : this.physicalPasses(transaction, event);
  }

  aggregate(dataset: Record<string, unknown>): Record<string, unknown> {
    return {
      ...dataset,
      ...('rows' in dataset ? { rows: [] } : {}),
      ...('passes' in dataset ? { passes: [] } : {})
    };
  }

  private async attendance(
    transaction: Prisma.TransactionClient,
    event: ReportEvent,
    privacy: GeneratedReportPrivacyMode
  ): Promise<Record<string, unknown>> {
    const invitations = await transaction.invitation.findMany({
      where: { eventId: event.id, deletedAt: null },
      orderBy: { id: 'asc' },
      include: {
        contact: { include: { group: true } },
        assistants: {
          where: { deletedAt: null },
          orderBy: { id: 'asc' },
          include: { floorplanShape: true, checkIns: { orderBy: [{ checkedInAt: 'asc' }, { id: 'asc' }] } }
        }
      }
    });
    const assistants = invitations.flatMap((invitation) =>
      invitation.assistants.map((assistant) => ({ invitation, assistant }))
    );
    const checkIns = assistants.flatMap(({ assistant }) => assistant.checkIns);
    const activeCheckIns = checkIns.filter(({ revertedAt }) => revertedAt === null);
    const cancelled = invitations.filter(({ cancelledAt }) => cancelledAt !== null);

    return {
      event: {
        name: event.name,
        socialType: event.socialType,
        eventDateTime: event.eventDateTime?.toISOString() ?? null,
        timeZone: event.timeZone
      },
      summary: {
        invitations: {
          total: invitations.length,
          confirmed: invitations.filter((row) => row.cancelledAt === null && row.responseStatus === 'CONFIRMED').length,
          rejected: invitations.filter((row) => row.cancelledAt === null && row.responseStatus === 'REJECTED').length,
          pending: invitations.filter((row) => row.cancelledAt === null && row.responseStatus === 'PENDING').length,
          cancelled: cancelled.length
        },
        assistants: {
          confirmed: assistants.filter(
            ({ assistant, invitation }) => assistant.responseStatus === 'CONFIRMED' && invitation.cancelledAt === null
          ).length,
          checkedIn: new Set(activeCheckIns.map(({ assistantId }) => assistantId)).size,
          notCheckedIn: assistants.filter(
            ({ assistant, invitation }) =>
              assistant.responseStatus === 'CONFIRMED' &&
              invitation.cancelledAt === null &&
              !activeCheckIns.some(({ assistantId }) => assistantId === assistant.id)
          ).length
        },
        checkIns: {
          active: activeCheckIns.length,
          reverted: checkIns.filter(({ revertedAt }) => revertedAt !== null).length
        }
      },
      rows:
        privacy === GeneratedReportPrivacyMode.DETAILED
          ? assistants
              .filter(
                ({ assistant, invitation }) =>
                  assistant.responseStatus === 'CONFIRMED' && invitation.cancelledAt === null
              )
              .map(({ assistant, invitation }) => {
                const active = assistant.checkIns.find(({ revertedAt }) => revertedAt === null);
                const reverted = [...assistant.checkIns].reverse().find(({ revertedAt }) => revertedAt !== null);
                return {
                  assistantName: assistant.name,
                  invitationName: invitation.contact.name,
                  groupName: invitation.contact.group?.name ?? null,
                  attendanceStatus: active ? 'CHECKED_IN' : 'NO_SHOW',
                  tableName: assistant.floorplanShape?.name ?? null,
                  checkedInAt: active?.checkedInAt.toISOString() ?? null,
                  revertedAt: reverted?.revertedAt?.toISOString() ?? null
                };
              })
          : [],
      incidents: {
        revertedCheckIns: checkIns.filter(({ revertedAt }) => revertedAt !== null).length,
        cancelledInvitations: cancelled.length
      }
    };
  }

  private async physicalPasses(
    transaction: Prisma.TransactionClient,
    event: ReportEvent
  ): Promise<Record<string, unknown>> {
    const passes = await transaction.physicalPass.findMany({
      where: { eventId: event.id, deletedAt: null },
      orderBy: [{ passNumber: 'asc' }, { id: 'asc' }],
      include: { floorplanShape: true }
    });
    return {
      event: {
        name: event.name,
        eventDateTime: event.eventDateTime?.toISOString() ?? null,
        timeZone: event.timeZone
      },
      summary: {
        total: passes.length,
        used: passes.filter(({ usedAt }) => usedAt !== null).length,
        unused: passes.filter(({ usedAt }) => usedAt === null).length
      },
      passes: passes.map((pass) => ({
        passNumber: pass.passNumber,
        status: pass.usedAt ? 'USED' : 'UNUSED',
        tableName: pass.floorplanShape?.name ?? null,
        usedAt: pass.usedAt?.toISOString() ?? null
      }))
    };
  }
}
