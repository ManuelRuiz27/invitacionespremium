import type { AdminFloorplan } from '@invitaciones/api-client';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useState, type ReactNode } from 'react';

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
  tableOnly,
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
  tableOnly: boolean;
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
  const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);
  const accommodationControl =
    finalized || (tableOnly && seatingMode === 'SEAT') ? (
      <Chip label={tableOnly || seatingMode === 'TABLE' ? 'Por mesa' : 'Por lugar exacto'} variant="outlined" />
    ) : (
      <TextField
        select
        size="small"
        label="Acomodo"
        value={seatingMode}
        disabled={readOnly || editing}
        onChange={(event) => onSeatingModeChange(event.target.value as 'TABLE' | 'SEAT')}
        sx={{ minWidth: { xs: 132, sm: 148 } }}
      >
        <MenuItem value="TABLE">Por mesa</MenuItem>
        {!tableOnly ? <MenuItem value="SEAT">Por lugar exacto</MenuItem> : null}
      </TextField>
    );
  return (
    <>
      {tableOnly && seatingMode === 'SEAT' ? (
        <Alert
          severity="warning"
          action={
            <Button disabled={readOnly || editing} onClick={() => onSeatingModeChange('TABLE')}>
              Volver a Por mesa
            </Button>
          }
        >
          Este servicio admite sólo acomodo por mesa. El croquis conserva lugares heredados; cambia explícitamente a Por
          mesa para continuar.
        </Alert>
      ) : null}
      <Stack
        direction="row"
        useFlexGap
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Box sx={{ flex: '1 1 140px', minWidth: 0 }}>
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
          {accommodationControl}
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
          <IconButton
            aria-label="Opciones del croquis"
            aria-controls={optionsAnchor ? 'admin-floorplan-options-menu' : undefined}
            aria-haspopup="menu"
            aria-expanded={optionsAnchor ? 'true' : undefined}
            onClick={(event) => setOptionsAnchor(event.currentTarget)}
            sx={{ width: 44, height: 44 }}
          >
            <MoreHorizRounded />
          </IconButton>
        </Stack>
      </Stack>
      <Menu
        id="admin-floorplan-options-menu"
        anchorEl={optionsAnchor}
        open={Boolean(optionsAnchor)}
        onClose={() => setOptionsAnchor(null)}
        slotProps={{ paper: { sx: { width: 'min(360px, 90vw)', p: 1 } } }}
      >
        <Box sx={{ px: 1, py: 0.75 }}>
          <Typography variant="overline" color="text.secondary">
            Resumen del croquis
          </Typography>
          <Typography variant="body2">{`${elementCount} elementos · ${places} lugares`}</Typography>
        </Box>
        <Divider sx={{ my: 0.5 }} />
        {sourceControl ? (
          <Box sx={{ px: 1, py: 0.5 }} onChangeCapture={() => setOptionsAnchor(null)}>
            {sourceControl}
          </Box>
        ) : null}
        <MenuItem
          disabled={pending || editing || hasPendingTables || accessEventReadOnly}
          onClick={() => {
            setOptionsAnchor(null);
            onChangeLock();
          }}
          sx={{ minHeight: 44 }}
        >
          {locked ? (
            <LockOpenRounded fontSize="small" sx={{ mr: 1.25 }} />
          ) : (
            <LockRounded fontSize="small" sx={{ mr: 1.25 }} />
          )}
          {locked ? 'Editar distribución' : 'Finalizar distribución'}
        </MenuItem>
      </Menu>
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
