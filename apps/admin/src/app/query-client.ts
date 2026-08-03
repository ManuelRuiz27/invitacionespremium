import { QueryClient } from '@tanstack/react-query';

export function createAdminQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 20_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false }
    }
  });
}

export const adminQueryKeys = {
  session: ['admin-session'] as const,
  clients: ['admin-clients'] as const,
  client: (clientId: string) => ['admin-client', clientId] as const,
  clientUsers: (clientId: string) => ['admin-client-users', clientId] as const,
  events: ['admin-events'] as const,
  event: (eventId: string) => ['admin-event', eventId] as const,
  finance: (clientId: string) => ['admin-client-finance', clientId] as const,
  prices: ['admin-prices'] as const,
  promotions: ['admin-promotions'] as const,
  reports: ['admin-reports'] as const,
  eventReports: (eventId: string) => ['admin-event-reports', eventId] as const,
  dailyCut: ['admin-finance-cut-daily'] as const,
  monthlyCut: ['admin-finance-cut-monthly'] as const
};
