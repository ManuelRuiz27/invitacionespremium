import type { ApiClient } from '@invitaciones/api-client';
import { Box, Typography } from '@mui/material';
import { usePrivateAssetUrl } from './usePrivateAssetUrl';

export function AssetPreview({
  apiClient,
  eventId,
  assetId,
  label,
  compact = false
}: {
  apiClient: ApiClient;
  eventId: string;
  assetId: string | null | undefined;
  label: string;
  compact?: boolean;
}) {
  const url = usePrivateAssetUrl(apiClient, eventId, assetId);
  return (
    <Box sx={{ minWidth: compact ? 0 : 180, flex: 1 }}>
      {compact ? null : <Typography variant="subtitle2">{label}</Typography>}
      {url ? (
        <Box
          component="img"
          src={url}
          alt={label}
          sx={{
            width: '100%',
            height: compact ? 92 : 'auto',
            maxHeight: compact ? 92 : 280,
            objectFit: 'contain',
            borderRadius: 1
          }}
        />
      ) : (
        <Box sx={{ minHeight: compact ? 72 : 120, bgcolor: 'action.hover', display: 'grid', placeItems: 'center' }}>
          Sin imagen
        </Box>
      )}
    </Box>
  );
}
