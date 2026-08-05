import { Box, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { landingTokens } from '../theme/landing-theme';

import solutionInvitation from '../assets/landing/solution-invitation.svg';
import solutionConfirmation from '../assets/landing/solution-confirmation.svg';
import solutionTables from '../assets/landing/solution-tables.svg';
import solutionReception from '../assets/landing/solution-reception.svg';
import solutionClosing from '../assets/landing/solution-closing.svg';

const landingContent = getLandingConfig();

const assets = [
  solutionInvitation,
  solutionConfirmation,
  solutionTables,
  solutionReception,
  solutionClosing
];

const alts = [
  "Ilustración del sistema de invitaciones",
  "Ilustración del proceso de confirmación",
  "Ilustración de la gestión de mesas",
  "Ilustración del control de recepción",
  "Ilustración del cierre post-evento"
];

export function LandingSolution() {
  const headingId = 'landing-solution-heading';

  return (
    <Box
      id="solucion"
      component="section"
      aria-labelledby={headingId}
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.solution.title}
          subtitle={landingContent.solution.subtitle}
          align="center"
          dark={true}
        />

        <Box sx={{ mt: { xs: 8, md: 12 } }}>
          {/* Top Row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: { xs: 6, md: 8 },
              mb: { xs: 6, md: 8 }
            }}
          >
            {landingContent.solution.pillars.slice(0, 2).map((pillar, index) => (
              <Box
                key={pillar.title}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    border: landingTokens.borders.hairlineDark,
                    p: { xs: 3, md: 5 },
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: landingTokens.colors.dark.surface
                  }}
                >
                  <img src={assets[index]} alt={alts[index]} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
                </Box>
                <Box>
                  <Typography variant="h3" component="h3" sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.dark.text, mb: 1, fontSize: '1.5rem' }}>
                    {pillar.title}
                  </Typography>
                  <Typography variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                    {pillar.description}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Bottom Row */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              gap: { xs: 6, md: 8 },
              mb: { xs: 6, md: 8 }
            }}
          >
            {landingContent.solution.pillars.slice(2).map((pillar, index) => {
              const realIndex = index + 2;
              return (
                <Box
                  key={pillar.title}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3
                  }}
                >
                  <Box
                    sx={{
                      width: '100%',
                      border: landingTokens.borders.hairlineDark,
                      p: { xs: 3, md: 4 },
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: landingTokens.colors.dark.surface
                    }}
                  >
                    <img src={assets[realIndex]} alt={alts[realIndex]} style={{ maxWidth: '100%', height: 'auto', display: 'block' }} />
                  </Box>
                  <Box>
                    <Typography variant="h3" component="h3" sx={{ ...landingTokens.typography.headline, color: landingTokens.colors.dark.text, mb: 1, fontSize: '1.25rem' }}>
                      {pillar.title}
                    </Typography>
                    <Typography variant="body1" sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                      {pillar.description}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Rule Notice */}
          <Box 
            sx={{ 
              p: { xs: 3, md: 4 }, 
              borderTop: landingTokens.borders.hairlineDark,
              borderBottom: landingTokens.borders.hairlineDark,
              textAlign: 'center'
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.dark.text }}
            >
              {landingContent.solution.ruleNotice}
            </Typography>
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
