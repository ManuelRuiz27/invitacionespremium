import { Box, useMediaQuery, type SxProps, type Theme } from '@mui/material';
import { useState } from 'react';
import video from '../assets/product-proof/invitation-demo.webm';
import poster from '../assets/product-proof/flipbook-public-mobile.webp';

export function DemoVideo({ label, sx }: { label: string; sx?: SxProps<Theme> }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [failed, setFailed] = useState(false);
  if (reducedMotion || failed) {
    return <Box component="img" src={poster} alt={`${label} — vista estática de demostración`} sx={sx} />;
  }
  return (
    <Box
      component="video"
      autoPlay
      loop
      muted
      playsInline
      controls
      poster={poster}
      aria-label={label}
      sx={sx}
      onError={() => setFailed(true)}
    >
      <source src={video} type="video/webm" onError={() => setFailed(true)} />
      <img src={poster} alt={`${label} — vista estática de demostración`} />
    </Box>
  );
}
