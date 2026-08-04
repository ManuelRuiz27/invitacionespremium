import { Alert, Box, Container, Typography } from '@mui/material';
import { getLandingConfig } from '../config/landing-config';
import { LandingSectionIntro } from './primitives';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

const landingContent = getLandingConfig();

export function LandingSolution() {
  return (
    <Box id="solucion" component="section" aria-label={landingContent.solution.title} sx={{ py: { xs: 8, md: 12 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <LandingSectionIntro
            title={landingContent.solution.title}
            subtitle={landingContent.solution.subtitle}
            align="center"
          />

        {/* Aviso de Regla Conceptual Obligatoria */}
        <Box sx={{ maxWidth: 720, mx: 'auto', mb: { xs: 6, md: 8 } }}>
          <Alert
            icon={<VerifiedUserIcon />}
            severity="info"
            sx={{
              borderRadius: 3,
              bgcolor: 'rgba(49, 87, 200, 0.06)',
              color: 'text.primary',
              border: '1px solid rgba(49, 87, 200, 0.2)',
              '& .MuiAlert-icon': { color: 'primary.main', mt: 0.25 }
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {landingContent.solution.ruleNotice}
            </Typography>
          </Alert>
        </Box>

        {/* Sistema Integrado (Cohesive Editorial Surface) */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
            bgcolor: 'background.paper',
            borderRadius: 4,
            border: '1px solid',
            borderColor: 'divider',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(23, 35, 60, 0.04)',
            '& > div': {
              p: { xs: 4, md: 5 },
              borderRight: '1px solid',
              borderBottom: '1px solid',
              borderColor: 'divider'
            },
            // Responsive border overrides to prevent hanging borders
            '@media (max-width: 599.95px)': {
              '& > div': { borderRight: 'none' },
              '& > div:last-child': { borderBottom: 'none' }
            },
            '@media (min-width: 600px) and (max-width: 899.95px)': {
              '& > div:nth-of-type(2n)': { borderRight: 'none' },
              '& > div:last-child': { borderBottom: 'none' }
            },
            '@media (min-width: 900px)': {
              '& > div:nth-of-type(3n)': { borderRight: 'none' },
              '& > div:nth-last-of-type(-n+2)': { borderBottom: 'none' },
              '& > div:last-child': { borderRight: '1px solid' } // Since item 5 is not 3n, it gets a right border by default, which is good to close the 2nd col.
            }
          }}
        >
          {landingContent.solution.pillars.map((pillar, index) => (
            <Box key={index}>
              <Typography
                aria-hidden="true"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  color: 'primary.main',
                  mb: 2,
                  letterSpacing: '0.05em'
                }}
              >
                COMPONENTE {String(index + 1).padStart(2, '0')}
              </Typography>
              <Typography variant="h3" component="h3" sx={{ fontWeight: 700, mb: 1.5, fontSize: '1.2rem' }}>
                {pillar.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {pillar.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
