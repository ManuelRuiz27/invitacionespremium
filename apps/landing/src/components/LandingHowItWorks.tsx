import { landingTokens } from '../theme/landing-theme';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { Box, Typography } from '@mui/material';

const steps = [
  ['01', 'Preparamos', 'Configuramos la infraestructura del Evento y la experiencia contratada.'],
  ['02', 'Tú operas', 'Tu equipo mantiene invitados, confirmaciones, Mesas y accesos bajo control.'],
  ['03', 'Recibimos', 'El Staff valida asistentes y registra ingresos desde el Scanner.']
] as const;

export function LandingHowItWorks() {
  return (
    <Box
      id="como-funciona"
      component="section"
      aria-labelledby="landing-how-heading"
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.dark.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId="landing-how-heading"
          title="Preparado por nosotros. Operado por tu equipo."
          subtitle="Responsabilidades claras para llegar al Evento con una sola operación conectada."
          align="left"
          dark
        />
        <Box
          sx={{
            mt: 8,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' },
            borderTop: landingTokens.borders.hairlineDark
          }}
        >
          {steps.map(([number, title, description]) => (
            <Box key={number} sx={{ py: 5, pr: { md: 5 }, borderBottom: landingTokens.borders.hairlineDark }}>
              <Typography
                sx={{ ...landingTokens.typography.eyebrow, color: landingTokens.colors.dark.textMuted, mb: 4 }}
              >
                {number}
              </Typography>
              <Typography
                component="h3"
                sx={{
                  ...landingTokens.typography.display,
                  color: landingTokens.colors.dark.text,
                  fontSize: '2rem',
                  mb: 2
                }}
              >
                {title}
              </Typography>
              <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.dark.textMuted }}>
                {description}
              </Typography>
            </Box>
          ))}
        </Box>
      </LandingContainer>
    </Box>
  );
}
