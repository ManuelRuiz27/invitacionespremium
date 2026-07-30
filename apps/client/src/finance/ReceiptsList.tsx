import type { Receipt } from '@invitaciones/api-client';
import { EmptyState } from '@invitaciones/ui';
import { Box, Divider, Stack, Typography } from '@mui/material';
import { formatDateTime } from '../shared/formatters';

export function ReceiptsList({ receipts }: { receipts: Receipt[] }) {
  return (
    <section aria-labelledby="receipts-title">
      <Typography id="receipts-title" component="h2" variant="h3" sx={{ mb: 2 }}>
        Comprobantes recientes
      </Typography>
      {receipts.length === 0 ? (
        <EmptyState title="Aún no hay comprobantes para mostrar." />
      ) : (
        <Stack divider={<Divider flexItem />}>
          {receipts.map((receipt) => (
            <Box
              key={receipt.id}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, py: 2, alignItems: 'center' }}
            >
              <Box>
                <Typography sx={{ fontWeight: 650 }}>Folio {receipt.folio}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatDateTime(receipt.createdAt)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>
                {formatOperation(receipt.operationType)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </section>
  );
}

function formatOperation(value: string): string {
  return value
    .toLocaleLowerCase('es-MX')
    .split('_')
    .map((part) => part.charAt(0).toLocaleUpperCase('es-MX') + part.slice(1))
    .join(' ');
}
