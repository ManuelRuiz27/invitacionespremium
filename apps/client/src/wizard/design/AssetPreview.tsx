import type { ApiClient } from '@invitaciones/api-client';
import { Box, Typography } from '@mui/material';
import { usePrivateAssetUrl } from './usePrivateAssetUrl';

export function AssetPreview({
  apiClient,
  eventId,
  assetId,
  label
}: {
  apiClient: ApiClient;
  eventId: string;
  assetId: string | null | undefined;
  label: string;
}) {
  const url = usePrivateAssetUrl(apiClient, eventId, assetId);
  return (
    <Box sx={{ minWidth: 180, flex: 1 }}>
      <Typography variant="subtitle2">{label}</Typography>
      {url ? (
        <Box
          component="img"
          src={url}
          alt={label}
          sx={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 1 }}
        />
      ) : (
        <Box sx={{ minHeight: 120, bgcolor: 'action.hover', display: 'grid', placeItems: 'center' }}>Sin imagen</Box>
      )}
    </Box>
  );
}
