import { Box, Paper, Typography } from '@mui/material';
import { landingTokens } from '../../theme/landing-theme';
import type { LandingConfig } from '../../config/landing-config';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TableBarIcon from '@mui/icons-material/TableBar';

export interface LandingHeroExperienceProps {
  config: LandingConfig;
}

export function LandingHeroExperience({ config }: LandingHeroExperienceProps) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        minHeight: { xs: 400, md: 520 },
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: '1000px'
      }}
      aria-hidden="true" // Decorative visual composition
    >
      {/* Background layer: Tables / Abstract */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: '5%',
          right: '5%',
          width: '60%',
          p: 3,
          borderRadius: 4,
          bgcolor: 'rgba(255, 255, 255, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(8px)',
          transform: 'translateZ(-100px) rotateY(-10deg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          opacity: 0.8
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TableBarIcon sx={{ color: 'primary.main', opacity: 0.6 }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
            {config.demo.scenes.find((s) => s.code === 'TABLES')?.label || 'Mesas'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.1 }} />
          <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.1 }} />
          <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'primary.main', opacity: 0.1 }} />
        </Box>
      </Paper>

      {/* Mid layer: QR / Access */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          bottom: '10%',
          left: '5%',
          width: '45%',
          p: 2.5,
          borderRadius: 3,
          bgcolor: landingTokens.colors.darkSurface.background,
          border: `1px solid ${landingTokens.colors.darkSurface.divider}`,
          transform: 'translateZ(50px) rotateY(15deg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          boxShadow: landingTokens.shadows.elevated
        }}
      >
        <QrCode2Icon sx={{ fontSize: 64, color: '#FFF' }} />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            color: landingTokens.colors.darkSurface.textSecondary,
            textTransform: 'uppercase',
            textAlign: 'center'
          }}
        >
          {config.demo.scenes.find((s) => s.code === 'ACCESS')?.title}
        </Typography>
      </Paper>

      {/* Top layer: Invitation / Confirmation */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: '15%',
          left: '15%',
          width: '70%',
          p: 4,
          borderRadius: 4,
          bgcolor: '#FFF',
          border: '1px solid #E5E7EB',
          transform: 'translateZ(100px)',
          boxShadow: landingTokens.shadows.productLayer,
          display: 'flex',
          flexDirection: 'column',
          gap: 3
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
              {config.demo.scenes.find((s) => s.code === 'INVITATION')?.label}
            </Typography>
          </Box>
          <CheckCircleIcon color="success" sx={{ fontSize: 20 }} />
        </Box>

        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1, color: 'text.primary', lineHeight: 1.2 }}>
            {config.demo.scenes.find((s) => s.code === 'INVITATION')?.title}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
            {config.demo.scenes.find((s) => s.code === 'CONFIRMATION')?.title}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          <Box sx={{ height: 12, width: '100%', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1 }} />
          <Box sx={{ height: 12, width: '80%', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1 }} />
          <Box sx={{ height: 12, width: '60%', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1 }} />
        </Box>
      </Paper>
    </Box>
  );
}
