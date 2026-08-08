import { useState } from 'react';
import type { ScannerFloorplanResponse } from '@invitaciones/api-client';
import { projectAspectAwareRect, relativeRectStyles, useElementSize } from '@invitaciones/ui';
import { Alert, Box, Typography } from '@mui/material';

export interface ScannerFloorplanProps {
  floorplan: ScannerFloorplanResponse;
  contentUrl: string;
  highlightedTableIds?: readonly string[];
}

export function ScannerFloorplan({ floorplan, contentUrl, highlightedTableIds = [] }: ScannerFloorplanProps) {
  const [imageError, setImageError] = useState(false);
  const [measureOwner, ownerSize] = useElementSize<HTMLDivElement>();
  const uniqueTableIds = [...new Set(highlightedTableIds)];
  const hasMultipleTables = uniqueTableIds.length > 1;
  const highlightedTable =
    uniqueTableIds.length === 1
      ? floorplan.shapes.find((shape) => shape.id === uniqueTableIds[0] && shape.kind === 'TABLE')
      : undefined;
  const highlightedRect = highlightedTable
    ? projectAspectAwareRect(
        highlightedTable,
        ownerSize,
        highlightedTable.geometry === 'CIRCLE' || highlightedTable.geometry === 'SQUARE'
      )
    : undefined;

  return (
    <Box component="section" aria-labelledby="floorplan-title">
      <Typography id="floorplan-title" variant="h2" sx={{ mb: 2 }}>
        Croquis del Evento
      </Typography>
      {highlightedTable ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Mesa asignada: {highlightedTable.name}
        </Alert>
      ) : null}
      {hasMultipleTables ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Los Asistentes seleccionados tienen Mesas distintas. Revisa cada asignación por separado.
        </Alert>
      ) : null}
      {imageError ? (
        <Alert severity="error">No pudimos cargar la imagen del Croquis.</Alert>
      ) : (
        <Box
          ref={measureOwner}
          sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', position: 'relative' }}
        >
          <img
            src={contentUrl}
            alt="Croquis del recinto del Evento"
            onError={() => setImageError(true)}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {highlightedTable && highlightedRect ? (
            <Box
              role="img"
              aria-label={`Ubicación de la Mesa ${highlightedTable.name} en el Croquis`}
              data-geometry={highlightedTable.geometry}
              sx={{
                position: 'absolute',
                ...relativeRectStyles(highlightedRect),
                boxSizing: 'border-box',
                border: '3px solid',
                borderColor: 'warning.main',
                bgcolor: 'rgba(255, 193, 7, 0.3)',
                borderRadius: highlightedTable.geometry === 'CIRCLE' ? '50%' : 0,
                clipPath:
                  highlightedTable.geometry === 'POLYGON' && highlightedTable.polygonPoints
                    ? `polygon(${highlightedTable.polygonPoints
                        .map(({ x, y }) => `${x * 100}% ${y * 100}%`)
                        .join(', ')})`
                    : undefined,
                transform: `rotate(${highlightedTable.rotation}deg)`,
                transformOrigin: 'center',
                pointerEvents: 'none'
              }}
            />
          ) : null}
        </Box>
      )}
    </Box>
  );
}
