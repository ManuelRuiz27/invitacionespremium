import flipbookAvif from '../assets/product-proof/flipbook-public-mobile.avif';
import flipbookWebp from '../assets/product-proof/flipbook-public-mobile.webp';
import rsvpAvif from '../assets/product-proof/rsvp-public-mobile.avif';
import rsvpWebp from '../assets/product-proof/rsvp-public-mobile.webp';
import distributionAvif from '../assets/product-proof/invitation-distribution-desktop.avif';
import distributionWebp from '../assets/product-proof/invitation-distribution-desktop.webp';
import seatingAvif from '../assets/product-proof/seating-desktop.avif';
import seatingWebp from '../assets/product-proof/seating-desktop.webp';
import scannerAvif from '../assets/product-proof/scanner-result-mobile.avif';
import scannerWebp from '../assets/product-proof/scanner-result-mobile.webp';
import { landingTokens } from '../theme/landing-theme';
import { ProductProofPicture } from './ProductProofPicture';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { Box, Button, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

const scenes = [
  {
    number: '01',
    label: 'Invitación',
    title: 'Una experiencia que empieza antes del Evento',
    description:
      'La Invitación Flipbook reúne diseño, información y la acción principal en una vista preparada para cada Invitado.',
    avif: flipbookAvif,
    webp: flipbookWebp,
    alt: 'Invitación Flipbook real de un Evento demo',
    width: 780,
    height: 1688,
    mobile: true
  },
  {
    number: '02',
    label: 'Confirmación',
    title: 'RSVP directo y sin mensajes dispersos',
    description: 'Cada Invitación permite confirmar asistencia y gestionar acompañantes dentro del mismo recorrido.',
    avif: rsvpAvif,
    webp: rsvpWebp,
    alt: 'Formulario real de confirmación RSVP',
    width: 780,
    height: 1688,
    mobile: true
  },
  {
    number: '03',
    label: 'Invitados',
    title: 'La lista operativa siempre visible',
    description:
      'El workspace concentra Invitaciones individuales, confirmaciones y el enlace que el equipo comparte con cada contacto.',
    avif: distributionAvif,
    webp: distributionWebp,
    alt: 'Workspace real de distribución de Invitaciones',
    width: 2160,
    height: 1500,
    mobile: false
  },
  {
    number: '04',
    label: 'Mesas',
    title: 'Distribución visual, lista para coordinar',
    description:
      'Cuando aplica, el Planner trabaja la asignación a Mesas sobre el Croquis técnico preparado para el Evento.',
    avif: seatingAvif,
    webp: seatingWebp,
    alt: 'Workspace real de Mesas sobre Croquis',
    width: 2160,
    height: 1500,
    mobile: false
  },
  {
    number: '05',
    label: 'Acceso',
    title: 'Recepción con contexto y control',
    description: 'El Staff localiza la Invitación, valida asistentes y registra el ingreso desde el Scanner.',
    avif: scannerAvif,
    webp: scannerWebp,
    alt: 'Scanner real mostrando asistentes pendientes',
    width: 780,
    height: 1688,
    mobile: true
  }
] as const;

export function LandingProductProof() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(Number((visible.target as HTMLElement).dataset.scene));
      },
      { rootMargin: '-30% 0px -45%', threshold: [0, 0.25, 0.6] }
    );
    refs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const activeScene = scenes[active] ?? scenes[0];
  return (
    <Box
      id="producto"
      component="section"
      aria-labelledby="landing-product-proof-heading"
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.light.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId="landing-product-proof-heading"
          title="Así se vive un Evento conectado"
          subtitle="Del primer vistazo al ingreso: un recorrido continuo sobre pantallas reales del producto."
          align="left"
          dark={false}
        />
        <Box
          sx={{
            mt: { xs: 6, md: 10 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(300px,.72fr) minmax(0,1.28fr)' },
            gap: { md: 9 }
          }}
        >
          <Box>
            {scenes.map((scene, index) => (
              <Box
                key={scene.number}
                ref={(node: HTMLDivElement | null) => {
                  refs.current[index] = node;
                }}
                data-scene={index}
                sx={{ py: { xs: 5, md: 8 }, minHeight: { md: 330 }, borderTop: landingTokens.borders.hairlineLight }}
              >
                <Box
                  sx={{
                    color: 'inherit',
                    textAlign: 'left',
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr',
                    gap: 2
                  }}
                >
                  <Typography
                    sx={{
                      ...landingTokens.typography.eyebrow,
                      color: active === index ? landingTokens.colors.light.accent : landingTokens.colors.light.textMuted
                    }}
                  >
                    {scene.number}
                  </Typography>
                  <Box>
                    <Typography
                      component="h3"
                      sx={{ ...landingTokens.typography.display, fontSize: { xs: '1.8rem', md: '2.35rem' }, mb: 1 }}
                    >
                      {scene.label}
                    </Typography>
                    <Typography sx={{ ...landingTokens.typography.headline, fontSize: '1rem', mb: 1 }}>
                      {scene.title}
                    </Typography>
                    <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.light.textMuted }}>
                      {scene.description}
                    </Typography>
                    <Button
                      onClick={() => setActive(index)}
                      aria-pressed={active === index}
                      sx={{
                        display: { xs: 'none', md: 'inline-flex' },
                        mt: 2,
                        p: 0,
                        minWidth: 0,
                        textTransform: 'none'
                      }}
                    >
                      Ver pantalla
                    </Button>
                  </Box>
                </Box>
                <ProductProofPicture
                  avif={scene.avif}
                  webp={scene.webp}
                  alt={scene.alt}
                  width={scene.width}
                  height={scene.height}
                  sx={{
                    display: { xs: 'block', md: 'none' },
                    mt: 4,
                    width: scene.mobile ? '72%' : '100%',
                    mx: 'auto',
                    border: landingTokens.borders.hairlineLight,
                    boxShadow: landingTokens.shadows.elevated
                  }}
                  imageStyle={{ maxHeight: 650, objectFit: 'cover', objectPosition: 'top' }}
                />
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              position: 'sticky',
              top: 112,
              height: 'calc(100vh - 144px)',
              minHeight: 600,
              placeItems: 'center',
              alignSelf: 'start',
              overflow: 'hidden',
              bgcolor: '#ede9e0',
              border: landingTokens.borders.hairlineLight
            }}
          >
            <ProductProofPicture
              key={activeScene.number}
              avif={activeScene.avif}
              webp={activeScene.webp}
              alt={activeScene.alt}
              width={activeScene.width}
              height={activeScene.height}
              sx={{
                width: activeScene.mobile ? '46%' : '92%',
                border: landingTokens.borders.hairlineLight,
                boxShadow: landingTokens.shadows.productLayer,
                animation: 'proofReveal .45s ease both',
                '@keyframes proofReveal': {
                  from: { opacity: 0, transform: 'translateY(14px)' },
                  to: { opacity: 1, transform: 'translateY(0)' }
                },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
              }}
              imageStyle={{ maxHeight: '78vh', objectFit: 'contain' }}
            />
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
