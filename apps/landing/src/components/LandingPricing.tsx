import { getLandingConfig } from '../config/landing-config';
import { buildPublicPricingMatrix, formatMxnFromCents } from '../public-pricing-model';
import type { PublicPricingState } from '../use-public-pricing';
import { landingTokens } from '../theme/landing-theme';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { CommercialIntent, PriceSelection } from '../commercial-selection';
import { capacityOptions } from '../commercial-selection';
import { PriceSelectionFields } from './PriceSelectionFields';
import { scrollToLandingSection } from '../navigation';
import { LandingContainer, LandingSectionIntro } from './primitives';

const landingContent = getLandingConfig();

export interface LandingPricingProps {
  state: PublicPricingState;
  onRetry: () => void;
  intent: CommercialIntent | null;
  selection: PriceSelection;
  onSelectionChange: (selection: PriceSelection) => void;
  onChooseIntent: () => void;
  onOpenCommercial: () => void;
}

export function LandingPricing({
  state,
  onRetry,
  intent,
  selection,
  onSelectionChange,
  onChooseIntent,
  onOpenCommercial
}: LandingPricingProps) {
  const headingId = 'landing-pricing-heading';
  const matrix = state.status === 'ready' ? buildPublicPricingMatrix(state.prices) : null;
  const service = landingContent.services.items.find((item) => item.code === selection.sku)!;
  const bracket = capacityOptions.find((option) => option.value === selection.capacityMax)!;
  const price = matrix?.rows
    .find((row) => row.serviceCode === selection.sku)
    ?.brackets.find((item) => item.capacityMax === selection.capacityMax);

  return (
    <Box
      id="precios"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.pricing.title}
          subtitle={landingContent.pricing.subtitle}
          align="center"
          dark
        />

        <Typography
          variant="body2"
          sx={{
            ...landingTokens.typography.body,
            color: landingTokens.colors.dark.textMuted,
            textAlign: 'center',
            maxWidth: 720,
            mx: 'auto',
            mb: 6
          }}
        >
          {landingContent.pricing.note}
        </Typography>

        {state.status === 'loading' && (
          <Box role="status" aria-live="polite" sx={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
            <CircularProgress aria-label="Consultando precios públicos" color="inherit" />
          </Box>
        )}

        {state.status === 'unavailable' && (
          <PricingMessage action={<RetryButton onRetry={onRetry} />}>
            Los precios no están disponibles en este momento.
          </PricingMessage>
        )}

        {state.status === 'error' && (
          <PricingMessage action={<RetryButton onRetry={onRetry} />}>
            No pudimos consultar los precios en este momento.
          </PricingMessage>
        )}

        {state.status === 'ready' && !matrix && (
          <PricingMessage action={<RetryButton onRetry={onRetry} />}>
            Los precios públicos están temporalmente no disponibles.
          </PricingMessage>
        )}

        {matrix && (
          <Box
            aria-label="Precios por servicio y capacidad"
            sx={{
              display: { xs: 'none', md: 'block' },
              borderTop: landingTokens.borders.hairlineDark,
              borderBottom: landingTokens.borders.hairlineDark,
              maxWidth: 1080,
              mx: 'auto'
            }}
          >
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: 'minmax(210px, 1.2fr) repeat(3, 1fr)',
                borderBottom: landingTokens.borders.hairlineDark
              }}
            >
              <Box sx={{ p: 3 }} />
              {matrix.columns.map((column) => (
                <Typography
                  key={column}
                  sx={{
                    ...landingTokens.typography.eyebrow,
                    color: landingTokens.colors.dark.textMuted,
                    p: 3,
                    borderLeft: landingTokens.borders.hairlineDark
                  }}
                >
                  {column}
                </Typography>
              ))}
            </Box>

            {matrix.rows.map((row, rowIndex) => (
              <Box
                key={row.serviceCode}
                data-service-code={row.serviceCode}
                sx={{
                  display: { xs: 'block', md: 'grid' },
                  gridTemplateColumns: 'minmax(210px, 1.2fr) repeat(3, 1fr)',
                  borderBottom: rowIndex < matrix.rows.length - 1 ? landingTokens.borders.hairlineDark : undefined
                }}
              >
                <Typography
                  component="h3"
                  sx={{
                    ...landingTokens.typography.headline,
                    color: landingTokens.colors.dark.text,
                    fontSize: '1.25rem',
                    p: 3
                  }}
                >
                  {row.displayName}
                </Typography>
                {row.brackets.map((bracket) => (
                  <Box
                    key={bracket.label}
                    sx={{
                      p: 3,
                      borderLeft: { md: landingTokens.borders.hairlineDark },
                      borderTop: { xs: landingTokens.borders.hairlineDark, md: 'none' }
                    }}
                  >
                    <Typography
                      sx={{
                        ...landingTokens.typography.eyebrow,
                        color: landingTokens.colors.dark.textMuted,
                        display: { xs: 'block', md: 'none' },
                        mb: 1
                      }}
                    >
                      {bracket.label}
                    </Typography>
                    <Typography
                      sx={{
                        ...landingTokens.typography.display,
                        color: landingTokens.colors.dark.text,
                        fontSize: { xs: '1.75rem', md: '2rem' },
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {formatMxnFromCents(bracket.amountMxnCents)}{' '}
                      <Typography
                        component="span"
                        sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}
                      >
                        MXN
                      </Typography>
                    </Typography>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ maxWidth: 850, mx: 'auto', mt: 5, pt: 4, borderTop: landingTokens.borders.hairlineDark }}>
          <Typography component="h3" variant="h5" sx={{ mb: 3 }}>
            Tu selección
          </Typography>
          <PriceSelectionFields value={selection} onChange={onSelectionChange} />
          <Box role="status" aria-live="polite" aria-atomic="true" sx={{ my: 3 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {service.name} · {bracket.label}
            </Typography>
            <Typography sx={{ fontSize: '1.5rem', mt: 1 }}>
              {price ? `${formatMxnFromCents(price.amountMxnCents)} MXN antes de IVA` : 'Precio pendiente de consulta'}
            </Typography>
            <Typography variant="body2">
              Precio estándar por evento, antes de IVA. Esta selección no fija una cotización.
            </Typography>
          </Box>
          <Box component="ul" sx={{ pl: 2.5 }}>
            {service.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </Box>
          <Typography sx={{ my: 2 }}>
            {intent === 'PLANNER_AGENCY'
              ? 'Ofrece invitaciones digitales a tus clientes y organiza sus invitados, confirmaciones y accesos. Las condiciones para planners y agencias se evalúan por separado; este precio estándar no es una tarifa especial para profesionales.'
              : intent === 'VENUE'
                ? 'Organiza la recepción de tus eventos con pases QR y control de entradas. La propuesta para salones y jardines se cotiza por separado del precio estándar, según la operación y los eventos efectivamente cobrados del mes anterior. No depende de la cantidad de invitados seleccionada ni del volumen declarado. Esta selección no asigna una tarifa por volumen.'
                : intent === 'INDIVIDUAL'
                  ? 'Explora los servicios y elige una opción según la cantidad de invitados. Consulta las demostraciones y conoce cómo preparamos tu evento; esta consulta es informativa.'
                  : 'Elige cómo contratar para conocer el siguiente paso.'}
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            El escaneo de pases QR requiere conexión. Atendemos eventos de 1 a 150 personas; no hay precio confirmado
            para más de 150.
          </Typography>
          <Button
            variant="contained"
            sx={landingTokens.buttons.primary}
            onClick={
              !intent
                ? onChooseIntent
                : intent === 'INDIVIDUAL'
                  ? () => scrollToLandingSection('#como-funciona')
                  : onOpenCommercial
            }
          >
            {!intent
              ? 'Elegir cómo contratar'
              : intent === 'INDIVIDUAL'
                ? 'Conocer cómo funciona'
                : intent === 'VENUE'
                  ? 'Solicitar propuesta para mi salón'
                  : 'Consultar condiciones para planners'}
          </Button>
        </Box>
      </LandingContainer>
    </Box>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button color="inherit" onClick={onRetry} sx={{ textTransform: 'none', minHeight: 44 }}>
      Reintentar
    </Button>
  );
}

function PricingMessage({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <Alert
      severity="info"
      action={action}
      sx={{
        maxWidth: 720,
        mx: 'auto',
        bgcolor: landingTokens.colors.dark.surface,
        color: landingTokens.colors.dark.text,
        border: landingTokens.borders.hairlineDark,
        borderRadius: 0
      }}
    >
      {children}
    </Alert>
  );
}
