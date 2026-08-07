import type { ApiClient, AvailableService, Event, InvitationDesign } from '@invitaciones/api-client';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { blockerMessage, errorMessage } from '../wizard-utils';
import { AssetPreview } from './AssetPreview';
import { HotspotEditor } from './HotspotEditor';
import { usePrivateAssetUrl } from './usePrivateAssetUrl';
import { serviceLabels } from '../../shared/formatters';

export function DesignStep({
  apiClient,
  event,
  service,
  disabled
}: {
  apiClient: ApiClient;
  event: Event;
  service: AvailableService | undefined;
  disabled: boolean;
}) {
  const [design, setDesign] = useState<InvitationDesign>();
  const [readiness, setReadiness] = useState<string[]>([]);
  const [message, setMessage] = useState<string>();
  const [flyerAssets, setFlyerAssets] = useState<{ initial?: string; qr?: string }>({});
  const [activePageId, setActivePageId] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      const [ready, next] = await Promise.all([
        apiClient.design.readiness(event.id),
        apiClient.design.get(event.id).catch(() => undefined)
      ]);
      setReadiness(ready.blockers);
      setDesign(next);
      if (next?.type === 'FLIPBOOK' && !activePageId) setActivePageId(next.pages[0]?.id);
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  }, [activePageId, apiClient, event.id]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const activePage = design?.pages.find((page) => page.id === activePageId) ?? design?.pages[0];
  const activeUrl = usePrivateAssetUrl(apiClient, event.id, activePage?.fileAssetId);
  const upload = async (file: File, type: 'initial' | 'qr' | 'page', replacePageId?: string) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage('Usa únicamente una imagen JPG o PNG.');
      return;
    }
    try {
      const asset = await apiClient.fileAssets.upload(
        event.id,
        file,
        type === 'initial' ? 'FLYER_INITIAL_IMAGE' : type === 'qr' ? 'FLYER_QR_IMAGE' : 'FLIPBOOK_PAGE_IMAGE',
        type === 'page' ? 'FLIPBOOK_PAGE' : 'FLYER'
      );
      if (type === 'page') {
        if (replacePageId) await apiClient.design.replacePage(event.id, replacePageId, { assetId: asset.id });
        else {
          if (!design) await apiClient.design.createFlipbook(event.id);
          await apiClient.design.addPage(event.id, { fileAssetId: asset.id });
        }
      } else if (design?.type === 'FLYER') {
        await (type === 'initial'
          ? apiClient.design.replaceFlyerInitial(event.id, { assetId: asset.id })
          : apiClient.design.replaceFlyerQr(event.id, { assetId: asset.id }));
      } else {
        const next = { ...flyerAssets, [type]: asset.id };
        setFlyerAssets(next);
        if (next.initial && next.qr)
          await apiClient.design.createFlyer(event.id, { initialAssetId: next.initial, qrAssetId: next.qr });
      }
      await refresh();
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  };
  const reorder = async (pageId: string, direction: -1 | 1) => {
    if (!design) return;
    const ids = design.pages.map((page) => page.id);
    const from = ids.indexOf(pageId),
      to = from + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    await apiClient.design.reorderPages(event.id, { pageIds: ids });
    await refresh();
  };
  const flyerInitial = design?.flyerInitialAssetId ?? flyerAssets.initial;
  const flyerQr = design?.flyerQrAssetId ?? flyerAssets.qr;
  const flyerPreview = usePrivateAssetUrl(apiClient, event.id, flyerInitial);
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Diseño de Invitación
      </Typography>
      <Typography color="text.secondary">
        Configura tu invitación {service ? serviceLabels[service.code] : ''} y revisa cómo la verán tus invitados.
      </Typography>
      {service?.code === 'FLYER' ? (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <AssetPreview apiClient={apiClient} eventId={event.id} assetId={flyerInitial} label="Imagen inicial" />
            <AssetPreview apiClient={apiClient} eventId={event.id} assetId={flyerQr} label="Imagen QR" />
          </Stack>
          <Stack direction="row" spacing={1}>
            {(['initial', 'qr'] as const).map((kind) => (
              <Button key={kind} component="label" disabled={disabled}>
                {kind === 'initial' ? 'Agregar o sustituir imagen inicial' : 'Agregar o sustituir imagen QR'}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file, kind);
                  }}
                />
              </Button>
            ))}
          </Stack>
          <HotspotEditor
            apiClient={apiClient}
            eventId={event.id}
            ownerType="FLYER"
            hotspots={design?.hotspots ?? []}
            disabled={disabled}
            previewUrl={flyerPreview}
            onChanged={refresh}
          />
        </>
      ) : service?.code === 'FLIPBOOK' ? (
        <>
          <Typography>
            Portada: {design?.pages[0] ? `página 1` : 'pendiente'} · {design?.pages.length ?? 0}/10 páginas
          </Typography>
          <Stack direction="row" spacing={1} sx={{ overflowX: 'auto' }}>
            {design?.pages.map((page, index) => (
              <Box
                key={page.id}
                sx={{ border: page.id === activePage?.id ? 2 : 1, borderColor: 'primary.main', p: 1, minWidth: 170 }}
              >
                <Button onClick={() => setActivePageId(page.id)}>
                  Página {index + 1}
                  {index === 0 ? ' · Portada' : ''}
                </Button>
                <AssetPreview
                  apiClient={apiClient}
                  eventId={event.id}
                  assetId={page.fileAssetId}
                  label={`Página ${index + 1}`}
                />
                <Stack>
                  <Button component="label" disabled={disabled}>
                    Reemplazar
                    <input
                      hidden
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file, 'page', page.id);
                      }}
                    />
                  </Button>
                  <Button disabled={disabled || index === 0} onClick={() => void reorder(page.id, -1)}>
                    Mover antes
                  </Button>
                  <Button
                    disabled={disabled || index === design.pages.length - 1}
                    onClick={() => void reorder(page.id, 1)}
                  >
                    Mover después
                  </Button>
                  <Button
                    color="error"
                    disabled={disabled || design.pages.length <= 1}
                    onClick={() => void apiClient.design.removePage(event.id, page.id).then(refresh)}
                  >
                    Eliminar
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
          <Button component="label" disabled={disabled || (design?.pages.length ?? 0) >= 10}>
            Agregar página
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file, 'page');
              }}
            />
          </Button>
          {activePage ? (
            <HotspotEditor
              apiClient={apiClient}
              eventId={event.id}
              ownerType="FLIPBOOK_PAGE"
              pageId={activePage.id}
              hotspots={design?.hotspots ?? []}
              disabled={disabled}
              previewUrl={activeUrl}
              onChanged={refresh}
            />
          ) : null}
        </>
      ) : (
        <Alert severity="info">Selecciona Flyer o Flipbook en Datos.</Alert>
      )}
      {readiness.length ? (
        <Alert severity="warning">
          <Typography>Pendientes del diseño:</Typography>
          <ul>
            {readiness.map((code) => (
              <li key={code}>{blockerMessage(code)}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert severity="success">La invitación está lista.</Alert>
      )}
      {message ? <Alert severity="info">{message}</Alert> : null}
    </Stack>
  );
}
