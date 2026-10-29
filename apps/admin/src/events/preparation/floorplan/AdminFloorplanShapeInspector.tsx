import type { AdminFloorplanShapeInput } from '@invitaciones/api-client';
import { normalizeFloorplanShape } from '@invitaciones/floorplan';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';

type Geometry = AdminFloorplanShapeInput['geometry'];
const initialPolygon = [
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 }
];
const geometryLabels: ReadonlyArray<{ value: Geometry; label: string; zonesOnly?: boolean }> = [
  { value: 'CIRCLE', label: 'Redonda' },
  { value: 'SQUARE', label: 'Cuadrada' },
  { value: 'RECTANGLE', label: 'Rectangular' },
  { value: 'POLYGON', label: 'Forma personalizada', zonesOnly: true }
];
export function AdminFloorplanShapeInspector({
  creating,
  value,
  disabled,
  capacityDerived,
  simple = false,
  showTraceNextStep = false,
  mapped = false,
  onUnlink,
  onChange,
  onSave,
  onDuplicate,
  onDelete,
  onCancel
}: {
  creating: boolean;
  value: AdminFloorplanShapeInput;
  disabled: boolean;
  capacityDerived: boolean;
  simple?: boolean;
  showTraceNextStep?: boolean;
  mapped?: boolean;
  onUnlink?: () => void;
  onChange: (value: AdminFloorplanShapeInput) => void;
  onSave: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const table = value.kind === 'TABLE';
  const objectName = value.name || (table ? 'Mesa' : 'Zona');
  return (
    <Paper component="section" variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Box>
          {mapped ? (
            <>
              <Typography component="h3" variant="h6">
                Editar {objectName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Elemento vinculado al plano
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="overline" color="text.secondary">
                {creating ? 'Nuevo elemento' : table ? 'Mesa seleccionada' : 'Zona seleccionada'}
              </Typography>
              <Typography component="h3" variant="h6">
                {table ? 'Mesa' : 'Zona'}
              </Typography>
            </>
          )}
        </Box>
        {mapped ? (
          <Typography variant="body2" color="text.secondary">
            Guarda o cancela antes de seleccionar otro elemento.
          </Typography>
        ) : null}
        <TextField
          label={table ? 'Nombre o número' : 'Nombre de zona'}
          value={value.name}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
        {table && capacityDerived ? (
          <Typography variant="body2" color="text.secondary">
            {creating ? 'La capacidad se calcula al definir los lugares.' : `${value.capacity} lugares`}
          </Typography>
        ) : table ? (
          <TextField
            label="Número de lugares"
            type="number"
            value={value.capacity}
            disabled={disabled}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            onChange={(event) => onChange({ ...value, capacity: Number(event.target.value) })}
          />
        ) : null}
        {mapped ? (
          <Chip label="Vinculado al plano" variant="outlined" />
        ) : !simple ? (
          <TextField
            select
            label="Forma"
            value={value.geometry}
            disabled={disabled}
            onChange={(event) => {
              const geometry = event.target.value as Geometry;
              onChange(
                normalizeFloorplanShape({
                  ...value,
                  geometry,
                  ...(geometry === 'CIRCLE' || geometry === 'SQUARE'
                    ? { height: value.width, polygonPoints: null }
                    : geometry === 'POLYGON'
                      ? { polygonPoints: initialPolygon }
                      : { polygonPoints: null })
                })
              );
            }}
          >
            {geometryLabels
              .filter((option) => !option.zonesOnly || !table)
              .map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
          </TextField>
        ) : null}
        {onUnlink ? (
          <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
            <Button size="small" disabled={disabled} onClick={() => setMoreOptionsOpen((open) => !open)}>
              Más opciones
            </Button>
            {moreOptionsOpen ? (
              <Button size="small" disabled={disabled} onClick={onUnlink}>
                Desvincular del plano
              </Button>
            ) : null}
          </Stack>
        ) : null}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={disabled} onClick={onSave} sx={{ minHeight: 44, flex: 1 }}>
            {creating ? `Agregar ${table ? 'mesa' : 'zona'}` : 'Guardar cambios'}
          </Button>
          <Button disabled={disabled} onClick={onCancel} sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
        </Stack>
        {showTraceNextStep ? (
          <Stack spacing={0.75}>
            <Button variant="outlined" disabled sx={{ minHeight: 44 }}>
              Trazar lugares
            </Button>
            <Typography variant="caption" color="text.secondary">
              Mesa preparada. El trazado de lugares aún no está disponible en Calca.
            </Typography>
          </Stack>
        ) : null}
        {onDuplicate ? (
          <Button startIcon={<ContentCopyRounded />} disabled={disabled} onClick={onDuplicate} sx={{ minHeight: 44 }}>
            Duplicar
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            color="error"
            startIcon={<DeleteOutlineRounded />}
            disabled={disabled}
            onClick={onDelete}
            sx={{ minHeight: 44 }}
          >
            {table ? 'Eliminar mesa' : 'Eliminar zona'}
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
