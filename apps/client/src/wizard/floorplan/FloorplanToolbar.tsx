import CenterFocusStrongRounded from '@mui/icons-material/CenterFocusStrongRounded';
import GridOnRounded from '@mui/icons-material/GridOnRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import { FormControlLabel, IconButton, Paper, Stack, Switch, Tooltip } from '@mui/material';

export function FloorplanToolbar({
  disabled,
  snap,
  showSeats,
  canUndo,
  canRedo,
  onSnapChange,
  onShowSeatsChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onUndo,
  onRedo
}: {
  disabled: boolean;
  snap: boolean;
  showSeats: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSnapChange: (checked: boolean) => void;
  onShowSeatsChange: (checked: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const buttonSx = { width: 44, height: 44 } as const;
  return (
    <Paper variant="outlined" sx={{ px: 1, py: 0.5 }} component="div" aria-label="Herramientas del plano">
      <Stack direction="row" useFlexGap spacing={0.5} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Tooltip title="Acercar">
          <span>
            <IconButton aria-label="Acercar plano" onClick={onZoomIn} sx={buttonSx}>
              <ZoomInRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Alejar">
          <span>
            <IconButton aria-label="Alejar plano" onClick={onZoomOut} sx={buttonSx}>
              <ZoomOutRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Ajustar vista">
          <span>
            <IconButton aria-label="Ajustar plano a la vista" onClick={onFit} sx={buttonSx}>
              <CenterFocusStrongRounded />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Deshacer">
          <span>
            <IconButton
              aria-label="Deshacer cambio visual"
              disabled={disabled || !canUndo}
              onClick={onUndo}
              sx={buttonSx}
            >
              <UndoRounded />
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
              <RedoRounded />
            </IconButton>
          </span>
        </Tooltip>
        <FormControlLabel
          control={
            <Switch checked={snap} disabled={disabled} onChange={(event) => onSnapChange(event.target.checked)} />
          }
          label={
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <GridOnRounded fontSize="small" /> Ajuste
            </Stack>
          }
          sx={{ minHeight: 44, ml: 0.5 }}
        />
        <FormControlLabel
          control={<Switch checked={showSeats} onChange={(event) => onShowSeatsChange(event.target.checked)} />}
          label="Mostrar sillas"
          sx={{ minHeight: 44 }}
        />
      </Stack>
    </Paper>
  );
}
