import type { ApiClient } from '@invitaciones/api-client';
import { ErrorState, LoadingState, PageHeader } from '@invitaciones/ui';
import { Box } from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { toDisplayError } from '../shared/error-message';
import { useSessionExpiry } from '../shared/use-session-expiry';
import { BalanceCards } from './BalanceCards';
import { MovementsList } from './MovementsList';
import { ReceiptsList } from './ReceiptsList';

export function FinancePage({ apiClient }: { apiClient: ApiClient }) {
  const [balance, movements, receipts] = useQueries({
    queries: [
      {
        queryKey: ['finance', 'balance'],
        queryFn: ({ signal }) => apiClient.finance.balance(signal)
      },
      {
        queryKey: ['finance', 'movements', 20],
        queryFn: ({ signal }) => apiClient.finance.movements({ limit: 20, signal })
      },
      {
        queryKey: ['finance', 'receipts', 20],
        queryFn: ({ signal }) => apiClient.finance.receipts({ limit: 20, signal })
      }
    ]
  });

  const firstError = [balance.error, movements.error, receipts.error].find(Boolean);
  useSessionExpiry(firstError, '/finanzas');
  const loading = balance.isPending || movements.isPending || receipts.isPending;
  const retry = () => void Promise.all([balance.refetch(), movements.refetch(), receipts.refetch()]);

  return (
    <>
      <PageHeader
        title="Finanzas"
        description="Consulta el balance, los movimientos y los comprobantes autorizados para tu Cliente."
      />
      {loading ? <LoadingState label="Cargando información financiera…" /> : null}
      {firstError ? <ErrorState {...toDisplayError(firstError)} onRetry={retry} /> : null}
      {balance.data && movements.data && receipts.data ? (
        <>
          <BalanceCards balance={balance.data} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)' },
              gap: 6
            }}
          >
            <MovementsList movements={movements.data} />
            <ReceiptsList receipts={receipts.data} />
          </Box>
        </>
      ) : null}
    </>
  );
}
