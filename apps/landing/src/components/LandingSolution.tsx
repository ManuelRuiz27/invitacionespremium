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
      sx={{ py: { xs: 10, md: 16 }, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId={headingId}
          title={landingContent.solution.title}
          subtitle={landingContent.solution.subtitle}
          align="center"
          dark={true}
        />

        <Box sx={{ mt: { xs: 12, md: 20 }, display: 'flex', flexDirection: 'column', gap: { xs: 16, md: 24 } }}>
          {landingContent.solution.pillars.map((pillar, index) => {
            const isEven = index % 2 === 0;
            return (
              <Box
                key={pillar.title}
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: isEven ? 'row' : 'row-reverse' },
                  alignItems: 'center',
                  gap: { xs: 6, md: 12 }
                }}
              >
                <Box sx={{ flex: 1, maxWidth: { xs: '100%', md: 500 } }}>
                  <Typography
                    variant="h3"
                    component="h3"
                    sx={{
                      ...landingTokens.typography.display,
                      color: landingTokens.colors.dark.text,
                      mb: 3,
                      fontSize: { xs: '2rem', md: '2.5rem' }
                    }}
                  >
                    {pillar.title}
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{
                      ...landingTokens.typography.body,
                      color: landingTokens.colors.dark.textMuted,
                      fontSize: '1.15rem'
                    }}
                  >
                    {pillar.description}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    flex: 1.5,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    position: 'relative'
                  }}
                >
                  <img
                    src={assets[index]}
                    alt={alts[index]}
                    style={{
                      width: '100%',
                      maxWidth: '600px',
                      height: 'auto',
                      display: 'block'
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Rule Notice */}
        <Box 
          sx={{ 
            mt: { xs: 12, md: 20 },
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
      </LandingContainer>
    </Box>
  );
}
