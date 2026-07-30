import type { LedgerMovement } from '@invitaciones/api-client';
import { EmptyState } from '@invitaciones/ui';
import { Box, Divider, Stack, Typography } from '@mui/material';
import { formatCredits, formatDateTime, formatMxnCents } from '../shared/formatters';

const movementLabels: Record<LedgerMovement['movementType'], string> = {
  CREDIT_PURCHASE: 'Compra de créditos',
  MANUAL_CREDIT_GRANT: 'Asignación de créditos',
  EVENT_ACTIVATION_CHARGE: 'Activación de Evento',
  CREDIT_LINE_USAGE: 'Uso de línea de crédito',
  DEBT_PAYMENT: 'Pago de deuda',
  EVENT_CREDIT_REFUND: 'Devolución de créditos',
  LEDGER_REVERSAL: 'Corrección contable',
  PROMOTION_DISCOUNT: 'Descuento promocional'
};

export function MovementsList({ movements }: { movements: LedgerMovement[] }) {
  return (
    <section aria-labelledby="movements-title">
      <Typography id="movements-title" component="h2" variant="h3" sx={{ mb: 2 }}>
        Movimientos recientes
      </Typography>
      {movements.length === 0 ? (
        <EmptyState title="Aún no hay movimientos para mostrar." />
      ) : (
        <Stack divider={<Divider flexItem />}>
          {movements.map((movement) => {
            const creditDelta = movement.purchasedCreditDelta || movement.creditLineUsedDelta || movement.debtDelta;
            return (
              <Box
                key={movement.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr auto', md: 'minmax(0, 1fr) auto auto' },
                  gap: { xs: 1, md: 4 },
                  py: 2,
                  alignItems: 'center'
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 650 }}>{movementLabels[movement.movementType]}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(movement.createdAt)}
                  </Typography>
                </Box>
                <Typography sx={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                  {creditDelta > 0 ? '+' : ''}
                  {formatCredits(creditDelta)} créditos
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ display: { xs: 'none', md: 'block' }, minWidth: 130, textAlign: 'right' }}
                >
                  {formatMxnCents(movement.cashMxnDelta)}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </section>
  );
}
