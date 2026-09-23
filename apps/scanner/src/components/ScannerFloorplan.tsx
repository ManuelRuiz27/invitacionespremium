import { useState } from 'react';
import type { ScannerFloorplanResponse, ScannerSeat } from '@invitaciones/api-client';
import { projectAspectAwareRect, relativeRectStyles, useElementSize } from '@invitaciones/ui';
import { Alert, Box, Chip, Typography } from '@mui/material';
import LocationOnRounded from '@mui/icons-material/LocationOnRounded';

export interface ScannerFloorplanProps {
  floorplan: ScannerFloorplanResponse;
  contentUrl: string;
  highlightedTableIds?: readonly string[];
  highlightedSeats?: readonly Pick<ScannerSeat, 'id' | 'label' | 'x' | 'y'>[];
}

export function ScannerFloorplan({
  floorplan,
  contentUrl,
  highlightedTableIds = [],
  highlightedSeats = []
}: ScannerFloorplanProps) {
  const [imageError, setImageError] = useState(false);
  const [measureOwner, ownerSize] = useElementSize<HTMLDivElement>();
  const uniqueTableIds = [...new Set(highlightedTableIds)];
  const hasMultipleTables = uniqueTableIds.length > 1;
  const highlightedTable =
    uniqueTableIds.length === 1
      ? floorplan.shapes.find((shape) => shape.id === uniqueTableIds[0] && shape.kind === 'TABLE')
      : undefined;
  const highlightedSvgElement =
    floorplan.sourceType === 'SVG' && highlightedTable?.sourceElementId
      ? floorplan.svgSource?.selectableElements.find(
          (element) => element.sourceElementId === highlightedTable.sourceElementId
        )
      : undefined;
  const highlightedRect =
    highlightedTable && (floorplan.sourceType === 'RASTER' || !highlightedTable.sourceElementId)
      ? projectAspectAwareRect(
          highlightedTable,
          ownerSize,
          highlightedTable.geometry === 'CIRCLE' || highlightedTable.geometry === 'SQUARE'
        )
      : undefined;
  const exactSeats = [...new Map(highlightedSeats.map((seat) => [seat.id, seat])).values()];

  // Coordinates for the floating pin pointer callout
  const centerLeft = highlightedRect
    ? (highlightedRect.x + highlightedRect.width / 2) * 100
    : highlightedSvgElement
      ? (highlightedSvgElement.bbox.x + highlightedSvgElement.bbox.width / 2) * 100
      : null;

  const topPos = highlightedRect
    ? highlightedRect.y * 100
    : highlightedSvgElement
      ? highlightedSvgElement.bbox.y * 100
      : null;

  const heightPos = highlightedRect
    ? highlightedRect.height * 100
    : highlightedSvgElement
      ? highlightedSvgElement.bbox.height * 100
      : null;

  const bottomPos = topPos !== null && heightPos !== null ? topPos + heightPos : null;
  const isNearTop = topPos !== null && topPos < 15;
  const badgeLeft = centerLeft !== null ? Math.max(22, Math.min(78, centerLeft)) : 50;

  return (
    <Box component="section" aria-labelledby="floorplan-title">
      <Typography id="floorplan-title" variant="h2" sx={{ mb: 2 }}>
        Croquis del Evento
      </Typography>
      {highlightedTable ? (
        <Alert
          severity="success"
          icon={<LocationOnRounded sx={{ color: 'warning.main' }} />}
          sx={{
            mb: 2,
            fontWeight: 600,
            border: 1,
            borderColor: 'warning.light',
            bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255, 152, 0, 0.12)' : 'rgba(255, 152, 0, 0.08)'),
            '& .MuiAlert-message': { width: '100%' }
          }}
        >
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}
          >
            <span>
              Mesa asignada: <strong>{highlightedTable.name}</strong>
              {exactSeats.length > 0 ? ` · Asiento: ${exactSeats.map((s) => s.label).join(', ')}` : ''}
            </span>
            <Chip
              label="📍 Señalado en croquis"
              size="small"
              color="warning"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: '0.75rem' }}
            />
          </Box>
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

          {/* Table raster highlight overlay with pulsing glow */}
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
                bgcolor: 'rgba(255, 152, 0, 0.35)',
                borderRadius: highlightedTable.geometry === 'CIRCLE' ? '50%' : 0,
                clipPath:
                  highlightedTable.geometry === 'POLYGON' && highlightedTable.polygonPoints
                    ? `polygon(${highlightedTable.polygonPoints
                        .map(({ x, y }) => `${x * 100}% ${y * 100}%`)
                        .join(', ')})`
                    : undefined,
                transform: `rotate(${highlightedTable.rotation}deg)`,
                transformOrigin: 'center',
                pointerEvents: 'none',
                animation: 'tableBeaconPulse 2s ease-in-out infinite',
                '@keyframes tableBeaconPulse': {
                  '0%': {
                    boxShadow: '0 0 0 0 rgba(255, 152, 0, 0.8), inset 0 0 10px rgba(255, 152, 0, 0.4)'
                  },
                  '50%': {
                    boxShadow: '0 0 0 14px rgba(255, 152, 0, 0), inset 0 0 18px rgba(255, 152, 0, 0.7)'
                  },
                  '100%': {
                    boxShadow: '0 0 0 0 rgba(255, 152, 0, 0), inset 0 0 10px rgba(255, 152, 0, 0.4)'
                  }
                }
              }}
            />
          ) : null}

          {/* Table SVG highlight overlay with pulsing glow */}
          {highlightedTable && highlightedSvgElement ? (
            <Box
              role="img"
              aria-label={`Ubicación de la Mesa ${highlightedTable.name} en el Croquis`}
              data-renderer="svg-element"
              sx={{
                position: 'absolute',
                ...relativeRectStyles(highlightedSvgElement.bbox),
                boxSizing: 'border-box',
                border: '3px solid',
                borderColor: 'warning.main',
                bgcolor: 'rgba(255, 152, 0, 0.25)',
                pointerEvents: 'none',
                animation: 'tableBeaconPulse 2s ease-in-out infinite',
                '@keyframes tableBeaconPulse': {
                  '0%': {
                    boxShadow: '0 0 0 0 rgba(255, 152, 0, 0.8)'
                  },
                  '50%': {
                    boxShadow: '0 0 0 14px rgba(255, 152, 0, 0)'
                  },
                  '100%': {
                    boxShadow: '0 0 0 0 rgba(255, 152, 0, 0)'
                  }
                }
              }}
            />
          ) : null}

          {/* Floating animated Pin Marker pointing directly to the table */}
          {highlightedTable && centerLeft !== null && topPos !== null && bottomPos !== null ? (
            <Box
              sx={{
                position: 'absolute',
                left: `${badgeLeft}%`,
                top: isNearTop ? `${bottomPos + 2}%` : `${topPos - 2}%`,
                transform: isNearTop ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                zIndex: 10,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: isNearTop ? 'column-reverse' : 'column',
                alignItems: 'center',
                animation: isNearTop
                  ? 'floorplanPinFloatDown 1.8s ease-in-out infinite'
                  : 'floorplanPinFloatUp 1.8s ease-in-out infinite',
                '@keyframes floorplanPinFloatUp': {
                  '0%, 100%': { transform: 'translate(-50%, -100%) translateY(0)' },
                  '50%': { transform: 'translate(-50%, -100%) translateY(-6px)' }
                },
                '@keyframes floorplanPinFloatDown': {
                  '0%, 100%': { transform: 'translate(-50%, 0) translateY(0)' },
                  '50%': { transform: 'translate(-50%, 0) translateY(6px)' }
                }
              }}
            >
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.6,
                  px: 1.5,
                  py: 0.6,
                  bgcolor: 'rgba(15, 23, 42, 0.94)',
                  color: '#ffffff',
                  borderRadius: 999,
                  boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
                  border: '2px solid',
                  borderColor: 'warning.main',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  letterSpacing: '0.01em',
                  backdropFilter: 'blur(4px)'
                }}
              >
                <LocationOnRounded sx={{ fontSize: 18, color: 'warning.main' }} />
                <span>
                  {highlightedTable.name.toLowerCase().startsWith('mesa')
                    ? highlightedTable.name
                    : `Mesa ${highlightedTable.name}`}
                </span>
              </Box>
              <Box
                sx={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  ...(isNearTop
                    ? { borderBottom: '7px solid', borderBottomColor: 'warning.main', mb: '-1px' }
                    : { borderTop: '7px solid', borderTopColor: 'warning.main', mt: '-1px' })
                }}
              />
            </Box>
          ) : null}

          {/* Exact seat markers */}
          {exactSeats.map((seat) => (
            <Box
              key={seat.id}
              role="img"
              aria-label={`Lugar ${seat.label} seleccionado en el Croquis`}
              data-renderer="floorplan-seat"
              sx={{
                position: 'absolute',
                left: `${seat.x * 100}%`,
                top: `${seat.y * 100}%`,
                width: 24,
                height: 24,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: '3px solid',
                borderColor: 'primary.contrastText',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                pointerEvents: 'none',
                zIndex: 11,
                boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.4), 0 0 14px rgba(37, 99, 235, 0.8)',
                animation: 'seatPulse 1.8s ease-in-out infinite',
                '@keyframes seatPulse': {
                  '0%, 100%': { transform: 'translate(-50%, -50%) scale(1)' },
                  '50%': { transform: 'translate(-50%, -50%) scale(1.15)' }
                }
              }}
            >
              {seat.label}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
