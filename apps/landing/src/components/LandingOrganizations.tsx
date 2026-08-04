import { getLandingConfig } from '../config/landing-config';
import { Box, Container, Grid, Typography, Divider } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { landingTokens } from '../theme/landing-theme';
import { LandingSectionIntro } from './primitives/LandingSectionIntro';

const landingContent = getLandingConfig();

export function LandingOrganizations() {
  const headingId = 'landing-organizations-heading';

  return (
    <Box id="organizaciones" component="section" aria-labelledby={headingId} sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.organizations.title}
          subtitle={landingContent.organizations.subtitle}
          align="center"
        />

        <Box
          sx={{
            bgcolor: landingTokens.surfaces.organization.background,
            border: landingTokens.surfaces.organization.border,
            borderRadius: 4,
            overflow: 'hidden',
            maxWidth: 1000,
            mx: 'auto'
          }}
        >
          {/* Institutional Notice and Operational Abstract Representation */}
          <Box sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', borderBottom: landingTokens.borders.editorial }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 3, bgcolor: 'primary.light', color: 'primary.main', mb: 3 }}>
              <BusinessIcon fontSize="large" aria-hidden="true" />
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary', maxWidth: 720, mx: 'auto', fontSize: '1.1rem', lineHeight: 1.6 }}>
              {landingContent.organizations.notice}
            </Typography>
            
            {/* Visual Operational Abstract */}
            <Box sx={{ mt: 5, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }} aria-hidden="true">
               <Box sx={{ width: 140, height: 80, bgcolor: 'background.paper', borderRadius: 2, border: landingTokens.borders.editorial, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                  <Box sx={{ width: 60, height: 8, bgcolor: 'grey.300', borderRadius: 1 }} />
               </Box>
               <Box sx={{ width: 160, height: 90, bgcolor: 'background.paper', borderRadius: 2, border: landingTokens.borders.editorial, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(23,35,60,0.06)', zIndex: 1, transform: 'translateY(-10px)' }}>
                  <Box sx={{ width: 80, height: 10, bgcolor: 'primary.main', borderRadius: 1 }} />
               </Box>
               <Box sx={{ width: 140, height: 80, bgcolor: 'background.paper', borderRadius: 2, border: landingTokens.borders.editorial, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
                  <Box sx={{ width: 60, height: 8, bgcolor: 'grey.300', borderRadius: 1 }} />
               </Box>
            </Box>
          </Box>

          {/* Roles Division */}
          <Grid container sx={{ bgcolor: 'background.paper' }}>
            {landingContent.organizations.roles.map((role, idx) => (
              <Grid
                size={{ xs: 12, md: 6 }}
                key={role.name}
                sx={{
                  p: { xs: 4, md: 5 },
                  borderBottom: { xs: idx === 0 ? landingTokens.borders.editorial : 'none', md: 'none' },
                  borderRight: { md: idx === 0 ? landingTokens.borders.editorial : 'none' }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5 }}>
                  <Box sx={{ color: 'primary.main', mt: 0.5 }}>
                    {idx === 0 ? <SupervisorAccountIcon fontSize="large" aria-hidden="true" /> : <AccountCircleIcon fontSize="large" aria-hidden="true" />}
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, fontSize: '1.25rem', mb: 1.5, color: 'text.primary' }}>
                      {role.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {role.description}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Container>
    </Box>
  );
}
