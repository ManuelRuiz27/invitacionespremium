/**
 * LandingInvitationAnimation
 *
 * Sección editorial que muestra cómo "inicia" una invitación:
 * animación CSS de un sobre que se abre y revela la invitación digital.
 *
 * Dirección: Editorial Contemporary / Quiet Luxury.
 * No contiene reglas de negocio ni llamadas API.
 */
import invitationLiveAvif from '../assets/product-proof/invitation-live-mobile.avif';
import invitationLiveWebp from '../assets/product-proof/invitation-live-mobile.webp';
import { landingTokens } from '../theme/landing-theme';
import { LandingContainer } from './primitives';
import { Box, Typography } from '@mui/material';

/**
 * Sobre SVG minimalista para la animación de apertura.
 * Fondo crema, solapa superior que se dobla hacia atrás.
 */
function EnvelopeIllustration() {
  return (
    <svg
      viewBox="0 0 260 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      {/* Cuerpo del sobre */}
      <rect x="10" y="50" width="240" height="120" rx="4" fill="#F5F2EC" stroke="#D8D2C7" strokeWidth="1" />
      {/* Solapas laterales e inferior (triangulos) */}
      <path d="M10 50 L130 115 L250 50" stroke="#D8D2C7" strokeWidth="1" fill="none" />
      <path d="M10 170 L130 115 L250 170" fill="#EFECE5" stroke="#D8D2C7" strokeWidth="1" />
      {/* Solapa superior — se animará */}
      <path
        className="envelope-flap"
        d="M10 50 L130 5 L250 50"
        fill="#F5F2EC"
        stroke="#D8D2C7"
        strokeWidth="1"
        style={{
          transformOrigin: 'center 50px',
          animation: 'flapOpen 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both'
        }}
      />
      {/* Sello / monograma */}
      <circle cx="130" cy="115" r="14" fill="none" stroke="#B8A58A" strokeWidth="1" opacity="0.7" />
      <text x="130" y="119" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fill="#B8A58A" opacity="0.8">
        IP
      </text>
    </svg>
  );
}

export function LandingInvitationAnimation() {
  return (
    <Box
      component="section"
      aria-labelledby="landing-invitation-anim-heading"
      sx={{
        py: { xs: 8, md: 14 },
        bgcolor: landingTokens.colors.contrast.background,
        color: landingTokens.colors.contrast.text,
        overflow: 'hidden'
      }}
    >
      <LandingContainer>
        {/* Layout: texto izquierda / animación derecha */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: { xs: 8, lg: 12 },
            alignItems: 'center'
          }}
        >
          {/* Columna de texto */}
          <Box>
            <Typography
              sx={{
                ...landingTokens.typography.eyebrow,
                color: landingTokens.colors.contrast.accent,
                mb: 2
              }}
            >
              Así inicia una invitación
            </Typography>
            <Typography
              component="h2"
              id="landing-invitation-anim-heading"
              sx={{
                ...landingTokens.typography.display,
                fontSize: { xs: '2.4rem', sm: '3rem', md: '3.6rem' },
                color: landingTokens.colors.contrast.text,
                mb: 3,
                textWrap: 'balance'
              }}
            >
              Un momento que el invitado recuerda
            </Typography>
            <Typography
              sx={{
                ...landingTokens.typography.body,
                color: landingTokens.colors.contrast.textMuted,
                fontSize: { xs: '1rem', md: '1.1rem' },
                maxWidth: 480,
                lineHeight: 1.7
              }}
            >
              Cada invitación comienza con un instante de apertura: el diseño propio del evento, la información del
              lugar y la fecha, y la confirmación integrada en el mismo recorrido. Todo preparado antes de que lo
              necesites.
            </Typography>

            {/* Estadísticas/puntos de valor */}
            <Box
              sx={{
                mt: 6,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                borderTop: `1px solid ${landingTokens.colors.contrast.border}`,
                pt: 5
              }}
            >
              {[
                { value: 'Diseño', label: 'propio del evento' },
                { value: 'RSVP', label: 'integrado en la misma experiencia' },
                { value: 'Croquis', label: 'de mesas visible para el invitado' },
                { value: 'Acceso', label: 'QR vinculado a la invitación' }
              ].map(({ value, label }) => (
                <Box key={value}>
                  <Typography
                    sx={{
                      ...landingTokens.typography.headline,
                      fontSize: '1.1rem',
                      color: landingTokens.colors.contrast.accent,
                      mb: 0.5
                    }}
                  >
                    {value}
                  </Typography>
                  <Typography
                    sx={{
                      ...landingTokens.typography.body,
                      fontSize: '0.85rem',
                      color: landingTokens.colors.contrast.textMuted,
                      lineHeight: 1.4
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Columna de animación */}
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: { xs: 420, md: 560 }
            }}
          >
            {/* Estilos de keyframes inline */}
            <style>{`
              @keyframes flapOpen {
                0%   { transform: rotateX(0deg); }
                100% { transform: rotateX(-160deg); }
              }
              @keyframes envelopeRise {
                from { transform: translateY(24px); opacity: 0; }
                to   { transform: translateY(0);    opacity: 1; }
              }
              @keyframes invitationReveal {
                0%   { transform: translateY(60px) scale(0.92); opacity: 0; }
                60%  { opacity: 1; }
                100% { transform: translateY(0) scale(1);       opacity: 1; }
              }
              @keyframes floatIdle {
                0%, 100% { transform: translateY(0px); }
                50%       { transform: translateY(-8px); }
              }
              @media (prefers-reduced-motion: reduce) {
                @keyframes flapOpen        { from { opacity: 0; } to { opacity: 1; } }
                @keyframes envelopeRise    { from { opacity: 0; } to { opacity: 1; } }
                @keyframes invitationReveal { from { opacity: 0; } to { opacity: 1; } }
                @keyframes floatIdle { from {} to {} }
              }
            `}</style>

            {/* Sobre — aparece primero */}
            <Box
              sx={{
                position: 'absolute',
                bottom: '12%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: { xs: 220, md: 280 },
                perspective: 600,
                animation: 'envelopeRise 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both'
              }}
            >
              <EnvelopeIllustration />
            </Box>

            {/* Invitación — emerge del sobre */}
            <Box
              sx={{
                position: 'relative',
                zIndex: 2,
                width: { xs: 160, sm: 190, md: 220 },
                borderRadius: '16px',
                overflow: 'hidden',
                border: `1px solid rgba(245,242,236,0.15)`,
                boxShadow: '0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.3)',
                animation: 'invitationReveal 1s cubic-bezier(0.16, 1, 0.3, 1) 0.9s both, floatIdle 4s ease-in-out 2.2s infinite',
                mb: { xs: 10, md: 14 } // espacio para el sobre
              }}
            >
              <picture>
                <source srcSet={invitationLiveAvif} type="image/avif" />
                <source srcSet={invitationLiveWebp} type="image/webp" />
                <img
                  src={invitationLiveWebp}
                  alt="Invitación Premium en experiencia móvil"
                  width={780}
                  height={1688}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    objectFit: 'cover',
                    objectPosition: 'top'
                  }}
                />
              </picture>
            </Box>

            {/* Etiqueta flotante */}
            <Box
              sx={{
                position: 'absolute',
                bottom: '32%',
                right: { xs: '4%', md: '8%' },
                bgcolor: landingTokens.colors.contrast.surface,
                border: `1px solid rgba(245,242,236,0.12)`,
                borderRadius: '8px',
                px: 2,
                py: 1.5,
                animation: 'invitationReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.8s both',
                zIndex: 3,
                maxWidth: 160
              }}
            >
              <Typography
                sx={{
                  ...landingTokens.typography.eyebrow,
                  fontSize: '0.65rem',
                  color: landingTokens.colors.contrast.accent,
                  mb: 0.25
                }}
              >
                Flipbook digital
              </Typography>
              <Typography
                sx={{
                  ...landingTokens.typography.body,
                  fontSize: '0.78rem',
                  color: landingTokens.colors.contrast.text,
                  lineHeight: 1.35
                }}
              >
                Diseño exclusivo de tu evento
              </Typography>
            </Box>
          </Box>
        </Box>
      </LandingContainer>
    </Box>
  );
}
