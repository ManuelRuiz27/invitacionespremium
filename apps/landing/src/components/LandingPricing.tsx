import { getLandingConfig } from '../config/landing-config';
import { Box, Typography } from '@mui/material';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';
import { LandingContainer } from './primitives/LandingContainer';

const landingContent = getLandingConfig();

export function LandingPricing() {
  const headingId = 'landing-pricing-heading';

  return (
    <Box id="precios" component="section" aria-labelledby={headingId} sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.default' }}>
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.pricing.title}
          subtitle={landingContent.pricing.subtitle}
          align="center"
        />

        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            1 crédito = ${landingContent.pricing.unitValueMxn} MXN
          </Typography>
        </Box>

        <Box
          sx={{
            bgcolor: landingTokens.surfaces.pricing.background,
            border: landingTokens.surfaces.pricing.border,
            boxShadow: landingTokens.surfaces.pricing.shadow,
            borderRadius: 4,
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
              borderBottom: landingTokens.borders.editorial,
              bgcolor: 'background.paper'
            }}
          >
            <Box sx={{ p: 4 }} />
            <Box sx={{ p: 4, borderLeft: landingTokens.borders.editorial }}>
              <Typography variant="h3" sx={{ fontWeight: 800, fontSize: '1.25rem', mb: 1 }}>
                {landingContent.pricing.planner.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {landingContent.pricing.planner.description}
              </Typography>
            </Box>
            <Box sx={{ p: 4, borderLeft: landingTokens.borders.editorial }}>
              <Typography variant="h3" sx={{ fontWeight: 800, fontSize: '1.25rem', mb: 1 }}>
                {landingContent.pricing.organization.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
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
                borderBottom: index < landingContent.services.items.length - 1 ? landingTokens.borders.editorial : 'none'
              }}
            >
              {/* Service Info */}
              <Box sx={{ p: 4, borderBottom: { xs: landingTokens.borders.editorial, md: 'none' } }}>
                <Typography variant="h4" sx={{ fontWeight: 800, fontSize: '1.25rem', mb: 1 }}>
                  {service.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {service.description}
                </Typography>
              </Box>

              {/* Planner Price */}
              <Box sx={{ p: 4, borderLeft: { md: landingTokens.borders.editorial }, borderBottom: { xs: landingTokens.borders.editorial, md: 'none' }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="overline" sx={{ display: { xs: 'block', md: 'none' }, mb: 1, color: 'text.secondary', fontWeight: 700 }}>
                  {landingContent.pricing.planner.title}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, fontSize: '2rem', color: 'primary.main', mb: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  {service.prices.planner.credits}
                  <Typography component="span" variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>créditos</Typography>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                  ${service.prices.planner.mxn} MXN
                </Typography>
              </Box>

              {/* Organization Price */}
              <Box sx={{ p: 4, borderLeft: { md: landingTokens.borders.editorial }, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: { xs: 'background.paper', md: 'transparent' } }}>
                <Typography variant="overline" sx={{ display: { xs: 'block', md: 'none' }, mb: 1, color: 'text.secondary', fontWeight: 700 }}>
                  {landingContent.pricing.organization.title}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, fontSize: '2rem', color: 'primary.main', mb: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  {service.prices.organization.credits}
                  <Typography component="span" variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>créditos</Typography>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
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
