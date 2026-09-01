import { getLandingConfig } from '../config/landing-config';
import { buildPublicPricingMatrix, formatMxnFromCents } from '../public-pricing-model';
import type { PublicPricingState } from '../use-public-pricing';
import { landingTokens } from '../theme/landing-theme';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { LandingContainer, LandingSectionIntro } from './primitives';

const landingContent = getLandingConfig();

export interface LandingPricingProps {
  state: PublicPricingState;
  onRetry: () => void;
}

export function LandingPricing({ state, onRetry }: LandingPricingProps) {
  const headingId = 'landing-pricing-heading';
  const matrix = state.status === 'ready' ? buildPublicPricingMatrix(state.prices) : null;

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
          <PricingMessage>Los precios no están disponibles en este entorno.</PricingMessage>
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
      </LandingContainer>
    </Box>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button color="inherit" onClick={onRetry} sx={{ textTransform: 'none' }}>
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
