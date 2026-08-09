import CenterFocusStrongRounded from '@mui/icons-material/CenterFocusStrongRounded';
import ChairAltRounded from '@mui/icons-material/ChairAltRounded';
import GridOnRounded from '@mui/icons-material/GridOnRounded';
import PanToolAltRounded from '@mui/icons-material/PanToolAltRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import { Box, Divider, IconButton, Stack, ToggleButton, Tooltip, Typography } from '@mui/material';

export function FloorplanToolbar({
  disabled,
  snap,
  showSeats,
  panEnabled,
  zoom,
  canUndo,
  canRedo,
  onSnapChange,
  onShowSeatsChange,
  onPanEnabledChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onUndo,
  onRedo
}: {
  disabled: boolean;
  snap: boolean;
  showSeats: boolean;
  panEnabled: boolean;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onSnapChange: (checked: boolean) => void;
  onShowSeatsChange: (checked: boolean) => void;
  onPanEnabledChange: (checked: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const buttonSx = {
    width: 44,
    height: 44,
    borderRadius: 2,
    color: 'text.primary',
    '&:hover': { bgcolor: 'rgba(49, 87, 200, 0.08)' }
  } as const;
  const toggleSx = {
    width: 44,
    height: 44,
    p: 0,
    border: 0,
    borderRadius: '8px !important',
    color: 'text.secondary',
    '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText' },
    '&.Mui-selected:hover': { bgcolor: 'primary.dark' }
  } as const;

  return (
    <Box
      component="div"
      aria-label="Herramientas del plano"
      sx={{
        px: 0.75,
        py: 0.625,
        border: '1px solid',
        borderColor: 'rgba(226, 222, 213, 0.9)',
        borderRadius: 3,
        bgcolor: 'rgba(255, 254, 251, 0.94)',
        boxShadow: '0 12px 32px rgba(23, 35, 60, 0.13)',
        backdropFilter: 'blur(14px)'
      }}
    >
      <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
        <Tooltip title="Alejar">
          <IconButton aria-label="Alejar plano" onClick={onZoomOut} sx={buttonSx}>
            <ZoomOutRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography
          variant="caption"
          aria-label={`Zoom ${Math.round(zoom * 100)} por ciento`}
          sx={{ minWidth: 42, textAlign: 'center', fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(zoom * 100)}%
        </Typography>
        <Tooltip title="Acercar">
          <IconButton aria-label="Acercar plano" onClick={onZoomIn} sx={buttonSx}>
            <ZoomInRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Ajustar vista">
          <IconButton aria-label="Ajustar plano a la vista" onClick={onFit} sx={buttonSx}>
            <CenterFocusStrongRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Mover plano">
          <ToggleButton
            value="pan"
            selected={panEnabled}
            onChange={() => onPanEnabledChange(!panEnabled)}
            aria-label="Activar modo mover plano"
            sx={toggleSx}
          >
            <PanToolAltRounded fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Ayuda para alinear">
          <span>
            <ToggleButton
              value="snap"
              selected={snap}
              disabled={disabled}
              onChange={() => onSnapChange(!snap)}
              aria-label="Activar ayuda para alinear"
              sx={toggleSx}
            >
              <GridOnRounded fontSize="small" />
            </ToggleButton>
          </span>
        </Tooltip>
        <Tooltip title="Mostrar sillas">
          <ToggleButton
            value="seats"
            selected={showSeats}
            onChange={() => onShowSeatsChange(!showSeats)}
            aria-label="Mostrar sillas"
            sx={toggleSx}
          >
            <ChairAltRounded fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Tooltip title="Deshacer">
          <span>
            <IconButton
              aria-label="Deshacer cambio visual"
              disabled={disabled || !canUndo}
              onClick={onUndo}
              sx={buttonSx}
            >
              <UndoRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Rehacer">
          <span>
            <IconButton
              aria-label="Rehacer cambio visual"
              disabled={disabled || !canRedo}
              onClick={onRedo}
              sx={buttonSx}
            >
              <RedoRounded fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Box>
  );
}
