import type { PublicInvitationView, PublicRsvpAssistantInput } from '@invitaciones/api-client';

export const invitationStatusLabel = {
  PENDING: 'Aún no has confirmado',
  CONFIRMED: 'Asistencia confirmada',
  REJECTED: 'No asistirás'
} as const;

export function additionalAssistants(view: PublicInvitationView): PublicRsvpAssistantInput[] {
  return (view.assistants ?? []).filter((assistant) => !assistant.isPrimary).map(({ id, name }) => ({ id, name }));
}

export function nominalIntentMatches(
  view: PublicInvitationView,
  responseStatus: 'CONFIRMED' | 'REJECTED',
  requested: PublicRsvpAssistantInput[]
): boolean {
  if (view.invitation?.responseStatus !== responseStatus) return false;
  if (responseStatus === 'REJECTED') return true;
  const remaining = additionalAssistants(view);
  if (remaining.length !== requested.length) return false;
  return requested.every((expected) => {
    const index = remaining.findIndex((current) =>
      expected.id ? current.id === expected.id && current.name === expected.name : current.name === expected.name
    );
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}
