import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import { Box, Button, ListItemText, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { useState, type MouseEvent } from 'react';

export type FloorplanConstructionTool = 'entry' | 'trace' | 'manual' | 'svg';

export function AdminFloorplanTraceEntry({
  tool,
  disabled,
  canAddTable,
  canReview,
  reviewLoading,
  svgAvailable,
  onToolChange,
  onAddTable,
  onReview
}: {
  tool: FloorplanConstructionTool;
  disabled: boolean;
  canAddTable: boolean;
  canReview: boolean;
  reviewLoading: boolean;
  onReview: () => void;
  svgAvailable: boolean;
  onToolChange: (tool: FloorplanConstructionTool) => void;
  onAddTable: () => void;
}) {
  const [toolsAnchor, setToolsAnchor] = useState<HTMLElement | null>(null);
  const openTools = (event: MouseEvent<HTMLButtonElement>) => setToolsAnchor(event.currentTarget);
  const chooseTool = (nextTool: FloorplanConstructionTool) => {
    setToolsAnchor(null);
    onToolChange(nextTool);
  };
  const toolsMenu = (
    <>
      <Button
        startIcon={<MoreHorizRounded />}
        disabled={disabled}
        aria-controls={toolsAnchor ? 'admin-floorplan-construction-tools' : undefined}
        aria-haspopup="menu"
        aria-expanded={toolsAnchor ? 'true' : undefined}
        onClick={openTools}
        sx={{ minHeight: 44 }}
      >
        Más herramientas
      </Button>
      <Menu
        id="admin-floorplan-construction-tools"
        anchorEl={toolsAnchor}
        open={Boolean(toolsAnchor)}
        onClose={() => setToolsAnchor(null)}
        slotProps={{ paper: { sx: { width: 'min(320px, 90vw)' } } }}
      >
        <MenuItem
          selected={tool === 'manual'}
          disabled={disabled}
          onClick={() => chooseTool('manual')}
          sx={{ minHeight: 44 }}
        >
          Construcción manual
        </MenuItem>
        <MenuItem
          selected={tool === 'svg'}
          disabled={disabled || !svgAvailable}
          onClick={() => chooseTool('svg')}
          sx={{ minHeight: 44 }}
        >
          <ListItemText
            primary="Vincular elementos del plano"
            secondary={svgAvailable ? undefined : 'Disponible al cargar un plano SVG'}
          />
        </MenuItem>
        {tool === 'trace' ? (
          <MenuItem disabled={disabled} onClick={() => chooseTool('entry')} sx={{ minHeight: 44 }}>
            Salir de Calca
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
  if (tool === 'trace')
    return (
      <Stack
        component="section"
        aria-label="Herramientas de Calca"
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Typography component="h3" variant="subtitle1" sx={{ mr: 'auto' }}>
          Calcar distribución
        </Typography>
        <Button variant="contained" disabled={!canAddTable} onClick={onAddTable} sx={{ minHeight: 44 }}>
          Agregar mesa
        </Button>
        <Button variant="outlined" disabled={!canReview} onClick={onReview} sx={{ minHeight: 44 }}>
          {reviewLoading ? 'Actualizando plano…' : 'Revisar distribución'}
        </Button>
        {toolsMenu}
      </Stack>
    );
  return (
    <Stack component="section" aria-labelledby="floorplan-construction-title" spacing={1.5} sx={{ py: 1 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography id="floorplan-construction-title" component="h3" variant="h6">
            {tool === 'entry' ? 'Plano listo para calcar' : tool === 'manual' ? 'Construcción manual' : 'Mapeo SVG'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tool === 'svg'
              ? 'Selecciona un elemento del plano para vincularlo a una mesa o zona.'
              : tool === 'manual'
                ? 'Coloca mesas y zonas con las herramientas manuales.'
                : 'Usa el plano como guía: selecciona una mesa existente o agrega una referencia sobre el dibujo.'}
          </Typography>
        </Box>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="contained"
            aria-pressed={false}
            disabled={disabled}
            onClick={() => onToolChange('trace')}
            sx={{ minHeight: 44 }}
          >
            Calcar distribución
          </Button>
          {toolsMenu}
        </Stack>
      </Stack>
    </Stack>
  );
}
