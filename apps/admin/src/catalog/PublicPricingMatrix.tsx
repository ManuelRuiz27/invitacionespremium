import type { AdminPrice, AdminService, ApiClient, PublicPricing } from '@invitaciones/api-client';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminQueryKeys } from '../app/query-client';
import { formatDate } from '../shared/admin-labels';
import { serviceLabels } from './catalog-format';

const services = ['PHYSICAL_QR', 'FLYER', 'FLIPBOOK'] as const;
const ranges = [
  [1, 50],
  [51, 100],
  [101, 150]
] as const;
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export interface StandardPriceTarget {
  serviceId: string;
  capacityMin: number;
  capacityMax: number;
}

export function PublicPricingMatrix({
  apiClient,
  prices,
  references,
  refreshing,
  onRefresh,
  onConfigure,
  onReviewServices
}: {
  apiClient: ApiClient;
  prices: AdminPrice[];
  references: Pick<AdminService, 'id' | 'code'>[];
  refreshing: boolean;
  onRefresh: () => void;
  onConfigure: (target: StandardPriceTarget) => void;
  onReviewServices: () => void;
}) {
  const publication = useQuery({
    queryKey: adminQueryKeys.publicPricing,
    queryFn: ({ signal }) => apiClient.publicPricing.list(signal)
  });
  const now = new Date();
  const verified = publication.isSuccess && !publication.isFetching && !refreshing;
  const cells = services.flatMap((code) =>
    ranges.map(([min, max]) => {
      const history = prices.filter(
        (price) =>
          price.serviceCode === code &&
          price.pricingVersion === 2 &&
          price.commercialChannel === 'STANDARD' &&
          price.capacityMin === min &&
          price.capacityMax === max &&
          price.venueTier === null
      );
      const current = history.filter(
        (price) => new Date(price.validFrom) <= now && (price.validUntil === null || now < new Date(price.validUntil))
      );
      const future = history
        .filter((price) => now < new Date(price.validFrom))
        .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      const published = (publication.data ?? []).filter(
        (price) => price.serviceCode === code && price.capacityMin === min && price.capacityMax === max
      );
      const matches = current.length === 1 && published.length === 1 && samePrice(current[0]!, published[0]!);
      return { code, min, max, current, future, published, matches };
    })
  );
  const count = cells.filter((cell) => cell.matches).length;

  return (
    <Stack component="section" aria-labelledby="standard-pricing-title" spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
        <Box>
          <Typography id="standard-pricing-title" component="h2" variant="h3">
            Tarifas públicas STANDARD
          </Typography>
          <Typography color="text.secondary">
            Tres servicios por tres rangos. PARTNER y VENUE permanecen en el historial por separado.
          </Typography>
        </Box>
        <Button
          disabled={refreshing || publication.isFetching}
          onClick={() => {
            onRefresh();
            void publication.refetch();
          }}
        >
          Actualizar catálogo
        </Button>
      </Stack>
      <Alert severity={verified && count === 9 ? 'success' : 'info'}>
        {verified
          ? `${count} de 9 tarifas publicadas y coincidentes con el historial vigente.`
          : publication.isError
            ? 'No pudimos verificar la publicación. Actualiza el catálogo para consultar la API pública.'
            : 'Consultando la publicación y el historial vigentes…'}
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        {cells.map((cell) => {
          const reference = references.find((service) => service.code === cell.code);
          const current = cell.current.length === 1 ? cell.current[0] : undefined;
          const label = `${serviceLabels[cell.code]} · ${cell.min}–${cell.max} personas`;
          return (
            <Paper
              key={`${cell.code}-${cell.min}`}
              variant="outlined"
              component="article"
              aria-label={label}
              sx={{ p: 2 }}
            >
              <Stack spacing={1.25}>
                <Typography component="h3" variant="h4">
                  {label}
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  {cell.current.length > 1
                    ? 'Conflicto de vigencias'
                    : current
                      ? 'Tarifa vigente'
                      : 'Tarifa vigente faltante'}
                </Typography>
                {current ? (
                  <>
                    <Typography>
                      {current.credits} créditos · {money.format(current.credits * 20)}
                    </Typography>
                    <Typography variant="body2">
                      Desde {formatDate(current.validFrom)}
                      {current.validUntil
                        ? ` hasta ${formatDate(current.validUntil)} (fin exclusivo)`
                        : ' · Sin fecha de cierre'}
                    </Typography>
                    <Typography variant="body2">
                      {!verified
                        ? 'Publicación sin verificar'
                        : cell.matches
                          ? 'Publicada en la landing'
                          : 'No publicada o no coincide con la API pública'}
                    </Typography>
                  </>
                ) : null}
                {cell.future.map((price) => (
                  <Typography key={price.id} variant="body2">
                    Programada: {price.credits} créditos · {money.format(price.credits * 20)} ·{' '}
                    {formatDate(price.validFrom)}
                    {price.validUntil ? ` — ${formatDate(price.validUntil)}` : ''}
                  </Typography>
                ))}
                {cell.future.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin cambios futuros programados
                  </Typography>
                ) : null}
                {reference ? (
                  <Button
                    disabled={refreshing}
                    onClick={() =>
                      onConfigure({ serviceId: reference.id, capacityMin: cell.min, capacityMax: cell.max })
                    }
                  >
                    {current ? 'Programar cambio' : 'Configurar tarifa'}
                  </Button>
                ) : (
                  <Button onClick={onReviewServices}>Revisar servicio</Button>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Box>
      <Alert
        severity="info"
        action={
          <Button color="inherit" onClick={onReviewServices}>
            Revisar servicios
          </Button>
        }
      >
        Una tarifa vigente no se publica si su servicio está inactivo. Revisa el estado antes de crear otra tarifa. La
        equivalencia vigente es 1 crédito = $20 MXN.
      </Alert>
    </Stack>
  );
}

function samePrice(price: AdminPrice, published: PublicPricing) {
  return (
    price.credits === published.credits &&
    price.validFrom === published.validFrom &&
    price.validUntil === published.validUntil &&
    price.credits * 2000 === published.amountMxnCents
  );
}
