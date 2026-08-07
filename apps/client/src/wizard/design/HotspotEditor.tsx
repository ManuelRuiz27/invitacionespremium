import type { ApiClient, Hotspot } from '@invitaciones/api-client';
import { Box, Button, FormHelperText, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { normalizeRect } from '../wizard-utils';

type Draft = Pick<Hotspot, 'x' | 'y' | 'width' | 'height' | 'action' | 'priority'> & { url: string };
const initial: Draft = { x: 0.1, y: 0.1, width: 0.25, height: 0.12, action: 'RSVP', priority: 0, url: '' };

export function HotspotEditor({
  apiClient,
  eventId,
  ownerType,
  pageId,
  hotspots,
  disabled,
  previewUrl,
  onChanged
}: {
  apiClient: ApiClient;
  eventId: string;
  ownerType: 'FLYER' | 'FLIPBOOK_PAGE';
  pageId?: string | undefined;
  hotspots: Hotspot[];
  disabled: boolean;
  previewUrl?: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const visible = hotspots.filter((item) =>
    ownerType === 'FLYER' ? item.visualOwnerType === 'FLYER' : item.flipbookPageId === pageId
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Draft>(initial);
  const selected = visible.find((item) => item.id === selectedId);
  const externalUrlValid = draft.action !== 'EXTERNAL_LINK' || /^https:\/\//i.test(draft.url);
  useEffect(() => {
    if (selected)
      setDraft({
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        action: selected.action,
        priority: selected.priority,
        url: selected.url ?? ''
      });
  }, [selected]);
  const save = async () => {
    const rect = normalizeRect(draft);
    const url = draft.action === 'EXTERNAL_LINK' ? draft.url : undefined;
    if (!externalUrlValid) return;
    if (selected)
      await apiClient.design.updateHotspot(eventId, selected.id, {
        ...rect,
        action: draft.action,
        priority: draft.priority,
        ...(url ? { url } : {})
      });
    else
      await apiClient.design.createHotspot(eventId, {
        ...rect,
        action: draft.action,
        priority: draft.priority,
        visualOwnerType: ownerType,
        ...(pageId ? { flipbookPageId: pageId } : {}),
        ...(url ? { url } : {})
      });
    setSelectedId(undefined);
    setDraft(initial);
    await onChanged();
  };
  const move = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    if (disabled) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX,
      startY = event.clientY,
      start = { ...draft };
    const bounds = target.parentElement!.getBoundingClientRect();
    const onMove = (next: PointerEvent) =>
      setDraft({
        ...draft,
        ...normalizeRect({
          ...start,
          ...(mode === 'move'
            ? {
                x: start.x + (next.clientX - startX) / bounds.width,
                y: start.y + (next.clientY - startY) / bounds.height
              }
            : {
                width: start.width + (next.clientX - startX) / bounds.width,
                height: start.height + (next.clientY - startY) / bounds.height
              })
        })
      });
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };
  return (
    <Stack spacing={2}>
      <Typography component="h3" variant="h4">
        Hotspots
      </Typography>
      <Box
        aria-label="Canvas de Hotspots"
        sx={{
          position: 'relative',
          aspectRatio: '4/3',
          maxWidth: 720,
          bgcolor: 'grey.100',
          overflow: 'hidden',
          backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center'
        }}
      >
        {visible.map((item) => (
          <Box
            component="button"
            type="button"
            key={item.id}
            aria-label={`Seleccionar hotspot ${item.action}`}
            onClick={() => setSelectedId(item.id)}
            sx={{
              position: 'absolute',
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              height: `${item.height * 100}%`,
              border: selectedId === item.id ? '3px solid' : '2px solid',
              borderColor: 'primary.main',
              bgcolor: 'rgba(255,255,255,.35)'
            }}
          />
        ))}
        <Box
          role="button"
          tabIndex={0}
          aria-label="Mover hotspot en edición"
          onPointerDown={(e) => move(e, 'move')}
          sx={{
            position: 'absolute',
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.width * 100}%`,
            height: `${draft.height * 100}%`,
            border: '2px dashed',
            borderColor: 'secondary.main',
            cursor: 'move'
          }}
        >
          <Box
            aria-label="Redimensionar hotspot"
            onPointerDown={(e) => {
              e.stopPropagation();
              move(e, 'resize');
            }}
            sx={{
              position: 'absolute',
              right: -7,
              bottom: -7,
              width: 16,
              height: 16,
              bgcolor: 'secondary.main',
              cursor: 'nwse-resize'
            }}
          />
        </Box>
      </Box>
      <FormHelperText>Arrastra en el canvas o usa los campos numéricos accesibles.</FormHelperText>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <TextField
            key={field}
            type="number"
            label={field}
            value={draft[field]}
            slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01 } }}
            onChange={(e) => setDraft({ ...draft, [field]: Number(e.target.value) })}
          />
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          select
          label="Acción"
          value={draft.action}
          onChange={(e) => setDraft({ ...draft, action: e.target.value as Draft['action'] })}
        >
          {[
            ['RSVP', 'Confirmación de asistencia'],
            ['LOCATION', 'Ubicación'],
            ['GIFT_REGISTRY', 'Mesa de regalos'],
            ['QR_AREA', 'Área QR'],
            ['EXTERNAL_LINK', 'Enlace adicional']
          ].map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          type="number"
          label="Prioridad"
          value={draft.priority}
          onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
        />
        {draft.action === 'EXTERNAL_LINK' ? (
          <TextField
            type="url"
            label="Enlace adicional"
            value={draft.url}
            error={!externalUrlValid}
            helperText={!externalUrlValid ? 'Pega un enlace web seguro completo.' : undefined}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={disabled || !externalUrlValid} onClick={() => void save()}>
          Guardar Hotspot
        </Button>
        {selected ? (
          <Button
            color="error"
            disabled={disabled}
            onClick={() => void apiClient.design.removeHotspot(eventId, selected.id).then(onChanged)}
          >
            Eliminar Hotspot
          </Button>
        ) : null}
        <Button
          onClick={() => {
            setSelectedId(undefined);
            setDraft(initial);
          }}
        >
          Nuevo
        </Button>
      </Stack>
    </Stack>
  );
}
