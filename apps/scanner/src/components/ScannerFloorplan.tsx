import { Box, Typography, Alert } from '@mui/material';

export interface ScannerFloorplanResponse {
  contentPath: string;
  floorplanId: string;
  shapes: Record<string, unknown>[];
}

export interface ScannerFloorplanProps {
  floorplan: ScannerFloorplanResponse | null;
}

export function ScannerFloorplan({ floorplan }: ScannerFloorplanProps) {
  if (!floorplan) {
    return <Alert severity="info">No hay croquis asignado a este evento.</Alert>;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Croquis del Evento</Typography>
      <Box sx={{ border: '1px solid #ccc', borderRadius: 2, overflow: 'hidden' }}>
        {/* Placeholder SVG / Image for Floorplan */}
        {floorplan.contentPath ? (
          <img 
            src={floorplan.contentPath} 
            alt="Floorplan" 
            style={{ width: '100%', height: 'auto', display: 'block' }} 
          />
        ) : (
          <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f5f5f5' }}>
            <Typography variant="body2" color="textSecondary">
              Croquis no disponible (ID: {floorplan.floorplanId})
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
