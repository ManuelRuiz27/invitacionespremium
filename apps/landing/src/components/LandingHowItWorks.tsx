import { landingTokens } from '../theme/landing-theme';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { Box, Typography } from '@mui/material';

const steps = [
  ['01', 'Nos cuentas tu evento', 'Definimos contigo la experiencia que necesitan tus invitados.'],
  ['02', 'Nosotros lo preparamos', 'Configuramos la invitación, las mesas y la operación digital antes de entregártela.'],
  ['03', 'Tú organizas', 'Gestionas invitados, acompañantes, confirmaciones y asignaciones desde tu espacio de trabajo.'],
  ['04', 'Tu equipo recibe', 'Habilitas accesos temporales para registrar entradas el día del evento.']
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
          title="Un servicio preparado para que tú operes"
          subtitle="InvitacionesPremium se encarga de la preparación técnica; tú mantienes las decisiones del evento."
          align="left"
          dark
        />
        <Box
          sx={{
            mt: 8,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(4,1fr)' },
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
