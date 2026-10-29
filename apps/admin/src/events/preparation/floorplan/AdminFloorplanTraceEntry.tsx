import { Box, Button, Stack, Typography } from '@mui/material';

export type FloorplanConstructionTool = 'entry' | 'trace' | 'manual' | 'svg';

export function AdminFloorplanTraceEntry({
  tool,
  disabled,
  canAddTable,
  svgAvailable,
  onToolChange,
  onAddTable
}: {
  tool: FloorplanConstructionTool;
  disabled: boolean;
  canAddTable: boolean;
  svgAvailable: boolean;
  selectedTableName: string | undefined;
  onToolChange: (tool: FloorplanConstructionTool) => void;
  onAddTable: () => void;
}) {
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
        <Button disabled={disabled} aria-pressed={false} onClick={() => onToolChange('manual')} sx={{ minHeight: 44 }}>
          Manual
        </Button>
        <Button
          disabled={disabled || !svgAvailable}
          title={svgAvailable ? undefined : 'Disponible con un plano SVG'}
          onClick={() => onToolChange('svg')}
          sx={{ minHeight: 44 }}
        >
          Mapeo SVG
        </Button>
        <Button disabled={disabled} onClick={() => onToolChange('entry')} sx={{ minHeight: 44 }}>
          Salir de Calca
        </Button>
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
          <Button
            variant="outlined"
            aria-pressed={tool === 'manual'}
            disabled={disabled}
            onClick={() => onToolChange('manual')}
            sx={{ minHeight: 44 }}
          >
            Manual
          </Button>
          <Button
            variant="text"
            aria-pressed={tool === 'svg'}
            disabled={disabled || !svgAvailable}
            title={svgAvailable ? undefined : 'Disponible con un plano SVG'}
            onClick={() => onToolChange('svg')}
            sx={{ minHeight: 44 }}
          >
            Mapeo SVG
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
