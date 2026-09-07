import { forwardRef, useCallback, useMemo, useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { useElementSize } from '@invitaciones/ui';
import { Box, CircularProgress } from '@mui/material';
import { HotspotLayer } from './HotspotLayer';
import { PublicAssetImage } from './FlyerRenderer';

type Page = NonNullable<NonNullable<PublicInvitationView['design']>['pages']>[number];
type Hotspot = NonNullable<PublicInvitationView['design']>['hotspots'][number];

interface FlipbookPageProps {
  apiClient: ApiClient;
  token: string;
  page: Page;
  pageNumber: number;
  pageCount: number;
  hotspots: Hotspot[];
  visible: boolean;
  interactive: boolean;
  shouldLoad: boolean;
  onRsvp: () => void;
  onQr: () => void;
  onUnavailableQr: () => void;
  qrAvailable: boolean;
}

export const FlipbookPage = forwardRef<HTMLDivElement, FlipbookPageProps>(function FlipbookPage(
  {
    apiClient,
    token,
    page,
    pageNumber,
    pageCount,
    hotspots,
    visible,
    interactive,
    shouldLoad,
    onRsvp,
    onQr,
    onUnavailableQr,
    qrAvailable
  },
  forwardedRef
) {
  const [pageRef, pageSize] = useElementSize<HTMLDivElement>();
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      pageRef(node);
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef, pageRef]
  );
  const imageRect = useMemo(() => {
    if (!imageSize || pageSize.width <= 0 || pageSize.height <= 0) return { left: 0, top: 0, width: '100%', height: '100%' };
    const scale = Math.min(pageSize.width / imageSize.width, pageSize.height / imageSize.height);
    const width = (imageSize.width * scale * 100) / pageSize.width;
    const height = (imageSize.height * scale * 100) / pageSize.height;
    return { left: `${(100 - width) / 2}%`, top: `${(100 - height) / 2}%`, width: `${width}%`, height: `${height}%` };
  }, [imageSize, pageSize.height, pageSize.width]);
  const disabled = !visible || !interactive;

  return (
    <div
      ref={setRefs}
      data-density={pageNumber === 1 ? 'hard' : undefined}
      aria-label={`Página ${pageNumber} de ${pageCount}`}
      aria-hidden={!visible || undefined}
      style={{ position: 'relative', overflow: 'hidden', background: '#f3eee6' }}
    >
      {shouldLoad ? (
        <Box sx={{ position: 'absolute', inset: 0 }}>
          <PublicAssetImage
            apiClient={apiClient}
            token={token}
            asset={page.asset}
            alt={`Página ${pageNumber} de la invitación`}
            eager={visible}
            fill
            onImageLoad={(image) => setImageSize({ width: image.naturalWidth, height: image.naturalHeight })}
          />
          <Box sx={{ position: 'absolute', ...imageRect }}>
            <HotspotLayer
              hotspots={hotspots}
              onRsvp={onRsvp}
              onQr={onQr}
              onUnavailableQr={onUnavailableQr}
              qrAvailable={qrAvailable}
              disabled={disabled}
            />
          </Box>
        </Box>
      ) : (
        <Box aria-label={`Preparando página ${pageNumber}`} sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      )}
    </div>
  );
});
