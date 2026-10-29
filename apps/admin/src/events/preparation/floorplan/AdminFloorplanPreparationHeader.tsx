import type { AdminFloorplan } from '@invitaciones/api-client';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import { Alert, Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function AdminFloorplanPreparationHeader({
  locked,
  finalized,
  seatingMode,
  elementCount,
  places,
  pending,
  readOnly,
  editing,
  hasPendingTables,
  accessEventReadOnly,
  anonymousAccess,
  reconciliationError,
  validationMessage,
  message,
  refreshRequired,
  dirty,
  sourceControl,
  onSeatingModeChange,
  onChangeLock,
  onRefresh
}: {
  locked: boolean;
  finalized: boolean;
  seatingMode: AdminFloorplan['seatingMode'];
  elementCount: number;
  places: number;
  pending: boolean;
  readOnly: boolean;
  editing: boolean;
  hasPendingTables: boolean;
  accessEventReadOnly: boolean;
  anonymousAccess: boolean;
  reconciliationError: boolean;
  validationMessage: string | undefined;
  message: string | undefined;
  refreshRequired: boolean;
  dirty: boolean;
  sourceControl: ReactNode;
  onSeatingModeChange: (mode: AdminFloorplan['seatingMode']) => void;
  onChangeLock: () => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        useFlexGap
        spacing={1}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
          <Typography id="admin-floorplan-title" component="h2" variant="h5">
            Croquis
          </Typography>
          {locked ? (
            <Typography variant="body2" color="text.secondary">
              Distribución finalizada. Vista de solo lectura.
            </Typography>
          ) : null}
        </Box>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flex: '0 1 auto', flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip
            label={
              pending
                ? 'Guardando...'
                : reconciliationError
                  ? 'Guardado · falta actualizar'
                  : validationMessage
                    ? 'Revisa los datos'
                    : message || refreshRequired
                      ? 'Error al guardar'
                      : dirty
                        ? 'Cambios sin guardar'
                        : 'Guardado'
            }
            color={
              pending
                ? 'warning'
                : reconciliationError || validationMessage
                  ? 'warning'
                  : message || refreshRequired
                    ? 'error'
                    : dirty
                      ? 'warning'
                      : 'success'
            }
            variant="outlined"
            aria-live="polite"
          />
          <Chip label={`${elementCount} elementos · ${places} lugares`} variant="outlined" />
          {finalized ? (
            <Chip label={seatingMode === 'TABLE' ? 'Por mesa' : 'Por lugar exacto'} variant="outlined" />
          ) : (
            <TextField
              select
              size="small"
              label="Acomodo"
              value={seatingMode}
              disabled={readOnly || editing}
              onChange={(event) => onSeatingModeChange(event.target.value as 'TABLE' | 'SEAT')}
              sx={{ minWidth: 148 }}
            >
              <MenuItem value="TABLE">Por mesa</MenuItem>
              {!anonymousAccess ? <MenuItem value="SEAT">Por lugar exacto</MenuItem> : null}
            </TextField>
          )}
          {sourceControl}
          <Button
            variant={locked ? 'contained' : 'outlined'}
            startIcon={locked ? <LockOpenRounded /> : <LockRounded />}
            disabled={pending || editing || hasPendingTables || accessEventReadOnly}
            onClick={onChangeLock}
            sx={{ minHeight: 44 }}
          >
            {locked ? 'Editar distribución' : 'Finalizar distribución'}
          </Button>
        </Stack>
      </Stack>
      {validationMessage ? <Alert severity="warning">{validationMessage}</Alert> : null}
      {message ? <Alert severity="error">{message}</Alert> : null}
      {reconciliationError ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={onRefresh}>
              Actualizar plano
            </Button>
          }
        >
          Guardado · falta actualizar. La acción no se repetirá.
        </Alert>
      ) : null}
      {refreshRequired && !reconciliationError ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={onRefresh}>
              Actualizar plano
            </Button>
          }
        >
          No pudimos confirmar el estado final. Conservamos tu trabajo local; actualiza el plano antes de decidir si
          reintentas.
        </Alert>
      ) : null}
    </>
  );
}
