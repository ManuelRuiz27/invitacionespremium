import type { FinanceBalance } from '@invitaciones/api-client';
import { MetricCard } from '@invitaciones/ui';
import { Alert, Box, Stack } from '@mui/material';
import { formatCredits, formatMxnCents } from '../shared/formatters';

export function BalanceCards({ balance }: { balance: FinanceBalance }) {
  const expired = balance.creditLine.expiresAt ? new Date(balance.creditLine.expiresAt).getTime() <= Date.now() : false;

  return (
    <>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {balance.debtCredits > 0 ? (
          <Alert severity="warning">
            Tienes una deuda pendiente de {formatCredits(balance.debtCredits)} créditos (
            {formatMxnCents(balance.debtMxnCents)}).
          </Alert>
        ) : null}
        {balance.creditLine.status === 'SUSPENDED' ? (
          <Alert severity="warning">Tu línea de crédito está suspendida.</Alert>
        ) : null}
        {expired ? <Alert severity="warning">Tu línea de crédito está expirada.</Alert> : null}
        {balance.purchasedCredits === 0 ? <Alert severity="info">Tu saldo comprado está en cero.</Alert> : null}
      </Stack>
      <Box
        aria-label="Balance financiero"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: { xs: 2, md: 4 },
          mb: 5
        }}
      >
        <MetricCard
          label="Saldo disponible"
          value={formatCredits(balance.purchasedCredits)}
          detail="créditos comprados"
        />
        <MetricCard
          label="Deuda pendiente"
          value={formatCredits(balance.debtCredits)}
          detail={formatMxnCents(balance.debtMxnCents)}
        />
        <MetricCard
          label="Línea de crédito disponible"
          value={formatCredits(balance.creditLine.availableCredits)}
          detail="créditos"
        />
        <MetricCard
          label="Línea de crédito utilizada"
          value={formatCredits(balance.creditLine.usedCredits)}
          detail="créditos"
        />
      </Box>
    </>
  );
}
