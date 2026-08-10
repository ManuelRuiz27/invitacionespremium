import {
  ApiError,
  type ApiClient,
  type AvailableService,
  type Event,
  type InvitationDesign
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { serviceLabels } from '../../shared/formatters';
import { blockerMessage, errorMessage } from '../wizard-utils';
import { AssetPreview } from './AssetPreview';
import { HotspotEditor } from './HotspotEditor';
import { usePrivateAssetUrl } from './usePrivateAssetUrl';

type LoadState = 'loading' | 'ready' | 'error';
type MutationKind = 'upload' | 'replace' | 'reorder' | 'delete';
type PendingPageUpload = { file: File; assetId?: string };
type Feedback =
  | { kind: 'error'; message: string }
  | { kind: 'info'; message: string }
  | { kind: 'refresh-needed'; message: string }
  | { kind: 'partial-upload'; message: string; pending: PendingPageUpload[] };

class PartialPageUploadError extends Error {
  constructor(
    readonly confirmed: number,
    readonly total: number,
    readonly design: InvitationDesign,
    readonly pending: PendingPageUpload[]
  ) {
    super('PARTIAL_PAGE_UPLOAD');
  }
}

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
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [feedback, setFeedback] = useState<Feedback>();
  const [mutation, setMutation] = useState<{ kind: MutationKind; label: string }>();
  const [flyerAssets, setFlyerAssets] = useState<{ initial?: string; qr?: string }>({});
  const [activePageId, setActivePageId] = useState<string>();
  const [pendingOrder, setPendingOrder] = useState<string[]>();
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const mutationLockRef = useRef(false);
  const flipbookCreateUncertainRef = useRef(false);

  const adopt = useCallback((next: InvitationDesign | undefined) => {
    setDesign(next);
    setActivePageId((current) => {
      if (next?.type !== 'FLIPBOOK') return undefined;
      return next.pages.some((page) => page.id === current) ? current : next.pages[0]?.id;
    });
  }, []);

  const getDesign = useCallback(async (): Promise<InvitationDesign | undefined> => {
    try {
      return await apiClient.design.get(event.id);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'INVITATION_DESIGN_NOT_FOUND') return undefined;
      throw reason;
    }
  }, [apiClient, event.id]);

  const refresh = useCallback(
    async (retainConfirmedState = false): Promise<boolean> => {
      if (!retainConfirmedState) setLoadState('loading');
      try {
        const [ready, next] = await Promise.all([apiClient.design.readiness(event.id), getDesign()]);
        if (next && service && next.type !== service.code) {
          throw new ApiError(
            409,
            'INVITATION_DESIGN_SERVICE_MISMATCH',
            'The active invitation design does not match the selected service.'
          );
        }
        setReadiness(ready.blockers);
        adopt(next);
        setLoadState('ready');
        setFeedback(undefined);
        return true;
      } catch (reason) {
        if (!retainConfirmedState) setLoadState('error');
        setFeedback({ kind: 'error', message: errorMessage(reason) });
        return false;
      }
    },
    [adopt, apiClient, event.id, getDesign, service]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runMutation = async (
    kind: MutationKind,
    label: string,
    action: () => Promise<InvitationDesign>
  ): Promise<boolean> => {
    if (mutationLockRef.current || loadState !== 'ready') return false;
    mutationLockRef.current = true;
    setMutation({ kind, label });
    setFeedback(undefined);
    try {
      const result = await action();
      adopt(result);
      if (!(await refresh(true))) {
        setFeedback({
          kind: 'refresh-needed',
          message: 'El cambio sí se guardó. No pudimos actualizar la vista; vuelve a cargarla sin repetir la acción.'
        });
      }
      return true;
    } catch (reason) {
      if (reason instanceof PartialPageUploadError) {
        adopt(reason.design);
        setFeedback({
          kind: 'partial-upload',
          message: `Se agregaron ${reason.confirmed} de ${reason.total} páginas. Las confirmadas ya están guardadas; reintenta únicamente las pendientes.`,
          pending: reason.pending
        });
        return false;
      }
      setFeedback({
        kind: reason instanceof Error && reason.message === 'FLYER_ASSETS_PENDING' ? 'info' : 'error',
        message: pageMutationMessage(reason, kind)
      });
      return false;
    } finally {
      mutationLockRef.current = false;
      setMutation(undefined);
    }
  };

  const reconcileAfterUncertain = async (
    reason: unknown,
    matches: (candidate: InvitationDesign | undefined) => boolean
  ): Promise<InvitationDesign> => {
    if (!isUncertain(reason)) throw reason;
    const candidate = await getDesign();
    if (!matches(candidate) || !candidate) throw reason;
    return candidate;
  };

  const ensureFlipbook = async (): Promise<InvitationDesign> => {
    if (design?.type === 'FLIPBOOK') return design;
    if (flipbookCreateUncertainRef.current) {
      const existing = await getDesign();
      if (existing?.type === 'FLIPBOOK') {
        flipbookCreateUncertainRef.current = false;
        adopt(existing);
        return existing;
      }
      if (existing) throw new ApiError(409, 'INVITATION_DESIGN_SERVICE_MISMATCH', 'Unexpected design type.');
    }
    try {
      const created = await apiClient.design.createFlipbook(event.id);
      flipbookCreateUncertainRef.current = false;
      adopt(created);
      return created;
    } catch (reason) {
      if (!isUncertain(reason)) throw reason;
      flipbookCreateUncertainRef.current = true;
      const existing = await getDesign();
      if (existing?.type !== 'FLIPBOOK') throw reason;
      flipbookCreateUncertainRef.current = false;
      adopt(existing);
      return existing;
    }
  };

  const uploadFlyer = async (file: File, type: 'initial' | 'qr') => {
    if (!isImage(file)) return setFeedback({ kind: 'error', message: 'Usa únicamente una imagen JPG o PNG.' });
    await runMutation('upload', 'Guardando imagen…', async () => {
      const asset = await apiClient.fileAssets.upload(
        event.id,
        file,
        type === 'initial' ? 'FLYER_INITIAL_IMAGE' : 'FLYER_QR_IMAGE',
        'FLYER'
      );
      if (design?.type === 'FLYER') {
        return type === 'initial'
          ? apiClient.design.replaceFlyerInitial(event.id, { assetId: asset.id })
          : apiClient.design.replaceFlyerQr(event.id, { assetId: asset.id });
      }
      const next = { ...flyerAssets, [type]: asset.id };
      setFlyerAssets(next);
      if (!next.initial || !next.qr) throw new Error('FLYER_ASSETS_PENDING');
      try {
        return await apiClient.design.createFlyer(event.id, {
          initialAssetId: next.initial,
          qrAssetId: next.qr
        });
      } catch (reason) {
        return reconcileAfterUncertain(
          reason,
          (candidate) =>
            candidate?.type === 'FLYER' &&
            candidate.flyerInitialAssetId === next.initial &&
            candidate.flyerQrAssetId === next.qr
        );
      }
    });
  };

  const addPages = async (files: File[], retryItems?: PendingPageUpload[]) => {
    const remaining = 10 - (design?.pages.length ?? 0);
    const items: PendingPageUpload[] =
      retryItems ??
      files
        .filter(isImage)
        .slice(0, remaining)
        .map((file) => ({ file }));
    if (!items.length) return setFeedback({ kind: 'error', message: 'Selecciona entre 1 y 10 imágenes JPG o PNG.' });
    const succeeded = await runMutation(
      'upload',
      items.length === 1 ? 'Agregando página…' : `Agregando ${items.length} páginas…`,
      async () => {
        let current = await ensureFlipbook();
        let confirmed = 0;
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index]!;
          let assetId = item.assetId;
          try {
            if (!assetId) {
              const asset = await apiClient.fileAssets.upload(
                event.id,
                item.file,
                'FLIPBOOK_PAGE_IMAGE',
                'FLIPBOOK_PAGE'
              );
              assetId = asset.id;
            }
            current = await apiClient.design.addPage(event.id, { fileAssetId: assetId });
          } catch (reason) {
            try {
              if (!assetId) throw reason;
              current = await reconcileAfterUncertain(
                reason,
                (candidate) =>
                  candidate?.type === 'FLIPBOOK' && candidate.pages.some((page) => page.fileAssetId === assetId)
              );
            } catch {
              throw new PartialPageUploadError(confirmed, items.length, current, [
                { file: item.file, ...(assetId ? { assetId } : {}) },
                ...items.slice(index + 1)
              ]);
            }
          }
          confirmed += 1;
          adopt(current);
        }
        return current;
      }
    );
    if (succeeded) {
      if (items.length > 1 || retryItems) {
        setFeedback({
          kind: 'info',
          message: items.length === 1 ? 'Se agregó 1 página.' : `Se agregaron ${items.length} páginas.`
        });
      }
    }
  };

  const replacePage = async (pageId: string, file: File) => {
    if (!isImage(file)) return setFeedback({ kind: 'error', message: 'Usa únicamente una imagen JPG o PNG.' });
    await runMutation('replace', 'Reemplazando página…', async () => {
      const asset = await apiClient.fileAssets.upload(event.id, file, 'FLIPBOOK_PAGE_IMAGE', 'FLIPBOOK_PAGE');
      try {
        return await apiClient.design.replacePage(event.id, pageId, { assetId: asset.id });
      } catch (reason) {
        return reconcileAfterUncertain(
          reason,
          (candidate) => candidate?.pages.some((page) => page.id === pageId && page.fileAssetId === asset.id) ?? false
        );
      }
    });
  };

  const reorder = async (pageIds: string[]) => {
    await runMutation('reorder', 'Ordenando páginas…', async () => {
      try {
        return await apiClient.design.reorderPages(event.id, { pageIds });
      } catch (reason) {
        return reconcileAfterUncertain(
          reason,
          (candidate) => candidate?.pages.map((page) => page.id).join('|') === pageIds.join('|')
        );
      }
    });
  };

  const requestReorder = (pageId: string, direction: -1 | 1) => {
    if (design?.type !== 'FLIPBOOK') return;
    const ids = design.pages.map((page) => page.id);
    const from = ids.indexOf(pageId);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    requestExactReorder(ids);
  };

  const requestExactReorder = (ids: string[]) => {
    if (!design || ids.join('|') === design.pages.map((page) => page.id).join('|')) return;
    if (reorderAffectsActions(design, ids)) setPendingOrder(ids);
    else void reorder(ids);
  };

  const removePage = async (pageId: string) => {
    await runMutation('delete', 'Eliminando página…', async () => {
      try {
        return (await apiClient.design.removePage(event.id, pageId)) as unknown as InvitationDesign;
      } catch (reason) {
        return reconcileAfterUncertain(reason, (candidate) => !candidate?.pages.some((page) => page.id === pageId));
      }
    });
  };

  const activePage = design?.pages.find((page) => page.id === activePageId) ?? design?.pages[0];
  const activePageIndex = activePage ? (design?.pages.findIndex((page) => page.id === activePage.id) ?? -1) : -1;
  const activeUrl = usePrivateAssetUrl(apiClient, event.id, activePage?.fileAssetId);
  const flyerInitial = design?.flyerInitialAssetId ?? flyerAssets.initial;
  const flyerQr = design?.flyerQrAssetId ?? flyerAssets.qr;
  const flyerPreview = usePrivateAssetUrl(apiClient, event.id, flyerInitial);
  const interactionDisabled = disabled || mutation !== undefined || loadState !== 'ready';

  if (loadState === 'loading' && !design) return <InvitationLoading />;
  if (loadState === 'error' && !design) {
    return (
      <Alert severity="error" action={<Button onClick={() => void refresh()}>Reintentar</Button>}>
        No pudimos cargar el diseño de la invitación. Ningún cambio está habilitado hasta verificarlo.
      </Alert>
    );
  }

  return (
    <Stack spacing={1.5} data-testid="invitation-design-workspace">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ gap: 1, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box>
          <Typography component="h2" variant="h4">
            Invitación
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {service ? serviceLabels[service.code] : 'Elige un formato'} · organiza, define acciones y revisa.
          </Typography>
        </Box>
        {mutation ? <Chip color="primary" label={mutation.label} aria-live="polite" /> : null}
      </Stack>
      {mutation ? <LinearProgress aria-label={mutation.label} /> : null}

      {service?.code === 'FLYER' ? (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <AssetPreview apiClient={apiClient} eventId={event.id} assetId={flyerInitial} label="Imagen principal" />
            <AssetPreview apiClient={apiClient} eventId={event.id} assetId={flyerQr} label="Imagen con QR" />
          </Stack>
          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            <UploadButton
              label={flyerInitial ? 'Cambiar imagen principal' : 'Subir imagen principal'}
              disabled={interactionDisabled}
              onFiles={(files) => files[0] && void uploadFlyer(files[0], 'initial')}
            />
            <UploadButton
              label={flyerQr ? 'Cambiar imagen con QR' : 'Subir imagen con QR'}
              disabled={interactionDisabled}
              onFiles={(files) => files[0] && void uploadFlyer(files[0], 'qr')}
            />
          </Stack>
          <HotspotEditor
            apiClient={apiClient}
            eventId={event.id}
            ownerType="FLYER"
            hotspots={design?.hotspots ?? []}
            disabled={interactionDisabled}
            previewUrl={flyerPreview}
            contextLabel="Acciones del Flyer"
            onChanged={async () => {
              if (!(await refresh(true))) throw new Error('REFRESH_AFTER_CONFIRMED');
            }}
          />
        </Stack>
      ) : service?.code === 'FLIPBOOK' ? (
        design?.type === 'FLIPBOOK' && design.pages.length ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '236px minmax(0, 1fr)' },
              gap: 1.5,
              minHeight: 560
            }}
          >
            <PageRail
              apiClient={apiClient}
              eventId={event.id}
              design={design}
              activePageId={activePage?.id}
              disabled={interactionDisabled}
              onSelect={setActivePageId}
              onMove={requestReorder}
              onReorder={requestExactReorder}
              onReplace={(pageId, file) => void replacePage(pageId, file)}
              onDelete={(pageId) => {
                const pageHasActions = design.hotspots.some((hotspot) => hotspot.flipbookPageId === pageId);
                if (pageHasActions) setPendingDeleteId(pageId);
                else void removePage(pageId);
              }}
            />
            {activePage ? (
              <HotspotEditor
                apiClient={apiClient}
                eventId={event.id}
                ownerType="FLIPBOOK_PAGE"
                pageId={activePage.id}
                pagePosition={activePage.position}
                hotspots={design.hotspots}
                disabled={interactionDisabled}
                previewUrl={activeUrl}
                contextLabel={
                  activePageIndex === 0 ? 'Acciones de la portada' : `Acciones de Página ${activePageIndex + 1}`
                }
                onChanged={async () => {
                  if (!(await refresh(true))) throw new Error('REFRESH_AFTER_CONFIRMED');
                }}
              />
            ) : null}
          </Box>
        ) : (
          <EmptyFlipbook disabled={interactionDisabled} onFiles={(files) => void addPages(files)} />
        )
      ) : (
        <Alert severity="info">Selecciona Flyer o Flipbook en Datos.</Alert>
      )}

      {design?.type === 'FLIPBOOK' && design.pages.length ? (
        <UploadButton
          multiple
          label="Agregar páginas"
          disabled={interactionDisabled || design.pages.length >= 10}
          onFiles={(files) => void addPages(files)}
        />
      ) : null}
      {readiness.length ? (
        <Readiness blockers={readiness} />
      ) : design ? (
        <Alert severity="success">La invitación está lista.</Alert>
      ) : null}
      {feedback ? (
        <Alert
          severity={feedback.kind === 'error' ? 'error' : feedback.kind === 'info' ? 'info' : 'warning'}
          action={
            feedback.kind === 'refresh-needed' ? (
              <Button onClick={() => void refresh()}>Actualizar vista</Button>
            ) : feedback.kind === 'partial-upload' ? (
              <Button onClick={() => void addPages([], feedback.pending)}>Reintentar pendientes</Button>
            ) : undefined
          }
          aria-live="assertive"
        >
          {feedback.message}
        </Alert>
      ) : null}

      <Dialog
        open={Boolean(pendingOrder)}
        onClose={() => setPendingOrder(undefined)}
        aria-labelledby="reorder-warning-title"
      >
        <DialogTitle id="reorder-warning-title">Revisar acciones antes de ordenar</DialogTitle>
        <DialogContent>
          Esta página tiene acciones que dependen de ser Portada o página QR. Ajusta esas acciones antes de cambiar su
          posición.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingOrder(undefined)}>Cancelar</Button>
          <Button variant="contained" onClick={() => setPendingOrder(undefined)}>
            Entendido
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(pendingDeleteId)}
        onClose={() => setPendingDeleteId(undefined)}
        aria-labelledby="delete-page-title"
      >
        <DialogTitle id="delete-page-title">Eliminar página y sus acciones</DialogTitle>
        <DialogContent>
          Esta página tiene acciones configuradas. Al eliminarla, esas acciones también se retirarán. Esta decisión no
          afecta las demás páginas.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteId(undefined)}>Conservar página</Button>
          <Button
            color="error"
            onClick={() => {
              const id = pendingDeleteId;
              setPendingDeleteId(undefined);
              if (id) void removePage(id);
            }}
          >
            Eliminar página
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function PageRail({
  apiClient,
  eventId,
  design,
  activePageId,
  disabled,
  onSelect,
  onMove,
  onReorder,
  onReplace,
  onDelete
}: {
  apiClient: ApiClient;
  eventId: string;
  design: InvitationDesign;
  activePageId: string | undefined;
  disabled: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (ids: string[]) => void;
  onReplace: (id: string, file: File) => void;
  onDelete: (id: string) => void;
}) {
  const [draggedId, setDraggedId] = useState<string>();
  const touchStartRef = useRef<{ id: string; x: number; y: number } | undefined>(undefined);
  const dropOn = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = design.pages.map((page) => page.id).filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(targetId), 0, draggedId);
    setDraggedId(undefined);
    onReorder(ids);
  };
  return (
    <Box
      component="nav"
      aria-label="Páginas del Flipbook"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'row', lg: 'column' },
        gap: 1,
        overflow: 'auto',
        pb: { xs: 1, lg: 0 }
      }}
    >
      {design.pages.map((page, index) => {
        const selected = page.id === activePageId;
        const isQr = design.hotspots.some(
          (hotspot) => hotspot.flipbookPageId === page.id && hotspot.action === 'QR_AREA'
        );
        return (
          <Box
            key={page.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOn(page.id)}
            sx={{
              minWidth: { xs: 236, lg: 0 },
              border: '1px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              borderRadius: 2,
              p: 0.75,
              bgcolor: selected ? 'action.selected' : 'background.paper',
              boxShadow: selected ? 2 : 0
            }}
          >
            <Button
              fullWidth
              aria-pressed={selected}
              onClick={() => onSelect(page.id)}
              sx={{ minHeight: 44, justifyContent: 'space-between', px: 0.5 }}
            >
              <span>{index === 0 ? 'Portada' : `Página ${index + 1}`}</span>
              {isQr ? <Chip size="small" label="QR" /> : null}
            </Button>
            <AssetPreview
              compact
              apiClient={apiClient}
              eventId={eventId}
              assetId={page.fileAssetId}
              label={`Página ${index + 1}`}
            />
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between' }}
              aria-label={`Orden y opciones de Página ${index + 1}`}
            >
              <Button
                draggable={!disabled}
                aria-label={`Arrastrar Página ${index + 1} para ordenar`}
                disabled={disabled}
                onDragStart={() => setDraggedId(page.id)}
                onDragEnd={() => setDraggedId(undefined)}
                onPointerDown={(event) => {
                  if (event.pointerType === 'touch')
                    touchStartRef.current = { id: page.id, x: event.clientX, y: event.clientY };
                }}
                onPointerUp={(event) => {
                  const start = touchStartRef.current;
                  touchStartRef.current = undefined;
                  if (!start || start.id !== page.id || event.pointerType !== 'touch') return;
                  const horizontal = Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y);
                  const delta = horizontal ? event.clientX - start.x : event.clientY - start.y;
                  if (Math.abs(delta) >= 28) onMove(page.id, delta < 0 ? -1 : 1);
                }}
                sx={{ minWidth: 44, minHeight: 44, cursor: disabled ? 'default' : 'grab', touchAction: 'pan-y' }}
              >
                ↕
              </Button>
              <Button
                aria-label={`Mover Página ${index + 1} antes`}
                disabled={disabled || index === 0}
                onClick={() => onMove(page.id, -1)}
                sx={{ minWidth: 44 }}
              >
                ↑
              </Button>
              <Button
                aria-label={`Mover Página ${index + 1} después`}
                disabled={disabled || index === design.pages.length - 1}
                onClick={() => onMove(page.id, 1)}
                sx={{ minWidth: 44 }}
              >
                ↓
              </Button>
              <UploadButton
                compact
                label={`Reemplazar Página ${index + 1}`}
                disabled={disabled}
                onFiles={(files) => files[0] && onReplace(page.id, files[0])}
              />
              <Button
                aria-label={`Eliminar Página ${index + 1}`}
                color="error"
                disabled={disabled || design.pages.length <= 1}
                onClick={() => onDelete(page.id)}
                sx={{ minWidth: 44 }}
              >
                ×
              </Button>
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

function UploadButton({
  label,
  disabled,
  multiple = false,
  compact = false,
  onFiles
}: {
  label: string;
  disabled: boolean;
  multiple?: boolean;
  compact?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <Button
      component="label"
      disabled={disabled}
      aria-label={label}
      sx={{ minWidth: compact ? 44 : undefined, minHeight: 44, px: compact ? 0.5 : undefined }}
    >
      {compact ? '↥' : label}
      <input
        hidden
        type="file"
        multiple={multiple}
        accept="image/jpeg,image/png"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </Button>
  );
}

function EmptyFlipbook({ disabled, onFiles }: { disabled: boolean; onFiles: (files: File[]) => void }) {
  return (
    <Box
      sx={{
        minHeight: 420,
        display: 'grid',
        placeItems: 'center',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper',
        p: 3,
        textAlign: 'center'
      }}
    >
      <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography component="h3" variant="h4">
          Sube tus páginas
        </Typography>
        <Typography color="text.secondary">
          Selecciona de 1 a 10 imágenes. Podrás ordenarlas antes de configurar sus acciones.
        </Typography>
        <UploadButton multiple label="Seleccionar imágenes" disabled={disabled} onFiles={onFiles} />
      </Stack>
    </Box>
  );
}

function InvitationLoading() {
  return (
    <Stack spacing={1}>
      <Typography>Cargando tu invitación…</Typography>
      <LinearProgress />
    </Stack>
  );
}

function Readiness({ blockers }: { blockers: string[] }) {
  return (
    <Alert severity="warning">
      <Typography>Antes de terminar:</Typography>
      <Box component="ul" sx={{ mb: 0 }}>
        {blockers.map((code) => (
          <li key={code}>{blockerMessage(code)}</li>
        ))}
      </Box>
    </Alert>
  );
}

function isImage(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png';
}
function isUncertain(reason: unknown): boolean {
  return !(reason instanceof ApiError) || reason.status === 429 || reason.status >= 500;
}
function pageMutationMessage(reason: unknown, kind: MutationKind): string {
  if (reason instanceof Error && reason.message === 'FLYER_ASSETS_PENDING')
    return 'Agrega la segunda imagen para crear el Flyer.';
  const translated = errorMessage(reason);
  if (!translated.startsWith('No se pudo completar la operación')) return translated;
  return kind === 'delete'
    ? 'No pudimos eliminar la página. Conservamos el orden para que puedas reintentar.'
    : kind === 'reorder'
      ? 'No pudimos cambiar el orden. Revisa las acciones de la portada e inténtalo nuevamente.'
      : 'No pudimos guardar este cambio. Tu selección se conserva para reintentar.';
}
function reorderAffectsActions(design: InvitationDesign, nextIds: string[]): boolean {
  const nextCover = nextIds[0];
  return design.hotspots.some(
    (hotspot) => hotspot.flipbookPageId && hotspot.flipbookPageId !== nextCover && hotspot.action !== 'QR_AREA'
  );
}
