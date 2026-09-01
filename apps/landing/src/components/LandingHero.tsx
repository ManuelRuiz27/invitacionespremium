import flipbookAvif from '../assets/product-proof/flipbook-public-mobile.avif';
import flipbookWebp from '../assets/product-proof/flipbook-public-mobile.webp';
import scannerAvif from '../assets/product-proof/scanner-result-mobile.avif';
import scannerWebp from '../assets/product-proof/scanner-result-mobile.webp';
import rsvpAvif from '../assets/product-proof/rsvp-public-mobile.avif';
import rsvpWebp from '../assets/product-proof/rsvp-public-mobile.webp';
import seatingAvif from '../assets/product-proof/seating-desktop.avif';
import seatingWebp from '../assets/product-proof/seating-desktop.webp';
import { getLandingConfig, type LandingConfig } from '../config/landing-config';
import { scrollToLandingSection } from '../navigation';
import { landingTokens } from '../theme/landing-theme';
import { ProductProofPicture } from './ProductProofPicture';
import { LandingActionGroup, LandingContainer, LandingEyebrow } from './primitives';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { Box, Button, Stack, Typography } from '@mui/material';

export interface LandingHeroProps {
  config?: LandingConfig;
}

export function LandingHero({ config }: LandingHeroProps) {
  const content = config ?? getLandingConfig();
  return (
    <Box
      component="section"
      sx={{
        minHeight: { xs: 'auto', lg: '92vh' },
        pt: { xs: 13, md: 16 },
        pb: { xs: 9, md: 12 },
        bgcolor: landingTokens.colors.dark.background,
        color: landingTokens.colors.dark.text,
        overflow: 'hidden'
      }}
    >
      <LandingContainer>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, .86fr) minmax(520px, 1.14fr)' },
            gap: { xs: 8, lg: 5 },
            alignItems: 'center'
          }}
        >
          <Stack spacing={3.5} sx={{ position: 'relative', zIndex: 2 }}>
            <LandingEyebrow icon={<AutoAwesomeIcon fontSize="small" />} label={content.hero.badge} tone="dark" />
            <Typography
              component="h1"
              sx={{
                ...landingTokens.typography.display,
                fontSize: { xs: '2.75rem', sm: '4rem', lg: '4.65rem' },
                maxWidth: 760,
                textWrap: 'balance'
              }}
            >
              {content.hero.title}
            </Typography>
            <Typography
              sx={{
                ...landingTokens.typography.body,
                color: landingTokens.colors.dark.textMuted,
                fontSize: { xs: '1.08rem', md: '1.22rem' },
                maxWidth: 620
              }}
            >
              {content.hero.subtitle}
            </Typography>
            <LandingActionGroup>
              <Button
                variant="contained"
                size="large"
                onClick={() => scrollToLandingSection('#producto')}
                sx={primaryButtonSx}
              >
                {content.hero.primaryCta}
              </Button>
              <Button
                variant="outlined"
                size="large"
                endIcon={<ArrowForwardIcon />}
                onClick={() => scrollToLandingSection('#precios')}
                sx={secondaryButtonSx}
              >
                {content.hero.secondaryCta}
              </Button>
            </LandingActionGroup>
            <Typography variant="body2" sx={{ color: landingTokens.colors.dark.textMuted }}>
              Pantallas reales · Datos de demostración
            </Typography>
          </Stack>
          <Box
            aria-label="Vistas reales de Invitación, Mesas y acceso"
            sx={{ position: 'relative', minHeight: { xs: 560, sm: 680, lg: 690 } }}
          >
            <ProductProofPicture
              avif={seatingAvif}
              webp={seatingWebp}
              alt="Workspace real de Mesas con Croquis y distribución"
              width={2160}
              height={1500}
              sx={{
                position: 'absolute',
                width: { xs: '92%', lg: '96%' },
                top: { xs: 80, lg: 54 },
                right: { xs: '-24%', lg: '-18%' },
                border: landingTokens.borders.hairlineDark,
                boxShadow: landingTokens.shadows.productLayer,
                opacity: 0.72
              }}
              imageStyle={{ aspectRatio: '1.44', objectFit: 'cover', objectPosition: 'center' }}
            />
            <ProductProofPicture
              avif={flipbookAvif}
              webp={flipbookWebp}
              alt="Invitación Premium real abierta en móvil"
              width={780}
              height={1688}
              sx={{
                position: 'absolute',
                width: { xs: 238, sm: 300, lg: 318 },
                left: { xs: 0, sm: '7%', lg: '2%' },
                top: 0,
                zIndex: 2,
                border: '8px solid #171b22',
                borderRadius: '28px',
                overflow: 'hidden',
                boxShadow: '0 32px 90px rgba(0,0,0,.5)'
              }}
              imageStyle={{ maxHeight: 650, objectFit: 'cover', objectPosition: 'top' }}
            />
            <ProductProofPicture
              avif={rsvpAvif}
              webp={rsvpWebp}
              alt="Confirmación de asistencia real abierta en móvil"
              width={780}
              height={1688}
              sx={{
                position: 'absolute',
                width: { xs: 154, sm: 196, lg: 204 },
                left: { xs: '34%', sm: '38%', lg: '37%' },
                bottom: { xs: 18, lg: 8 },
                zIndex: 3,
                border: '6px solid #171b22',
                borderRadius: '22px',
                overflow: 'hidden',
                boxShadow: '0 24px 70px rgba(0,0,0,.42)'
              }}
              imageStyle={{ aspectRatio: '.62', objectFit: 'cover', objectPosition: 'top' }}
            />
            <ProductProofPicture
              avif={scannerAvif}
              webp={scannerWebp}
              alt="Resultado real del control de acceso"
              width={780}
              height={1688}
              sx={{
                position: 'absolute',
                width: { xs: 174, sm: 220, lg: 230 },
                right: { xs: 0, sm: '2%', lg: '-1%' },
                bottom: { xs: 0, lg: 4 },
                zIndex: 3,
                border: '6px solid #171b22',
                borderRadius: '22px',
                overflow: 'hidden',
                boxShadow: '0 24px 70px rgba(0,0,0,.46)'
              }}
              imageStyle={{ aspectRatio: '.62', objectFit: 'cover', objectPosition: 'top' }}
            />
            <Box
              sx={{
                position: 'absolute',
                left: { xs: 0, sm: '7%', lg: '2%' },
                right: { xs: 0, lg: '-1%' },
                bottom: { xs: -46, lg: -42 },
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 1,
                zIndex: 4
              }}
            >
              {['Invitación', 'Confirmación', 'Mesa', 'Acceso'].map((label, index) => (
                <Typography
                  key={label}
                  sx={{
                    ...landingTokens.typography.eyebrow,
                    color: landingTokens.colors.dark.textMuted,
                    textAlign: 'center',
                    '&::before': {
                      content: index === 0 ? 'none' : '"\u2192"',
                      mr: 1,
                      opacity: 0.5
                    }
                  }}
                >
                  {label}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}

const primaryButtonSx = {
  minHeight: 56,
  px: 4,
  bgcolor: landingTokens.colors.dark.text,
  color: landingTokens.colors.dark.background,
  borderRadius: 0,
  textTransform: 'none',
  fontWeight: 700,
  '&:hover': { bgcolor: '#e7e0d4' }
};
const secondaryButtonSx = {
  minHeight: 56,
  px: 4,
  borderColor: landingTokens.colors.dark.textMuted,
  color: landingTokens.colors.dark.text,
  borderRadius: 0,
  textTransform: 'none',
  '&:hover': { borderColor: landingTokens.colors.dark.text }
};
