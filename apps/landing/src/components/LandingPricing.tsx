import { getLandingConfig } from '../config/landing-config';
import { Box, Typography } from '@mui/material';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';
import { LandingContainer } from './primitives/LandingContainer';

const landingContent = getLandingConfig();

export function LandingPricing() {
  const headingId = 'landing-pricing-heading';

  return (
    <Box id="precios" component="section" aria-labelledby={headingId} sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}>
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.pricing.title}
          subtitle={landingContent.pricing.subtitle}
          align="center"
          dark={true}
        />

        <Box sx={{ mb: { xs: 4, md: 6 }, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.dark.textMuted }}>
            1 crédito = ${landingContent.pricing.unitValueMxn} MXN
          </Typography>
        </Box>

        <Box
          sx={{
            bgcolor: landingTokens.colors.dark.surface,
            border: landingTokens.borders.hairlineDark,
            borderRadius: 0,
            overflow: 'hidden',
            maxWidth: 1000,
            mx: 'auto'
          }}
        >
          {/* Header Row (Desktop only) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: '340px 1fr 1fr',
              borderBottom: landingTokens.borders.hairlineDark,
              bgcolor: landingTokens.colors.dark.surface
            }}
          >
            <Box sx={{ p: 4 }} />
            <Box sx={{ p: 4, borderLeft: landingTokens.borders.hairlineDark }}>
              <Typography variant="h3" sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.dark.text, fontSize: '1.25rem', mb: 1 }}>
                {landingContent.pricing.planner.title}
              </Typography>
              <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                {landingContent.pricing.planner.description}
              </Typography>
            </Box>
            <Box sx={{ p: 4, borderLeft: landingTokens.borders.hairlineDark }}>
              <Typography variant="h3" sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.dark.text, fontSize: '1.25rem', mb: 1 }}>
                {landingContent.pricing.organization.title}
              </Typography>
              <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                {landingContent.pricing.organization.description}
              </Typography>
            </Box>
          </Box>

          {/* Service Rows */}
          {landingContent.services.items.map((service, index) => (
            <Box
              key={service.code}
              data-service-code={service.code}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '340px 1fr 1fr' },
                borderBottom: index < landingContent.services.items.length - 1 ? landingTokens.borders.hairlineDark : 'none'
              }}
            >
              {/* Service Info */}
              <Box sx={{ p: 4, borderBottom: { xs: landingTokens.borders.hairlineDark, md: 'none' } }}>
                <Typography variant="h4" sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.dark.text, fontSize: '1.25rem', mb: 1 }}>
                  {service.name}
                </Typography>
                <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                  {service.description}
                </Typography>
              </Box>

              {/* Planner Price */}
              <Box data-client-type="planner" sx={{ p: 4, borderLeft: { md: landingTokens.borders.hairlineDark }, borderBottom: { xs: landingTokens.borders.hairlineDark, md: 'none' }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="overline" sx={{ ...landingTokens.typography.eyebrow, display: { xs: 'block', md: 'none' }, mb: 1, color: landingTokens.colors.dark.textMuted }}>
                  {landingContent.pricing.planner.title}
                </Typography>
                <Typography variant="h3" sx={{ ...landingTokens.typography.display, color: landingTokens.colors.dark.text, fontSize: '2rem', mb: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  {service.prices.planner.credits}
                  <Typography component="span" variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>créditos</Typography>
                </Typography>
                <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                  ${service.prices.planner.mxn} MXN
                </Typography>
              </Box>

              {/* Organization Price */}
              <Box data-client-type="organization" sx={{ p: 4, borderLeft: { md: landingTokens.borders.hairlineDark }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="overline" sx={{ ...landingTokens.typography.eyebrow, display: { xs: 'block', md: 'none' }, mb: 1, color: landingTokens.colors.dark.textMuted }}>
                  {landingContent.pricing.organization.title}
                </Typography>
                <Typography variant="h3" sx={{ ...landingTokens.typography.display, color: landingTokens.colors.dark.text, fontSize: '2rem', mb: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  {service.prices.organization.credits}
                  <Typography component="span" variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>créditos</Typography>
                </Typography>
                <Typography variant="body2" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                  ${service.prices.organization.mxn} MXN
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </LandingContainer>
    </Box>
  );
}
