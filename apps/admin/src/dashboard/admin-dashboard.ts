import type { AdminClient, AdminEvent } from '@invitaciones/api-client';

export function summarizeAdminDashboard(clients: AdminClient[], events: AdminEvent[]) {
  return {
    activeClients: clients.filter((client) => client.status === 'ACTIVE').length,
    suspendedClients: clients.filter((client) => client.status === 'SUSPENDED').length,
    planners: clients.filter((client) => client.type === 'PLANNER').length,
    organizations: clients.filter((client) => client.type === 'ORGANIZATION').length,
    preparingEvents: events.filter((event) => event.status === 'DRAFT' || event.status === 'CONFIGURED').length,
    activeEvents: events.filter((event) => event.status === 'ACTIVE' || event.status === 'EVENT_DAY').length,
    closedEvents: events.filter((event) => event.status === 'CLOSED' || event.status === 'ALBUM_PUBLISHED').length,
    cancelledEvents: events.filter((event) => event.status === 'CANCELLED').length,
    deletedEvents: events.filter((event) => event.deletedAt !== null).length
  };
}
