import { getLandingConfig, type LandingConfig } from '../config/landing-config';
import { landingTokens } from '../theme/landing-theme';
import { LandingActionGroup, LandingBrandLockup, LandingEyebrow, LandingProductStage } from './primitives';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Grid, Stack, Typography } from '@mui/material';

export interface LandingHeroProps {
  onOpenRegister: () => void;
  /** Optional injectable config for testing. Defaults to `getLandingConfig()`. */
  config?: LandingConfig;
}

export function LandingHero({ onOpenRegister, config }: LandingHeroProps) {
  const landingContent = config ?? getLandingConfig();

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 6, md: 10 },
        background: landingTokens.surfaces.heroGradient,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`
      }}
    >
      <Box sx={{ maxWidth: 'lg', mx: 'auto', px: { xs: 2, sm: 3 } }}>
        <Grid container spacing={{ xs: 5, md: 6 }} sx={{ alignItems: 'center' }}>
          {/* Content column */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={3}>
              <Box>
                <LandingEyebrow icon={<EventAvailableIcon fontSize="small" />} label={landingContent.hero.badge} />
              </Box>

              <Typography
                variant="h1"
                component="h1"
                sx={{
                  color: 'text.primary',
                  ...landingTokens.typography.display,
                  fontSize: { xs: '2.2rem', sm: '3rem', md: '3.4rem' }
                }}
              >
                {landingContent.hero.title}
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                  fontSize: { xs: '1.05rem', md: '1.18rem' },
                  lineHeight: 1.65,
                  maxWidth: 620
                }}
              >
                {landingContent.hero.subtitle}
              </Typography>

              <LandingActionGroup>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  startIcon={<PersonAddIcon />}
                  onClick={onOpenRegister}
                  sx={{
                    minHeight: 52,
                    px: 3.5,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: `${landingTokens.radius.button}px`
                  }}
                >
                  {landingContent.hero.primaryCta}
                </Button>

                <Button
                  variant="outlined"
                  color="primary"
                  size="large"
                  endIcon={<ArrowForwardIcon />}
                  href={landingContent.urls.login}
                  disabled={!landingContent.urls.login}
                  sx={{
                    minHeight: 52,
                    px: 3,
                    fontSize: '1rem',
                    fontWeight: 650,
                    borderRadius: `${landingTokens.radius.button}px`
                  }}
                >
                  {landingContent.hero.secondaryCta}
                </Button>
              </LandingActionGroup>
            </Stack>
          </Grid>

          {/* Visual column: brand exploration + product stage */}
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack spacing={3}>
              <LandingBrandLockup
                variant="stacked"
                name={landingContent.brand.name}
                tagline={landingContent.brand.tagline}
              />

              <LandingProductStage
                pillars={landingContent.solution.pillars}
                ruleNotice={landingContent.solution.ruleNotice}
              />
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
