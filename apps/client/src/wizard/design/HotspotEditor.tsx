import type { ApiClient, Hotspot } from '@invitaciones/api-client';
import { Box, Button, FormHelperText, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { normalizeRect } from '../wizard-utils';

type Draft = Pick<Hotspot, 'x' | 'y' | 'width' | 'height' | 'action' | 'priority'> & { url: string };
type EditorMode = 'idle' | 'choosing' | 'creating' | 'editing';
type Action = Hotspot['action'];

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

export function HotspotEditor({
  apiClient,
  eventId,
  ownerType,
  pageId,
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
  const [mode, setMode] = useState<EditorMode>('idle');
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(() => newDraft('RSVP'));
  const [urlTouched, setUrlTouched] = useState(false);
  const selected = visible.find((item) => item.id === selectedId);
  const editing = mode === 'creating' || mode === 'editing';
  const externalUrlValid = draft.action !== 'EXTERNAL_LINK' || /^https:\/\/[^\s]+$/i.test(draft.url);

  useEffect(() => {
    setMode('idle');
    setSelectedId(undefined);
    setDraft(newDraft('RSVP'));
    setUrlTouched(false);
  }, [ownerType, pageId]);

  const cancel = () => {
    setMode('idle');
    setSelectedId(undefined);
    setDraft(newDraft('RSVP'));
    setUrlTouched(false);
  };

  const selectExisting = (item: Hotspot) => {
    if (disabled) return;
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
    setMode('editing');
  };

  const startCreating = (action: Action) => {
    setSelectedId(undefined);
    setDraft(newDraft(action));
    setUrlTouched(false);
    setMode('creating');
  };

  const save = async () => {
    if (!externalUrlValid) {
      setUrlTouched(true);
      return;
    }
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
    cancel();
    await onChanged();
  };

  const remove = async () => {
    if (!selected) return;
    await apiClient.design.removeHotspot(eventId, selected.id);
    cancel();
    await onChanged();
  };

  const adjust = (property: 'x' | 'y' | 'width' | 'height', amount: number, oppositePosition?: 'x' | 'y') => {
    setDraft((current) => {
      const next = { ...current, [property]: current[property] + amount };
      if (oppositePosition) next[oppositePosition] = current[oppositePosition] - amount;
      return { ...current, ...normalizeEditorRect(next) };
    });
  };

  const startPointer = (event: React.PointerEvent<HTMLElement>, interaction: 'move' | 'resize') => {
    if (disabled || !editing) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...draft };
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    const onMove = (next: PointerEvent) => {
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
    <Stack spacing={2.5} component="section" aria-labelledby="invitation-actions-title">
      <Stack spacing={0.5}>
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

      <Box
        ref={canvasRef}
        aria-label="Vista previa interactiva de la invitación"
        sx={{
          position: 'relative',
          aspectRatio: '4/3',
          width: '100%',
          maxWidth: 720,
          bgcolor: 'grey.100',
          overflow: 'hidden',
          backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          border: 1,
          borderColor: 'divider'
        }}
      >
        {visible.map((item) => {
          if (editing && item.id === selectedId) return null;
          const details = actionDetails(item.action);
          return (
            <Box
              component="button"
              type="button"
              key={item.id}
              aria-label={`Editar acción ${details.label}`}
              disabled={disabled}
              onClick={() => selectExisting(item)}
              sx={areaStyles(item, false)}
            >
              <AreaName>{details.areaLabel}</AreaName>
            </Box>
          );
        })}

        {editing ? (
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
              cursor: disabled ? 'default' : 'move',
              touchAction: 'none'
            }}
          >
            <AreaName>{currentAction.areaLabel}</AreaName>
            <Box
              component="button"
              type="button"
              disabled={disabled}
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
                cursor: disabled ? 'default' : 'nwse-resize',
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

      <Stack spacing={1} component="section" aria-labelledby="configured-actions-title">
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

      {mode === 'idle' && !disabled ? (
        <Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => setMode('choosing')}>
          Agregar acción
        </Button>
      ) : null}

      {mode === 'choosing' ? (
        <Stack spacing={1.5} component="section" aria-labelledby="choose-action-title">
          <Typography component="h4" variant="h6" id="choose-action-title">
            ¿Qué quieres que puedan hacer tus invitados?
          </Typography>
          <Stack spacing={1}>
            {actions.map((action) => (
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
        <Stack spacing={2} component="section" aria-labelledby="edit-action-title">
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
              <Button variant="outlined" onClick={() => adjust('y', -adjustmentStep)}>
                Mover arriba
              </Button>
              <Button variant="outlined" onClick={() => adjust('y', adjustmentStep)}>
                Mover abajo
              </Button>
              <Button variant="outlined" onClick={() => adjust('x', -adjustmentStep)}>
                Mover a la izquierda
              </Button>
              <Button variant="outlined" onClick={() => adjust('x', adjustmentStep)}>
                Mover a la derecha
              </Button>
            </Stack>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Ajustar tamaño</Typography>
            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button variant="outlined" onClick={() => adjust('width', adjustmentStep)}>
                Hacer más ancho
              </Button>
              <Button variant="outlined" onClick={() => adjust('width', -adjustmentStep)}>
                Hacer más angosto
              </Button>
              <Button variant="outlined" onClick={() => adjust('height', adjustmentStep)}>
                Hacer más alto
              </Button>
              <Button variant="outlined" onClick={() => adjust('height', -adjustmentStep)}>
                Hacer más bajo
              </Button>
            </Stack>
          </Stack>

          {draft.action === 'EXTERNAL_LINK' ? (
            <TextField
              type="url"
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

          <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button variant="contained" disabled={disabled || !externalUrlValid} onClick={() => void save()}>
              {mode === 'creating' ? 'Guardar acción' : 'Guardar cambios'}
            </Button>
            {selected ? (
              <Button color="error" disabled={disabled} onClick={() => void remove()}>
                Eliminar acción
              </Button>
            ) : null}
            <Button onClick={cancel}>Cancelar</Button>
          </Stack>
        </Stack>
      ) : null}
    </Stack>
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
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
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
