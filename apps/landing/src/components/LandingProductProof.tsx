import invitationVideoWebm from '../assets/product-proof/invitation-demo.webm';
import invitationAnimatedWebp from '../assets/product-proof/flipbook-public-mobile.avif';
import invitationAnimatedGif from '../assets/product-proof/flipbook-public-mobile.webp';
import { DemoVideo } from './DemoVideo';
import rsvpAvif from '../assets/product-proof/rsvp-public-mobile.avif';
import rsvpWebp from '../assets/product-proof/rsvp-public-mobile.webp';
import distributionAvif from '../assets/product-proof/invitation-distribution-desktop.avif';
import distributionWebp from '../assets/product-proof/invitation-distribution-desktop.webp';
import floorplanAvif from '../assets/product-proof/floorplan-live-desktop.avif';
import floorplanWebp from '../assets/product-proof/floorplan-live-desktop.webp';
import scannerAvif from '../assets/product-proof/scanner-result-mobile.avif';
import scannerWebp from '../assets/product-proof/scanner-result-mobile.webp';
import { landingTokens } from '../theme/landing-theme';
import { ProductProofPicture } from './ProductProofPicture';
import { LandingContainer, LandingSectionIntro } from './primitives';
import { Box, Button, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

interface ProofScene {
  number: string;
  label: string;
  title: string;
  description: string;
  avif: string;
  webp: string;
  video?: string;
  alt: string;
  width: number;
  height: number;
  mobile: boolean;
  crop?: { top: number; left: number };
}

const scenes: readonly ProofScene[] = [
  {
    number: '01',
    label: 'Reciben su invitación',
    title: 'Toda la información del evento en una experiencia clara',
    description: 'Una invitación Flyer o Flipbook preparada para cada invitado.',
    avif: invitationAnimatedWebp,
    webp: invitationAnimatedGif,
    video: invitationVideoWebm,
    alt: 'Demostración de invitación Premium — Flipbook digital interactivo de Boda de Prueba',
    width: 390,
    height: 844,
    mobile: true
  },
  {
    number: '02',
    label: 'Confirman su asistencia',
    title: 'Respuestas y acompañantes sin perseguir mensajes',
    description: 'En Flyer y Flipbook, cada invitación concentra la confirmación y los acompañantes permitidos.',
    avif: rsvpAvif,
    webp: rsvpWebp,
    alt: 'Demostración del formulario de confirmación de asistencia',
    width: 780,
    height: 1688,
    mobile: true
  },
  {
    number: '03',
    label: 'Organizas la distribución de mesas',
    title: 'Distribuye a tus invitados en el plano de demostración del salón',
    description:
      'El plano de mesas muestra la distribución del espacio en Boda Flyer. Asigna invitados a cada lugar directamente desde el mapa del evento.',
    avif: floorplanAvif,
    webp: floorplanWebp,
    crop: { top: 0.28, left: 0.16 },
    alt: 'Plano de mesas de demostración del evento Boda Flyer — mesas asignadas',
    width: 2160,
    height: 1350,
    mobile: false
  },
  {
    number: '04',
    label: 'Cada invitado recibe su acceso',
    title: 'La información necesaria queda vinculada con su invitación',
    description: 'Organiza las mesas y conserva cada acceso listo para compartir desde el evento activo.',
    avif: distributionAvif,
    webp: distributionWebp,
    crop: { top: 0.28, left: 0.16 },
    alt: 'Vista de demostración de invitaciones y accesos individuales del evento Boda Flyer',
    width: 2160,
    height: 1350,
    mobile: false
  },
  {
    number: '05',
    label: 'Tu equipo recibe a cada persona',
    title: 'Control de acceso con la información a la mano',
    description: 'El equipo de recepción consulta la invitación y registra la entrada.',
    avif: scannerAvif,
    webp: scannerWebp,
    alt: 'Demostración de control de acceso con invitados pendientes y plano de mesas asignado',
    width: 780,
    height: 1688,
    mobile: true
  }
];

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
  const activeScene: ProofScene = scenes[active] ?? scenes[0]!;
  return (
    <Box
      id="producto"
      component="section"
      aria-labelledby="landing-product-proof-heading"
      sx={{ py: landingTokens.spacing.sectionY, bgcolor: landingTokens.colors.base.background }}
    >
      <LandingContainer>
        <LandingSectionIntro
          headingId="landing-product-proof-heading"
          title="Así acompañamos a tus invitados"
          subtitle="Recorrido de demostración de Flyer digital y Flipbook Premium: invitación, confirmación de asistencia, mesas y recepción. Los pases anónimos tienen un flujo distinto, sin confirmación pública."
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
                      color:
                        active === index ? landingTokens.colors.accent.primary : landingTokens.colors.base.textMuted
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
                    <Typography sx={{ ...landingTokens.typography.body, color: landingTokens.colors.base.textMuted }}>
                      {scene.description}
                    </Typography>
                    <Button
                      onClick={() => setActive(index)}
                      aria-pressed={active === index}
                      sx={{
                        display: { xs: 'none', md: 'inline-flex' },
                        mt: 2,
                        p: 1,
                        minHeight: 44,
                        minWidth: 44,
                        textTransform: 'none'
                      }}
                    >
                      Ver pantalla
                    </Button>
                  </Box>
                </Box>
                {scene.video ? (
                  <DemoVideo
                    label={scene.alt}
                    sx={{
                      display: { xs: 'block', md: 'none' },
                      mt: 4,
                      width: scene.mobile ? '72%' : '100%',
                      mx: 'auto',
                      border: landingTokens.borders.hairlineLight,
                      boxShadow: landingTokens.shadows.elevated,
                      aspectRatio: `${scene.width} / ${scene.height}`,
                      maxHeight: 650,
                      objectFit: 'cover',
                      objectPosition: 'top'
                    }}
                  />
                ) : (
                  <ProductProofPicture
                    avif={scene.avif}
                    crop={scene.crop}
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
                )}
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
              bgcolor: 'background.default',
              border: landingTokens.borders.hairlineLight
            }}
          >
            {activeScene.video ? (
              <DemoVideo
                key={activeScene.number}
                label={activeScene.alt}
                sx={{
                  width: activeScene.mobile ? '46%' : '92%',
                  border: landingTokens.borders.hairlineLight,
                  boxShadow: landingTokens.shadows.productLayer,
                  animation: 'proofReveal .45s ease both',
                  aspectRatio: `${activeScene.width} / ${activeScene.height}`,
                  maxHeight: '78vh',
                  objectFit: 'contain',
                  display: 'block',
                  '@keyframes proofReveal': {
                    from: { opacity: 0, transform: 'translateY(14px)' },
                    to: { opacity: 1, transform: 'translateY(0)' }
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
                }}
              />
            ) : (
              <ProductProofPicture
                key={activeScene.number}
                crop={activeScene.crop}
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
            )}
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
