import invitationVideoWebm from '../assets/product-proof/invitation-demo.webm';
import invitationAnimatedWebp from '../assets/product-proof/invitation-demo-animated.webp';
import invitationAnimatedGif from '../assets/product-proof/invitation-demo-animated.gif';
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
}

const scenes: readonly ProofScene[] = [
  {
    number: '01',
    label: 'Reciben su invitación',
    title: 'Toda la información del evento en una experiencia clara',
    description: 'Una Invitación Digital o Invitación Premium preparada para cada invitado.',
    avif: invitationAnimatedWebp,
    webp: invitationAnimatedGif,
    video: invitationVideoWebm,
    alt: 'Invitación Premium real — Flipbook digital interactivo de Boda de Prueba con animación de páginas',
    width: 390,
    height: 844,
    mobile: true
  },
  {
    number: '02',
    label: 'Confirman su asistencia',
    title: 'Respuestas y acompañantes sin perseguir mensajes',
    description: 'Cada invitación concentra la confirmación dentro del mismo recorrido.',
    avif: rsvpAvif,
    webp: rsvpWebp,
    alt: 'Formulario real de confirmación de asistencia',
    width: 780,
    height: 1688,
    mobile: true
  },
  {
    number: '03',
    label: 'Organizas el croquis de mesas',
    title: 'Distribuye a tus invitados en el plano real del salón',
    description:
      'El Croquis de Mesas refleja la distribución del espacio en BOda Flyer. Asigna asistentes a cada lugar directamente desde el mapa del evento.',
    avif: floorplanAvif,
    webp: floorplanWebp,
    alt: 'Croquis de mesas real del evento BOda Flyer — plano con mesas asignadas',
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
    alt: 'Vista real de invitaciones y accesos individuales del evento BOda Flyer',
    width: 2160,
    height: 1500,
    mobile: false
  },
  {
    number: '05',
    label: 'Tu equipo recibe a cada persona',
    title: 'Control de acceso con la información a la mano',
    description: 'El equipo de recepción consulta la invitación y registra la entrada.',
    avif: scannerAvif,
    webp: scannerWebp,
    alt: 'Control de acceso real mostrando asistentes pendientes y croquis asignado',
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
          subtitle="De la invitación a la llegada, cada paso se conecta con el siguiente."
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
                      color: active === index ? landingTokens.colors.accent.primary : landingTokens.colors.base.textMuted
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
                        p: 0,
                        minWidth: 0,
                        textTransform: 'none'
                      }}
                    >
                      Ver pantalla
                    </Button>
                  </Box>
                </Box>
                {scene.video ? (
                  <Box
                    component="video"
                    autoPlay
                    loop
                    muted
                    playsInline
                    aria-label={scene.alt}
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
                  >
                    <source src={scene.video} type="video/webm" />
                    <ProductProofPicture
                      avif={scene.avif}
                      webp={scene.webp}
                      alt={scene.alt}
                      width={scene.width}
                      height={scene.height}
                      imageStyle={{ maxHeight: 650, objectFit: 'cover', objectPosition: 'top' }}
                    />
                  </Box>
                ) : (
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
              <Box
                component="video"
                key={activeScene.number}
                autoPlay
                loop
                muted
                playsInline
                aria-label={activeScene.alt}
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
              >
                <source src={activeScene.video} type="video/webm" />
                <ProductProofPicture
                  avif={activeScene.avif}
                  webp={activeScene.webp}
                  alt={activeScene.alt}
                  width={activeScene.width}
                  height={activeScene.height}
                  imageStyle={{ maxHeight: '78vh', objectFit: 'contain' }}
                />
              </Box>
            ) : (
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
            )}
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
