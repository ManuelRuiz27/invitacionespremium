import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { pastedMapHref } from './event-link-preview';

export function EventLocation({
  value,
  href,
  embedHref,
  error,
  disabled,
  onChange
}: {
  value: string | null | undefined;
  href: string | null;
  embedHref: string | null;
  error: string | undefined;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const [failedMap, setFailedMap] = useState<string>();
  const [readyMap, setReadyMap] = useState<string>();
  return (
    <Box sx={{ containerType: 'inline-size' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr)',
          gap: 1.5,
          alignItems: 'center',
          '@container (min-width: 440px)': { gridTemplateColumns: 'minmax(200px,.9fr) minmax(0,1fr)' }
        }}
      >
        {embedHref && failedMap !== embedHref ? (
          <Box sx={{ position: 'relative', minWidth: 0 }}>
            {readyMap !== embedHref ? (
              <Box
                role="status"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  pointerEvents: 'none'
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Cargando Google Maps…
                </Typography>
              </Box>
            ) : null}
            <Box
              component="iframe"
              key={embedHref}
              title="Mapa de la ubicación del evento"
              src={embedHref}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              onLoad={() => setReadyMap(embedHref)}
              onErrorCapture={() => setFailedMap(embedHref)}
              sx={{ display: 'block', width: '100%', height: 'clamp(200px, 24vh, 240px)', border: 0, borderRadius: 1 }}
            />
          </Box>
        ) : (
          <Box
            sx={{
              minHeight: 120,
              bgcolor: 'background.default',
              borderRadius: 1,
              display: 'grid',
              justifyItems: 'center',
              alignContent: 'center',
              gap: 1,
              p: 1.5,
              textAlign: 'center'
            }}
          >
            <LocationOnOutlined sx={{ fontSize: 28, color: 'text.secondary' }} />
            <Typography variant="body2">
              {failedMap === embedHref && embedHref ? 'No pudimos cargar el mapa.' : 'Agrega el mapa de tu celebración'}
            </Typography>
            {embedHref ? (
              <Button
                onClick={() => {
                  setReadyMap(undefined);
                  setFailedMap(undefined);
                }}
              >
                Reintentar mapa
              </Button>
            ) : null}
          </Box>
        )}
        <Stack spacing={1.25} sx={{ minWidth: 0 }}>
          <TextField
            size="small"
            fullWidth
            type="url"
            label="Ubicación"
            name="locationUrl"
            error={Boolean(error)}
            helperText={error ?? 'Google Maps: Compartir → Insertar un mapa → Copiar HTML.'}
            value={value ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(pastedMapHref(e.target.value) ?? (e.target.value || null))}
            onPaste={(e) => {
              const url = pastedMapHref(e.clipboardData.getData('text'));
              if (url) {
                e.preventDefault();
                onChange(url);
              }
            }}
          />
          {href ? (
            <Button
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNew fontSize="small" />}
              sx={{ alignSelf: 'flex-start', minHeight: 44 }}
            >
              Abrir ubicación
            </Button>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}
