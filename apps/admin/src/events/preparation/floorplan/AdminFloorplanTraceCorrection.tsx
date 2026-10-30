import type { AdminFloorplanSeat } from '@invitaciones/api-client';
import { Button, Paper, Stack, TextField, Typography } from '@mui/material';

export function AdminFloorplanTraceCorrection({
  tableName,
  seat,
  count,
  disabled,
  canTrace,
  renameOpen,
  renameLabel,
  onRenameLabel,
  onRename,
  onSaveName,
  onCancelName,
  onDuplicate,
  onToggleBlocked,
  onRemove,
  onRenumber,
  onTrace,
  onTable
}: {
  tableName: string;
  seat: AdminFloorplanSeat | undefined;
  count: number;
  disabled: boolean;
  canTrace: boolean;
  renameOpen: boolean;
  renameLabel: string;
  onRenameLabel: (label: string) => void;
  onRename: () => void;
  onSaveName: () => void;
  onCancelName: () => void;
  onDuplicate: () => void;
  onToggleBlocked: () => void;
  onRemove: () => void;
  onRenumber: () => void;
  onTrace: () => void;
  onTable: () => void;
}) {
  return (
    <Paper component="section" aria-label="Corrección de lugares" variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography component="h3" variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
            {tableName}
          </Typography>
          <Typography variant="body2">{count} lugares seleccionados</Typography>
          <Button disabled={disabled || renameOpen} onClick={onTable}>
            Editar mesa
          </Button>
          <Button variant="outlined" disabled={!canTrace || renameOpen} onClick={onTrace}>
            Trazar lugares
          </Button>
          <Button disabled={disabled || renameOpen} onClick={onRenumber}>
            Renumerar lugares
          </Button>
        </Stack>
        {renameOpen ? (
          <Stack
            component="form"
            direction="row"
            spacing={1}
            onSubmit={(event) => {
              event.preventDefault();
              onSaveName();
            }}
          >
            <TextField
              autoFocus
              size="small"
              label="Nombre del lugar"
              value={renameLabel}
              disabled={disabled}
              onChange={(event) => onRenameLabel(event.target.value)}
              sx={{ flex: 1 }}
            />
            <Button type="submit" disabled={disabled || !renameLabel.trim()}>
              Guardar nombre
            </Button>
            <Button disabled={disabled} onClick={onCancelName}>
              Cancelar nombre
            </Button>
          </Stack>
        ) : seat ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button disabled={disabled} onClick={onRename}>
              Renombrar
            </Button>
            <Button disabled={disabled} onClick={onDuplicate}>
              Duplicar lugar
            </Button>
            <Button disabled={disabled || seat.occupied} onClick={onToggleBlocked}>
              {seat.isBlocked ? 'Desbloquear' : 'Bloquear'}
            </Button>
            <Button color="error" disabled={disabled || seat.occupied} onClick={onRemove}>
              Eliminar lugar
            </Button>
          </Stack>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          {count > 1
            ? 'Arrastra para mover el grupo. Acciones sólo al principal; renumerar afecta toda la mesa. Sin deshacer de lugares.'
            : 'Shift/Ctrl/Cmd: selección múltiple. Arrastra para mover. Las correcciones confirmadas no tienen deshacer.'}
        </Typography>
      </Stack>
    </Paper>
  );
}
