import type { AdminFloorplanSeat } from '@invitaciones/api-client';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';

export function AdminFloorplanSeatControls({
  readOnly,
  placingSeat,
  hasSeats,
  tableName,
  selectedSeat,
  selectedSeatCount,
  onAdd,
  onRenumber,
  onRename,
  onDuplicate,
  onToggleBlocked,
  onRemove
}: {
  readOnly: boolean;
  placingSeat: boolean;
  hasSeats: boolean;
  tableName: string;
  selectedSeat: AdminFloorplanSeat | undefined;
  selectedSeatCount: number;
  onAdd: () => void;
  onRenumber: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onToggleBlocked: () => void;
  onRemove: () => void;
}) {
  return (
    <Stack spacing={1} sx={{ mb: 1 }}>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" disabled={readOnly || placingSeat} onClick={onAdd}>
          Agregar lugar
        </Button>
        <Button size="small" variant="outlined" disabled={readOnly || !hasSeats} onClick={onRenumber}>
          Renumerar lugares
        </Button>
      </Stack>
      {selectedSeat ? (
        <Stack spacing={0.75} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="subtitle2">
              {selectedSeat.label} · {tableName}
            </Typography>
            {selectedSeatCount > 1 ? <Chip size="small" label={`${selectedSeatCount} lugares seleccionados`} /> : null}
          </Stack>
          {selectedSeatCount > 1 ? (
            <Typography variant="caption" color="text.secondary">
              Las acciones siguientes se aplican solo a {selectedSeat.label}.
            </Typography>
          ) : null}
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button size="small" disabled={readOnly} onClick={onRename}>
              Renombrar
            </Button>
            <Button size="small" disabled={readOnly} onClick={onDuplicate}>
              Duplicar
            </Button>
            <Button size="small" disabled={readOnly || selectedSeat.occupied} onClick={onToggleBlocked}>
              {selectedSeat.isBlocked ? 'Desbloquear' : 'Bloquear'}
            </Button>
            <Button size="small" color="error" disabled={readOnly || selectedSeat.occupied} onClick={onRemove}>
              Eliminar {selectedSeat.label}
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}

export function AdminFloorplanSeatRenameDialog({
  open,
  label,
  onLabelChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  label: string;
  onLabelChange: (label: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <DialogTitle>Renombrar lugar</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nombre del lugar"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
