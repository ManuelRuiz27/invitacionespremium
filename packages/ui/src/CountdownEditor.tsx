import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { CountdownVisual } from './CountdownVisual';
import {
  countdownContrast,
  countdownFonts,
  countdownPalettes,
  countdownParts,
  normalizeHexColor,
  projectCountdownPreview,
  rectanglesOverlap,
  type CountdownPlacement,
  type CountdownStyle
} from './countdown-style';
import { normalizeVisualRect, roundVisualRect, startRelativeRectPointer } from './relative-rect-pointer';
import { relativeRectStyles, type RelativeVisualRect } from './visual-geometry';

export interface CountdownEditorImage {
  id: string;
  label: string;
  url?: string;
  guides?: ReadonlyArray<RelativeVisualRect>;
}

export interface CountdownEditorProps<T extends CountdownStyle & CountdownPlacement> {
  value: T | null;
  initialValue: T;
  images: ReadonlyArray<CountdownEditorImage>;
  seconds: number | null;
  eventLabel?: string;
  disabled?: boolean;
  onSave: (draft: T) => Promise<void>;
  onRemove: (value: T) => Promise<void>;
}

const colors = [
  ['numberColor', 'Números'],
  ['labelColor', 'Etiquetas'],
  ['backgroundColor', 'Fondo'],
  ['borderColor', 'Borde'],
  ['shadowColor', 'Sombra']
] as const;
type ColorField = (typeof colors)[number][0];
const fontLabels = { montserrat: 'Montserrat', playfair: 'Playfair Display', system: 'Sistema' } as const;
const colorValues = (value: Pick<CountdownStyle, ColorField>): Record<ColorField, string> =>
  Object.fromEntries(colors.map(([key]) => [key, value[key]])) as Record<ColorField, string>;

export function CountdownEditor<T extends CountdownStyle & CountdownPlacement>({
  value,
  initialValue,
  images,
  seconds,
  eventLabel,
  disabled = false,
  onSave,
  onRemove
}: CountdownEditorProps<T>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(value ?? initialValue);
  const [hex, setHex] = useState(() => colorValues(value ?? initialValue));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<'edit' | 'desktop' | 'mobile'>('edit');
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerCleanupRef = useRef<() => void>(() => undefined);
  const mutationRef = useRef(false);
  const spaceRef = useRef(false);
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    kind: 'pan' | 'pinch';
    x: number;
    y: number;
    distance: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);
  const shown = editing ? draft : value;
  const image = images.find((item) => item.id === (shown?.flipbookPageId ?? 'flyer')) ?? images[0];
  const current = shown ?? initialValue;
  const imageRatio = image ? imageRatios[image.id] : undefined;
  const editable = editing && preview === 'edit' && !disabled && !busy;
  const invalidColors = colors.some(([key]) => !normalizeHexColor(hex[key]));
  const overlap = Boolean(image?.guides?.some((guide) => rectanglesOverlap(current, guide)));
  const contrastWarning =
    countdownContrast(current.numberColor, current.backgroundColor) < 4.5 ||
    countdownContrast(current.labelColor, current.backgroundColor) < 4.5;
  const mobileProjection = projectCountdownPreview(
    imageRatio ?? 1,
    320,
    current.visualOwnerType === 'FLIPBOOK_PAGE' ? 480 / 680 : undefined
  );
  const mobileWidth = mobileProjection.imageWidth * current.width;
  const mobileHeight = mobileProjection.imageHeight * current.height;
  const grid = current.layout === 'grid' || mobileWidth < 220;
  const digitCount = Math.max(2, ...countdownParts(seconds).map((part) => part.value.length));
  const minimumWidth = (grid ? 2 : 4) * Math.max(34, digitCount * 14.4) + 24;
  // Reserve room for the final message before the event starts as well.
  const minimumHeight = (grid ? 2 : 1) * 42 + 16 + 17;
  const tooSmall = imageRatio !== undefined && (mobileWidth < minimumWidth || mobileHeight < minimumHeight);
  const locked = disabled || busy;

  useEffect(() => () => pointerCleanupRef.current(), []);
  useEffect(() => {
    if (disabled) {
      pointerCleanupRef.current();
      setEditing(false);
    }
  }, [disabled]);

  const begin = () => {
    const next = value ?? initialValue;
    setDraft(next);
    setHex(colorValues(next));
    setMessage(undefined);
    setEditing(true);
    setPreview('edit');
  };
  const patch = (next: Partial<CountdownStyle & CountdownPlacement>) => setDraft((before) => ({ ...before, ...next }));
  const save = async () => {
    if (mutationRef.current || locked || invalidColors || tooSmall || !image?.url || imageRatio === undefined) return;
    mutationRef.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      const normalized = Object.fromEntries(colors.map(([key]) => [key, normalizeHexColor(hex[key])!]));
      await onSave({ ...draft, ...roundVisualRect(draft), ...normalized });
      setEditing(false);
      setMessage('Cuenta regresiva guardada.');
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : 'No pudimos guardar. Conservamos tus cambios para reintentar.'
      );
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!value || mutationRef.current || locked) return;
    mutationRef.current = true;
    setBusy(true);
    try {
      await onRemove(value);
      setConfirmDelete(false);
      setEditing(false);
      setMessage('Cuenta regresiva eliminada.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'No pudimos eliminar. Inténtalo nuevamente.');
      setConfirmDelete(false);
    } finally {
      mutationRef.current = false;
      setBusy(false);
    }
  };
  const startPointer = (event: ReactPointerEvent<HTMLElement>, interaction: 'move' | 'resize') => {
    if (!editable || !canvasRef.current || touchesRef.current.size >= 2) return;
    event.stopPropagation();
    pointerCleanupRef.current();
    pointerCleanupRef.current = startRelativeRectPointer({
      event,
      interaction,
      rect: draft,
      bounds: canvasRef.current.getBoundingClientRect(),
      onChange: (rect) => patch(rect),
      shouldIgnore: () => touchesRef.current.size >= 2
    });
  };
  const changeZoom = (zoom: number) => setViewport({ zoom: Math.max(1, Math.min(4, zoom)), x: 0, y: 0 });
  const viewportDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (preview !== 'edit') return;
    if (event.pointerType === 'touch') {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        pointerCleanupRef.current();
        const [a, b] = [...touchesRef.current.values()];
        if (!a || !b) return;
        gestureRef.current = {
          kind: 'pinch',
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          zoom: viewport.zoom,
          panX: viewport.x,
          panY: viewport.y
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    } else if (spaceRef.current) {
      event.preventDefault();
      gestureRef.current = {
        kind: 'pan',
        x: event.clientX,
        y: event.clientY,
        distance: 0,
        zoom: viewport.zoom,
        panX: viewport.x,
        panY: viewport.y
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  };
  const viewportMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (touchesRef.current.has(event.pointerId))
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    if (gesture.kind === 'pan') {
      setViewport({
        zoom: gesture.zoom,
        x: gesture.panX + event.clientX - gesture.x,
        y: gesture.panY + event.clientY - gesture.y
      });
      return;
    }
    const [a, b] = [...touchesRef.current.values()];
    if (!a || !b) return;
    const zoom = Math.max(
      1,
      Math.min(4, (gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, gesture.distance))
    );
    setViewport({ zoom, x: gesture.panX + (a.x + b.x) / 2 - gesture.x, y: gesture.panY + (a.y + b.y) / 2 - gesture.y });
  };
  const finishViewport = (event: ReactPointerEvent<HTMLDivElement>) => {
    touchesRef.current.delete(event.pointerId);
    if (touchesRef.current.size < 2) gestureRef.current = null;
  };

  return (
    <Box
      component="section"
      aria-label="Cuenta regresiva"
      sx={{
        pt: 2,
        borderTop: '1px solid',
        borderColor: 'divider',
        '& .MuiButton-root, & .MuiToggleButton-root': { minHeight: 44 }
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.5 }}
      >
        <Box>
          <Typography component="h3" variant="h4">
            Cuenta regresiva
          </Typography>
          {eventLabel ? (
            <Typography variant="body2" color="text.secondary">
              {eventLabel}
            </Typography>
          ) : null}
        </Box>
        {!editing ? (
          <Button variant="outlined" disabled={locked || !images.length} onClick={begin}>
            {value ? 'Editar cuenta regresiva' : 'Agregar cuenta regresiva'}
          </Button>
        ) : null}
      </Stack>
      {message ? (
        <Alert
          severity={message.endsWith('guardada.') || message.endsWith('eliminada.') ? 'success' : 'error'}
          sx={{ mb: 1.5 }}
          aria-live="polite"
        >
          {message}
        </Alert>
      ) : null}
      {editing || value ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: editing ? { xs: 'minmax(0,1fr)', lg: 'minmax(0,1fr) 280px' } : 'minmax(0,1fr)',
            gap: 2,
            alignItems: 'start'
          }}
        >
          <Stack spacing={1} sx={{ minWidth: 0 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={preview}
              onChange={(_, next: 'edit' | 'desktop' | 'mobile' | null) => next && setPreview(next)}
              aria-label="Vista de cuenta regresiva"
              sx={{ alignSelf: 'flex-start' }}
            >
              <ToggleButton value="edit">Editar</ToggleButton>
              <ToggleButton value="desktop">Desktop</ToggleButton>
              <ToggleButton value="mobile">Móvil · 320 px</ToggleButton>
            </ToggleButtonGroup>
            <Box
              ref={viewportRef}
              tabIndex={0}
              aria-label="Lienzo de cuenta regresiva"
              onPointerDownCapture={viewportDown}
              onPointerMove={viewportMove}
              onPointerUp={finishViewport}
              onPointerCancel={finishViewport}
              onKeyDown={(event) => {
                if (event.code === 'Space' && event.target === event.currentTarget) {
                  event.preventDefault();
                  spaceRef.current = true;
                }
                if (!editable || event.target !== event.currentTarget) return;
                const adjustments = {
                  ArrowLeft: { x: draft.x - 0.01 },
                  ArrowRight: { x: draft.x + 0.01 },
                  ArrowUp: { y: draft.y - 0.01 },
                  ArrowDown: { y: draft.y + 0.01 }
                };
                const adjustment = adjustments[event.key as keyof typeof adjustments];
                if (adjustment) {
                  event.preventDefault();
                  patch(normalizeVisualRect({ ...draft, ...adjustment }));
                }
              }}
              onKeyUp={(event) => {
                if (event.code === 'Space') spaceRef.current = false;
              }}
              onBlur={() => {
                spaceRef.current = false;
              }}
              sx={{
                overflow: preview === 'edit' ? 'hidden' : 'auto',
                width: '100%',
                minWidth: 0,
                maxHeight: '80svh',
                outlineOffset: 3,
                backgroundColor: 'action.hover',
                touchAction: preview === 'edit' ? 'pan-y' : 'auto'
              }}
            >
              <Box
                sx={{
                  width: preview === 'mobile' ? 320 : '100%',
                  maxWidth: preview === 'mobile' ? undefined : '100%',
                  mx: 'auto',
                  px: preview === 'mobile' ? '16px' : 0,
                  boxSizing: 'border-box'
                }}
              >
                {preview !== 'edit' ? (
                  <Typography variant="caption" color="text.secondary">
                    {image?.label}
                  </Typography>
                ) : null}
                <Box
                  sx={{
                    position: 'relative',
                    height: preview === 'mobile' ? mobileProjection.surfaceHeight : undefined
                  }}
                >
                  <Box
                    ref={canvasRef}
                    sx={{
                      position: preview === 'mobile' ? 'absolute' : 'relative',
                      left: preview === 'mobile' ? mobileProjection.imageLeft : undefined,
                      top: preview === 'mobile' ? mobileProjection.imageTop : undefined,
                      width: preview === 'mobile' ? mobileProjection.imageWidth : undefined,
                      height: preview === 'mobile' ? mobileProjection.imageHeight : undefined,
                      transformOrigin: '0 0',
                      transform:
                        preview === 'edit'
                          ? `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
                          : undefined
                    }}
                  >
                    {image?.url ? (
                      <Box
                        component="img"
                        src={image.url}
                        alt={image.label}
                        draggable={false}
                        onLoad={(event) => {
                          const { naturalWidth, naturalHeight } = event.currentTarget;
                          if (naturalHeight > 0)
                            setImageRatios((before) => ({ ...before, [image.id]: naturalWidth / naturalHeight }));
                        }}
                        sx={{ display: 'block', width: '100%', height: preview === 'mobile' ? '100%' : 'auto' }}
                      />
                    ) : (
                      <Box sx={{ p: 4 }}>
                        <Typography>Cargando imagen de la invitación…</Typography>
                      </Box>
                    )}
                    {preview === 'edit'
                      ? image?.guides?.map((guide, index) => (
                          <Box
                            key={index}
                            aria-hidden="true"
                            sx={{
                              position: 'absolute',
                              ...relativeRectStyles(guide),
                              border: '1px dashed',
                              borderColor: 'text.secondary',
                              pointerEvents: 'none'
                            }}
                          />
                        ))
                      : null}
                    {shown && image?.url ? (
                      <Box
                        onPointerDown={(event) => {
                          if (!spaceRef.current) startPointer(event, 'move');
                        }}
                        sx={{
                          position: 'absolute',
                          ...relativeRectStyles(shown),
                          outline: editable ? '2px solid' : undefined,
                          outlineColor: 'secondary.main',
                          cursor: editable ? 'move' : undefined,
                          touchAction: editable ? 'none' : 'auto'
                        }}
                        role={editable ? 'group' : undefined}
                        aria-label={editable ? 'Mover cuenta regresiva' : undefined}
                      >
                        <CountdownVisual appearance={current} seconds={seconds} />
                        {editable ? (
                          <Box
                            component="button"
                            type="button"
                            aria-label="Cambiar tamaño de cuenta regresiva"
                            onPointerDown={(event) => startPointer(event, 'resize')}
                            sx={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: 44,
                              height: 44,
                              border: 0,
                              bgcolor: 'transparent',
                              cursor: 'nwse-resize',
                              touchAction: 'none',
                              '&::after': {
                                content: '""',
                                position: 'absolute',
                                right: 4,
                                bottom: 4,
                                width: 12,
                                height: 12,
                                borderRight: '3px solid',
                                borderBottom: '3px solid',
                                borderColor: 'secondary.main'
                              }
                            }}
                          />
                        ) : null}
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              </Box>
            </Box>
            {preview === 'edit' ? (
              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                <Button
                  aria-label="Alejar cuenta regresiva"
                  disabled={viewport.zoom <= 1}
                  onClick={() => changeZoom(viewport.zoom - 0.25)}
                >
                  −
                </Button>
                <Button aria-label="Ajustar lienzo de cuenta regresiva" onClick={() => changeZoom(1)}>
                  {Math.round(viewport.zoom * 100)}%
                </Button>
                <Button
                  aria-label="Acercar cuenta regresiva"
                  disabled={viewport.zoom >= 4}
                  onClick={() => changeZoom(viewport.zoom + 0.25)}
                >
                  +
                </Button>
              </Stack>
            ) : null}
          </Stack>
          {editing ? (
            <Stack spacing={1.5} sx={{ minWidth: 0 }}>
              {images.length > 1 ? (
                <TextField
                  select
                  label="Ubicación"
                  value={image?.id ?? ''}
                  disabled={locked}
                  onChange={(event) => {
                    patch({ flipbookPageId: event.target.value });
                    setViewport({ zoom: 1, x: 0, y: 0 });
                  }}
                >
                  {images.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              <TextField
                select
                label="Distribución"
                value={draft.layout}
                disabled={locked}
                onChange={(event) => patch({ layout: event.target.value as CountdownStyle['layout'] })}
              >
                <MenuItem value="row">Cuatro columnas</MenuItem>
                <MenuItem value="grid">Cuadrícula 2 × 2</MenuItem>
              </TextField>
              {(['numberFont', 'labelFont'] as const).map((key) => (
                <TextField
                  key={key}
                  select
                  label={key === 'numberFont' ? 'Tipografía de números' : 'Tipografía de etiquetas'}
                  value={draft[key]}
                  disabled={locked}
                  onChange={(event) => patch({ [key]: event.target.value })}
                >
                  {Object.entries(fontLabels).map(([font, label]) => (
                    <MenuItem
                      key={font}
                      value={font}
                      sx={{ fontFamily: countdownFonts[font as keyof typeof countdownFonts] }}
                    >
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              ))}
              <Stack direction="row" spacing={1}>
                {(['numberWeight', 'labelWeight'] as const).map((key) => (
                  <TextField
                    key={key}
                    select
                    fullWidth
                    label={key === 'numberWeight' ? 'Peso de números' : 'Peso de etiquetas'}
                    value={draft[key]}
                    disabled={locked}
                    onChange={(event) => patch({ [key]: Number(event.target.value) })}
                  >
                    {[400, 500, 600, 700].map((weight) => (
                      <MenuItem key={weight} value={weight}>
                        {weight}
                      </MenuItem>
                    ))}
                  </TextField>
                ))}
              </Stack>
              <TextField
                select
                label="Paleta"
                value={
                  countdownPalettes.find(
                    (palette) =>
                      colors.every(([key]) => palette[key] === draft[key]) &&
                      palette.backgroundOpacity === draft.backgroundOpacity
                  )?.name ?? 'Personalizada'
                }
                disabled={locked}
                onChange={(event) => {
                  const palette = countdownPalettes.find((item) => item.name === event.target.value);
                  if (palette) {
                    const { name: _name, ...appearance } = palette;
                    patch(appearance);
                    setHex(colorValues(appearance));
                  }
                }}
              >
                <MenuItem value="Personalizada" disabled>
                  Personalizada
                </MenuItem>
                {countdownPalettes.map((palette) => (
                  <MenuItem key={palette.name} value={palette.name}>
                    {palette.name}
                  </MenuItem>
                ))}
              </TextField>
              {colors.map(([key, label]) => (
                <Stack key={key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box
                    component="input"
                    type="color"
                    aria-label={`Selector de color de ${label.toLowerCase()}`}
                    value={draft[key]}
                    disabled={locked}
                    onChange={(event) => {
                      patch({ [key]: event.target.value.toUpperCase() });
                      setHex((before) => ({ ...before, [key]: event.target.value.toUpperCase() }));
                    }}
                    sx={{
                      width: 44,
                      height: 44,
                      padding: 0.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      flexShrink: 0
                    }}
                  />
                  <TextField
                    fullWidth
                    label={`Color de ${label.toLowerCase()}`}
                    value={hex[key]}
                    disabled={locked}
                    error={!normalizeHexColor(hex[key])}
                    helperText={!normalizeHexColor(hex[key]) ? 'Usa #RGB o #RRGGBB.' : undefined}
                    onChange={(event) => {
                      const next = event.target.value;
                      setHex((before) => ({ ...before, [key]: next }));
                      const normalized = normalizeHexColor(next);
                      if (normalized) patch({ [key]: normalized });
                    }}
                    onBlur={() => {
                      const normalized = normalizeHexColor(hex[key]);
                      if (normalized) setHex((before) => ({ ...before, [key]: normalized }));
                    }}
                  />
                </Stack>
              ))}
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography variant="body2" id="countdown-opacity-label" sx={{ flex: 1 }}>
                    Opacidad del fondo
                  </Typography>
                  <TextField
                    type="number"
                    label="Opacidad (%)"
                    value={Math.round(draft.backgroundOpacity * 100)}
                    disabled={locked}
                    size="small"
                    slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                    sx={{ width: 100 }}
                    onChange={(event) => {
                      const amount = Number(event.target.value);
                      if (Number.isFinite(amount))
                        patch({ backgroundOpacity: Math.max(0, Math.min(100, amount)) / 100 });
                    }}
                  />
                </Stack>
                <Slider
                  aria-labelledby="countdown-opacity-label"
                  value={Math.round(draft.backgroundOpacity * 100)}
                  disabled={locked}
                  min={0}
                  max={100}
                  onChange={(_, next) => patch({ backgroundOpacity: Number(next) / 100 })}
                  valueLabelDisplay="auto"
                />
              </Box>
              <Stack direction="row" spacing={1}>
                <TextField
                  fullWidth
                  select
                  label="Marco"
                  value={draft.frame}
                  disabled={locked}
                  onChange={(event) => patch({ frame: event.target.value as CountdownStyle['frame'] })}
                >
                  {[
                    ['none', 'Sin marco'],
                    ['thin', 'Fino'],
                    ['double', 'Doble'],
                    ['rounded', 'Redondeado']
                  ].map(([id, label]) => (
                    <MenuItem key={id} value={id}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  select
                  label="Sombra"
                  value={draft.shadow}
                  disabled={locked}
                  onChange={(event) => patch({ shadow: event.target.value as CountdownStyle['shadow'] })}
                >
                  {[
                    ['none', 'Ninguna'],
                    ['soft', 'Suave'],
                    ['strong', 'Marcada']
                  ].map(([id, label]) => (
                    <MenuItem key={id} value={id}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Box component="details">
                <Box component="summary" sx={{ py: 1 }}>
                  Ajuste preciso
                </Box>
                <Stack spacing={1} sx={{ pt: 1 }}>
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <TextField
                      key={key}
                      type="number"
                      label={
                        {
                          x: 'Posición horizontal (%)',
                          y: 'Posición vertical (%)',
                          width: 'Ancho (%)',
                          height: 'Alto (%)'
                        }[key]
                      }
                      value={Math.round(draft[key] * 10000) / 100}
                      disabled={locked}
                      slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next)) patch(normalizeVisualRect({ ...draft, [key]: next / 100 }));
                      }}
                    />
                  ))}
                </Stack>
              </Box>
              {seconds === null ? (
                <Alert severity="info">Define el inicio del evento para ver la cuenta regresiva.</Alert>
              ) : null}
              {tooSmall ? (
                <Alert severity="warning">
                  Amplía la caja para que números y etiquetas sean legibles en móvil. También puedes cambiar la
                  distribución.
                </Alert>
              ) : null}
              {overlap ? (
                <Alert severity="warning">
                  La cuenta regresiva coincide con una zona interactiva. Revisa su posición para conservar visible la
                  acción.
                </Alert>
              ) : null}
              {contrastWarning || draft.backgroundOpacity < 1 ? (
                <Alert severity="warning">
                  Revisa el contraste sobre la imagen real. Un fondo transparente puede dificultar la lectura; puedes
                  aumentar su opacidad o elegir otra paleta.
                </Alert>
              ) : null}
              <Typography variant="caption" color="text.secondary">
                Arrastra para mover. Usa la esquina para cambiar el tamaño, las flechas para ajustar y dos dedos para
                ampliar el lienzo.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  disabled={locked || invalidColors || tooSmall || !image?.url || imageRatio === undefined}
                  onClick={() => void save()}
                >
                  {busy ? 'Guardando…' : 'Guardar cambios'}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setMessage(undefined);
                  }}
                >
                  Cancelar
                </Button>
                {value ? (
                  <Button color="error" disabled={locked} onClick={() => setConfirmDelete(true)}>
                    Eliminar
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          ) : null}
        </Box>
      ) : null}
      <Dialog
        open={confirmDelete}
        onClose={() => {
          if (!busy) setConfirmDelete(false);
        }}
      >
        <DialogTitle>¿Eliminar la cuenta regresiva?</DialogTitle>
        <DialogContent>Los demás elementos de la invitación se conservarán.</DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmDelete(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} color="error" onClick={() => void remove()}>
            Eliminar cuenta regresiva
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
