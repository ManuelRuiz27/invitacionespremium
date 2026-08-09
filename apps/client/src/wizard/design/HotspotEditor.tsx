import type { ApiClient, Hotspot } from '@invitaciones/api-client';
import { Alert, Box, Button, FormHelperText, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { isValidInvitationExternalUrl } from '../../shared/invitation-external-url';
import { relativeRectStyles } from '../../shared/relative-rect';
import { errorMessage, normalizeRect } from '../wizard-utils';

type Draft = Pick<Hotspot, 'x' | 'y' | 'width' | 'height' | 'action' | 'priority'> & { url: string };
type EditorMode = 'idle' | 'choosing' | 'creating' | 'editing';
type Action = Hotspot['action'];
type Mutation = 'saving' | 'deleting';

const initialRect = { x: 0.1, y: 0.1, width: 0.25, height: 0.12 };
const minimumSize = 0.04;
const adjustmentStep = 0.01;
const actions: ReadonlyArray<{
  value: Action;
  label: string;
  areaLabel: string;
  description: string;
}> = [
  {
    value: 'RSVP',
    label: 'Confirmar asistencia',
    areaLabel: 'Confirmar asistencia',
    description: 'Permite abrir la confirmación de asistencia.'
  },
  {
    value: 'LOCATION',
    label: 'Ver ubicación',
    areaLabel: 'Ubicación',
    description: 'Abre la ubicación configurada para el evento.'
  },
  {
    value: 'GIFT_REGISTRY',
    label: 'Mesa de regalos',
    areaLabel: 'Mesa de regalos',
    description: 'Abre la mesa de regalos configurada.'
  },
  {
    value: 'QR_AREA',
    label: 'Mostrar QR',
    areaLabel: 'QR',
    description: 'Muestra el acceso QR del invitado cuando esté disponible.'
  },
  {
    value: 'EXTERNAL_LINK',
    label: 'Enlace adicional',
    areaLabel: 'Enlace adicional',
    description: 'Abre un enlace externo definido por ti.'
  }
];

const actionDetails = (action: Action) => actions.find((item) => item.value === action)!;
const newDraft = (action: Action): Draft => ({ ...initialRect, action, priority: 0, url: '' });

function availableActionsForPage({
  ownerType,
  pageId,
  pagePosition,
  hotspots
}: {
  ownerType: 'FLYER' | 'FLIPBOOK_PAGE';
  pageId?: string | undefined;
  pagePosition?: number | undefined;
  hotspots: Hotspot[];
}): Action[] {
  if (ownerType === 'FLYER') return actions.map((action) => action.value);

  const flipbookQrAreas = hotspots.filter(
    (hotspot) => hotspot.visualOwnerType === 'FLIPBOOK_PAGE' && hotspot.action === 'QR_AREA'
  );
  const isCover = pagePosition === 1;
  const isQrPage = flipbookQrAreas.some((hotspot) => hotspot.flipbookPageId === pageId);
  const hasDifferentQrPage = flipbookQrAreas.some((hotspot) => hotspot.flipbookPageId !== pageId);

  if (isCover) {
    return actions.map((action) => action.value).filter((action) => action !== 'QR_AREA' || !hasDifferentQrPage);
  }
  if (isQrPage) return ['QR_AREA', 'EXTERNAL_LINK'];
  return hasDifferentQrPage ? [] : ['QR_AREA'];
}

function mutationError(reason: unknown, operation: Mutation): string {
  const translated = errorMessage(reason);
  if (!translated.startsWith('No se pudo completar la operación')) return translated;
  return operation === 'deleting'
    ? 'No pudimos eliminar esta acción. Inténtalo nuevamente.'
    : 'No pudimos guardar esta acción. Revisa la información e inténtalo nuevamente.';
}

export function HotspotEditor({
  apiClient,
  eventId,
  ownerType,
  pageId,
  pagePosition,
  hotspots,
  disabled,
  previewUrl,
  contextLabel,
  onChanged
}: {
  apiClient: ApiClient;
  eventId: string;
  ownerType: 'FLYER' | 'FLIPBOOK_PAGE';
  pageId?: string | undefined;
  pagePosition?: number | undefined;
  hotspots: Hotspot[];
  disabled: boolean;
  previewUrl?: string | undefined;
  contextLabel?: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const visible = hotspots.filter((item) =>
    ownerType === 'FLYER' ? item.visualOwnerType === 'FLYER' : item.flipbookPageId === pageId
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mutationLockRef = useRef(false);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const viewportGestureRef = useRef<
    | { type: 'pinch'; distance: number; centerX: number; centerY: number; zoom: number; panX: number; panY: number }
    | { type: 'pan'; x: number; y: number; panX: number; panY: number }
    | undefined
  >(undefined);
  const spacePressedRef = useRef(false);
  const [mode, setMode] = useState<EditorMode>('idle');
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(() => newDraft('RSVP'));
  const [urlTouched, setUrlTouched] = useState(false);
  const [mutation, setMutation] = useState<Mutation>();
  const [mutationMessage, setMutationMessage] = useState<string>();
  const [confirmedMessage, setConfirmedMessage] = useState<string>();
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const selected = visible.find((item) => item.id === selectedId);
  const editing = mode === 'creating' || mode === 'editing';
  const externalLinkCount = hotspots.filter((hotspot) => hotspot.action === 'EXTERNAL_LINK').length;
  const externalUrlValid = draft.action !== 'EXTERNAL_LINK' || isValidInvitationExternalUrl(draft.url);
  const availableActionValues = availableActionsForPage({ ownerType, pageId, pagePosition, hotspots });
  const availableActions = actions.filter(
    (action) =>
      availableActionValues.includes(action.value) && (action.value !== 'EXTERNAL_LINK' || externalLinkCount < 3)
  );
  const interactionDisabled = disabled || mutation !== undefined;

  const updateZoom = (nextZoom: number, clientX?: number, clientY?: number) => {
    const clamped = Math.min(4, Math.max(1, nextZoom));
    setViewport((current) => {
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (!bounds || clientX === undefined || clientY === undefined) return { zoom: clamped, x: 0, y: 0 };
      const localX = clientX - bounds.left;
      const localY = clientY - bounds.top;
      const contentX = (localX - current.x) / current.zoom;
      const contentY = (localY - current.y) / current.zoom;
      return { zoom: clamped, x: localX - contentX * clamped, y: localY - contentY * clamped };
    });
  };

  const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        const [a, b] = [...touchesRef.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        viewportGestureRef.current = {
          type: 'pinch',
          distance: Math.hypot(b.x - a.x, b.y - a.y),
          centerX: (a.x + b.x) / 2,
          centerY: (a.y + b.y) / 2,
          zoom: viewport.zoom,
          panX: viewport.x,
          panY: viewport.y
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    if (spacePressedRef.current) {
      event.preventDefault();
      viewportGestureRef.current = {
        type: 'pan',
        x: event.clientX,
        y: event.clientY,
        panX: viewport.x,
        panY: viewport.y
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  };

  const handleViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const gesture = viewportGestureRef.current;
    if (!gesture) return;
    if (gesture.type === 'pan') {
      event.preventDefault();
      setViewport((current) => ({
        ...current,
        x: gesture.panX + event.clientX - gesture.x,
        y: gesture.panY + event.clientY - gesture.y
      }));
      return;
    }
    if (touchesRef.current.size < 2) return;
    event.preventDefault();
    const [a, b] = [...touchesRef.current.values()];
    if (!a || !b) return;
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const zoom = Math.min(4, Math.max(1, gesture.zoom * (distance / Math.max(1, gesture.distance))));
    setViewport({ zoom, x: gesture.panX + centerX - gesture.centerX, y: gesture.panY + centerY - gesture.centerY });
  };

  const finishViewportPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    touchesRef.current.delete(event.pointerId);
    if (touchesRef.current.size < 2 || viewportGestureRef.current?.type === 'pan')
      viewportGestureRef.current = undefined;
  };

  useEffect(() => {
    setMode('idle');
    setSelectedId(undefined);
    setDraft(newDraft('RSVP'));
    setUrlTouched(false);
    setMutationMessage(undefined);
    setConfirmedMessage(undefined);
  }, [ownerType, pageId, pagePosition]);

  const cancel = () => {
    setMode('idle');
    setSelectedId(undefined);
    setDraft(newDraft('RSVP'));
    setUrlTouched(false);
    setMutationMessage(undefined);
  };

  const selectExisting = (item: Hotspot) => {
    if (interactionDisabled) return;
    setSelectedId(item.id);
    setDraft({
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      action: item.action,
      priority: item.priority,
      url: item.url ?? ''
    });
    setUrlTouched(false);
    setMutationMessage(undefined);
    setMode('editing');
  };

  const startCreating = (action: Action) => {
    setSelectedId(undefined);
    setDraft(newDraft(action));
    setUrlTouched(false);
    setMutationMessage(undefined);
    setMode('creating');
  };

  const save = async () => {
    if (mutationLockRef.current) return;
    if (!externalUrlValid) {
      setUrlTouched(true);
      return;
    }
    mutationLockRef.current = true;
    setMutation('saving');
    setMutationMessage(undefined);
    try {
      const rect = normalizeRect(draft);
      const url = draft.action === 'EXTERNAL_LINK' ? draft.url : undefined;
      if (selected) {
        await apiClient.design.updateHotspot(eventId, selected.id, {
          ...rect,
          action: draft.action,
          priority: draft.priority,
          ...(url ? { url } : {})
        });
      } else {
        await apiClient.design.createHotspot(eventId, {
          ...rect,
          action: draft.action,
          priority: draft.priority,
          visualOwnerType: ownerType,
          ...(pageId ? { flipbookPageId: pageId } : {}),
          ...(url ? { url } : {})
        });
      }
      try {
        await onChanged();
        cancel();
      } catch {
        setMode('idle');
        setSelectedId(undefined);
        setConfirmedMessage('La acción sí se guardó. Actualiza la vista para ver la versión más reciente.');
      }
    } catch (reason) {
      setMutationMessage(mutationError(reason, 'saving'));
    } finally {
      mutationLockRef.current = false;
      setMutation(undefined);
    }
  };

  const remove = async () => {
    if (!selected || mutationLockRef.current) return;
    mutationLockRef.current = true;
    setMutation('deleting');
    setMutationMessage(undefined);
    try {
      await apiClient.design.removeHotspot(eventId, selected.id);
      try {
        await onChanged();
        cancel();
      } catch {
        setMode('idle');
        setSelectedId(undefined);
        setConfirmedMessage('La acción sí se eliminó. Actualiza la vista para ver la versión más reciente.');
      }
    } catch (reason) {
      setMutationMessage(mutationError(reason, 'deleting'));
    } finally {
      mutationLockRef.current = false;
      setMutation(undefined);
    }
  };

  const adjust = (property: 'x' | 'y' | 'width' | 'height', amount: number, oppositePosition?: 'x' | 'y') => {
    setDraft((current) => {
      const next = { ...current, [property]: current[property] + amount };
      if (oppositePosition) next[oppositePosition] = current[oppositePosition] - amount;
      return { ...current, ...normalizeEditorRect(next) };
    });
  };

  const startPointer = (event: React.PointerEvent<HTMLElement>, interaction: 'move' | 'resize') => {
    if (interactionDisabled || !editing) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...draft };
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const onMove = (next: PointerEvent) => {
      if (next.pointerType === 'touch' && touchesRef.current.size >= 2) return;
      next.preventDefault();
      const deltaX = (next.clientX - startX) / bounds.width;
      const deltaY = (next.clientY - startY) / bounds.height;
      const rect = normalizeEditorRect({
        ...start,
        ...(interaction === 'move'
          ? { x: start.x + deltaX, y: start.y + deltaY }
          : { width: start.width + deltaX, height: start.height + deltaY })
      });
      setDraft((current) => ({ ...current, ...rect }));
    };
    const finish = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  };

  const currentAction = actionDetails(draft.action);

  return (
    <Box
      component="section"
      aria-labelledby="invitation-actions-title"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(280px, 340px)' },
        gap: 1.5,
        alignItems: 'start'
      }}
    >
      <Stack spacing={0.5} sx={{ gridColumn: '1 / -1' }}>
        <Typography component="h3" variant="h4" id="invitation-actions-title">
          Acciones de la invitación
        </Typography>
        {contextLabel ? (
          <Typography component="h4" variant="subtitle1" sx={{ fontWeight: 700 }}>
            {contextLabel}
          </Typography>
        ) : null}
        <Typography color="text.secondary">
          Marca sobre tu diseño dónde podrán tocar tus invitados para realizar cada acción.
        </Typography>
      </Stack>

      <Box sx={{ gridColumn: { lg: 1 }, gridRow: { lg: '2 / span 8' }, minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', mb: 0.75 }}>
          <Button
            aria-label="Alejar vista previa"
            disabled={viewport.zoom <= 1}
            onClick={() => updateZoom(viewport.zoom - 0.25)}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            −
          </Button>
          <Button
            aria-label="Ajustar vista previa"
            onClick={() => setViewport({ zoom: 1, x: 0, y: 0 })}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            {Math.round(viewport.zoom * 100)}%
          </Button>
          <Button
            aria-label="Acercar vista previa"
            disabled={viewport.zoom >= 4}
            onClick={() => updateZoom(viewport.zoom + 0.25)}
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            +
          </Button>
        </Stack>
        <Box
          ref={viewportRef}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.code === 'Space') {
              event.preventDefault();
              spacePressedRef.current = true;
            }
          }}
          onKeyUp={(event) => {
            if (event.code === 'Space') spacePressedRef.current = false;
          }}
          onBlur={() => {
            spacePressedRef.current = false;
          }}
          onWheel={(event) => {
            event.preventDefault();
            updateZoom(viewport.zoom * (event.deltaY < 0 ? 1.12 : 0.89), event.clientX, event.clientY);
          }}
          onPointerDownCapture={handleViewportPointerDown}
          onPointerMoveCapture={handleViewportPointerMove}
          onPointerUpCapture={finishViewportPointer}
          onPointerCancelCapture={finishViewportPointer}
          sx={{
            position: 'relative',
            width: '100%',
            maxHeight: '72vh',
            bgcolor: 'grey.100',
            overflow: 'hidden',
            outline: '1px solid',
            outlineColor: 'divider',
            lineHeight: 0,
            touchAction: 'pan-y',
            cursor: spacePressedRef.current ? 'grab' : 'default',
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main' }
          }}
        >
          <Box
            ref={canvasRef}
            aria-label="Vista previa interactiva de la invitación"
            sx={{
              position: 'relative',
              transformOrigin: '0 0',
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
            }}
          >
            {previewUrl ? (
              <Box
                component="img"
                src={previewUrl}
                alt=""
                draggable={false}
                sx={{ display: 'block', width: '100%', height: 'auto' }}
              />
            ) : null}

            {previewUrl
              ? visible.map((item) => {
                  if (editing && item.id === selectedId) return null;
                  const details = actionDetails(item.action);
                  return (
                    <Box
                      component="button"
                      type="button"
                      key={item.id}
                      aria-label={`Editar acción ${details.label}`}
                      disabled={interactionDisabled}
                      onClick={() => selectExisting(item)}
                      sx={areaStyles(item, false)}
                    >
                      <AreaName>{details.areaLabel}</AreaName>
                    </Box>
                  );
                })
              : null}

            {previewUrl && editing ? (
              <Box
                role="group"
                aria-label={`Mover acción ${currentAction.label}`}
                onPointerDown={(event) => startPointer(event, 'move')}
                sx={{
                  ...areaStyles(draft, true),
                  borderStyle: 'solid',
                  borderWidth: 3,
                  borderColor: 'secondary.main',
                  zIndex: 2,
                  cursor: interactionDisabled ? 'default' : 'move',
                  touchAction: 'none'
                }}
              >
                <AreaName>{currentAction.areaLabel}</AreaName>
                <Box
                  component="button"
                  type="button"
                  disabled={interactionDisabled}
                  aria-label={`Cambiar tamaño de ${currentAction.label}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    startPointer(event, 'resize');
                  }}
                  sx={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    width: 44,
                    height: 44,
                    p: 0,
                    border: 0,
                    bgcolor: 'transparent',
                    cursor: interactionDisabled ? 'default' : 'nwse-resize',
                    touchAction: 'none',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      right: 5,
                      bottom: 5,
                      width: 12,
                      height: 12,
                      borderRight: '3px solid',
                      borderBottom: '3px solid',
                      borderColor: 'secondary.main'
                    }
                  }}
                />
              </Box>
            ) : null}
          </Box>
        </Box>
      </Box>

      <Stack spacing={1} component="section" aria-labelledby="configured-actions-title" sx={{ gridColumn: { lg: 2 } }}>
        <Typography component="h4" variant="h6" id="configured-actions-title">
          Acciones configuradas
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, columns: { sm: 2 } }}>
          {actions.map((action) => {
            const configured = visible.some((item) => item.action === action.value);
            return (
              <Typography component="li" key={action.value} color={configured ? 'text.primary' : 'text.secondary'}>
                <Box component="span" aria-hidden="true" sx={{ display: 'inline-block', width: 22 }}>
                  {configured ? '✓' : '○'}
                </Box>
                {action.label}
              </Typography>
            );
          })}
        </Box>
      </Stack>

      {confirmedMessage ? (
        <Alert severity="warning" aria-live="polite" sx={{ gridColumn: { lg: 2 } }}>
          {confirmedMessage}
        </Alert>
      ) : null}

      {mode === 'idle' && !disabled && availableActions.length ? (
        <Button
          variant="contained"
          sx={{ alignSelf: 'flex-start', gridColumn: { lg: 2 }, minHeight: 44 }}
          onClick={() => setMode('choosing')}
        >
          Agregar acción
        </Button>
      ) : null}

      {mode === 'idle' && !disabled && ownerType === 'FLIPBOOK_PAGE' && !availableActions.length ? (
        <Typography color="text.secondary" sx={{ gridColumn: { lg: 2 } }}>
          Esta página no admite acciones adicionales.
        </Typography>
      ) : null}

      {mode === 'choosing' ? (
        <Stack
          spacing={1.5}
          component="section"
          aria-labelledby="choose-action-title"
          sx={{
            gridColumn: { lg: 2 },
            position: { xs: 'sticky', lg: 'static' },
            bottom: { xs: 8, lg: 'auto' },
            zIndex: { xs: 4, lg: 'auto' },
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: { xs: '20px 20px 8px 8px', lg: 2 },
            bgcolor: 'background.paper',
            boxShadow: { xs: 8, lg: 1 }
          }}
        >
          <Typography component="h4" variant="h6" id="choose-action-title">
            ¿Qué quieres que puedan hacer tus invitados?
          </Typography>
          <Stack spacing={1}>
            {availableActions.map((action) => (
              <Button
                key={action.value}
                variant="outlined"
                onClick={() => startCreating(action.value)}
                sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1.25 }}
              >
                <Box>
                  <Typography component="span" sx={{ display: 'block', fontWeight: 700 }}>
                    {action.label}
                  </Typography>
                  <Typography component="span" variant="body2" color="text.secondary">
                    {action.description}
                  </Typography>
                </Box>
              </Button>
            ))}
          </Stack>
          <Button sx={{ alignSelf: 'flex-start' }} onClick={cancel}>
            Cancelar
          </Button>
        </Stack>
      ) : null}

      {editing ? (
        <Stack
          spacing={2}
          component="section"
          aria-labelledby="edit-action-title"
          sx={{
            gridColumn: { lg: 2 },
            position: { xs: 'sticky', lg: 'static' },
            bottom: { xs: 8, lg: 'auto' },
            zIndex: { xs: 4, lg: 'auto' },
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: { xs: '20px 20px 8px 8px', lg: 2 },
            bgcolor: 'background.paper',
            boxShadow: { xs: 8, lg: 1 },
            maxHeight: { lg: '72vh' },
            overflow: { lg: 'auto' }
          }}
        >
          <Stack spacing={0.5}>
            <Typography component="h4" variant="h6" id="edit-action-title">
              {mode === 'creating' ? `Agregar: ${currentAction.label}` : `Editar: ${currentAction.label}`}
            </Typography>
            <Typography color="text.secondary" aria-live="polite">
              Coloca esta área sobre el botón, texto o elemento de tu diseño que quieres hacer interactivo.
            </Typography>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Ajustar posición</Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button disabled={interactionDisabled} variant="outlined" onClick={() => adjust('y', -adjustmentStep)}>
                Mover arriba
              </Button>
              <Button disabled={interactionDisabled} variant="outlined" onClick={() => adjust('y', adjustmentStep)}>
                Mover abajo
              </Button>
              <Button disabled={interactionDisabled} variant="outlined" onClick={() => adjust('x', -adjustmentStep)}>
                Mover a la izquierda
              </Button>
              <Button disabled={interactionDisabled} variant="outlined" onClick={() => adjust('x', adjustmentStep)}>
                Mover a la derecha
              </Button>
            </Stack>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Ajustar tamaño</Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button disabled={interactionDisabled} variant="outlined" onClick={() => adjust('width', adjustmentStep)}>
                Hacer más ancho
              </Button>
              <Button
                disabled={interactionDisabled}
                variant="outlined"
                onClick={() => adjust('width', -adjustmentStep)}
              >
                Hacer más angosto
              </Button>
              <Button
                disabled={interactionDisabled}
                variant="outlined"
                onClick={() => adjust('height', adjustmentStep)}
              >
                Hacer más alto
              </Button>
              <Button
                disabled={interactionDisabled}
                variant="outlined"
                onClick={() => adjust('height', -adjustmentStep)}
              >
                Hacer más bajo
              </Button>
            </Stack>
          </Stack>

          {draft.action === 'EXTERNAL_LINK' ? (
            <TextField
              type="url"
              disabled={interactionDisabled}
              label="Enlace"
              value={draft.url}
              error={urlTouched && !externalUrlValid}
              helperText={
                urlTouched && !externalUrlValid
                  ? 'Ingresa un enlace web válido.'
                  : 'Pega el enlace que quieres abrir desde la invitación.'
              }
              onBlur={() => setUrlTouched(true)}
              onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
            />
          ) : null}

          <FormHelperText>
            También puedes arrastrar el área o usar el control de su esquina para cambiar el tamaño.
          </FormHelperText>

          {mutationMessage ? (
            <Alert severity="error" aria-live="assertive">
              {mutationMessage}
            </Alert>
          ) : null}

          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button variant="contained" disabled={interactionDisabled || !externalUrlValid} onClick={() => void save()}>
              {mutation === 'saving' ? 'Guardando…' : mode === 'creating' ? 'Guardar acción' : 'Guardar cambios'}
            </Button>
            {selected ? (
              <Button color="error" disabled={interactionDisabled} onClick={() => void remove()}>
                {mutation === 'deleting' ? 'Eliminando…' : 'Eliminar acción'}
              </Button>
            ) : null}
            <Button disabled={interactionDisabled} onClick={cancel}>
              Cancelar
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Box>
  );
}

function normalizeEditorRect(value: Pick<Draft, 'x' | 'y' | 'width' | 'height'>) {
  const width = Math.min(1, Math.max(minimumSize, value.width));
  const height = Math.min(1, Math.max(minimumSize, value.height));
  return {
    x: Math.min(1 - width, Math.max(0, value.x)),
    y: Math.min(1 - height, Math.max(0, value.y)),
    width,
    height
  };
}

function areaStyles(rect: Pick<Draft, 'x' | 'y' | 'width' | 'height'>, selected: boolean) {
  return {
    position: 'absolute',
    ...relativeRectStyles(rect),
    minWidth: 44,
    minHeight: 44,
    p: 0,
    border: selected ? '3px solid' : '2px solid',
    borderColor: selected ? 'secondary.main' : 'primary.main',
    bgcolor: selected ? 'rgba(255,255,255,.52)' : 'rgba(255,255,255,.34)',
    color: 'text.primary',
    cursor: 'pointer',
    '&:focus-visible': {
      outline: '3px solid',
      outlineColor: 'warning.main',
      outlineOffset: 2
    },
    '&:disabled': { cursor: 'default', opacity: 0.8 }
  } as const;
}

function AreaName({ children }: { children: string }) {
  return (
    <Box
      component="span"
      sx={{
        position: 'absolute',
        left: 4,
        top: 4,
        maxWidth: 'calc(100% - 8px)',
        px: 0.75,
        py: 0.25,
        bgcolor: 'background.paper',
        borderRadius: 0.5,
        boxShadow: 1,
        fontSize: '0.72rem',
        fontWeight: 700,
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </Box>
  );
}
