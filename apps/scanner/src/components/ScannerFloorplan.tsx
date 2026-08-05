import { useState } from 'react';
import type { ScannerFloorplanResponse } from '@invitaciones/api-client';
import { Alert, Box, Typography } from '@mui/material';

export interface ScannerFloorplanProps {
  floorplan: ScannerFloorplanResponse;
  contentUrl: string;
  highlightedTableId?: string | null;
}

export function ScannerFloorplan({ floorplan, contentUrl, highlightedTableId }: ScannerFloorplanProps) {
  const [imageError, setImageError] = useState(false);
  const highlightedTable = highlightedTableId
    ? floorplan.shapes.find((shape) => shape.id === highlightedTableId && shape.kind === 'TABLE')
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
      {imageError ? (
        <Alert severity="error">No pudimos cargar la imagen del Croquis.</Alert>
      ) : (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          <img
            src={contentUrl}
            alt="Croquis del recinto del Evento"
            onError={() => setImageError(true)}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </Box>
      )}
    </Box>
  );
}
