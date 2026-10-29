import {
  ApiError,
  type AdminEvent,
  type AdminFloorplan,
  type AdminFloorplanShape,
  type AdminFloorplanShapeInput,
  type AdminFloorplanSvgSource,
  type ApiClient
} from '@invitaciones/api-client';
import {
  FloorplanInventory,
  FloorplanShapeValidationError,
  FloorplanStickerCatalog,
  FloorplanSurface,
  FloorplanTray,
  autoPlacePoint,
  clampSeatGroupDelta,
  createPendingTables,
  createStickerDraft,
  createUniqueFloorplanName,
  matchesAuthoritativeShape,
  normalizeFloorplanShape,
  placePendingTable,
  placeStickerDraft,
  shapeToStageRect,
  type FloorplanStickerPresetId,
  type InventoryConfiguration,
  type PendingTable
} from '@invitaciones/floorplan';
import TableRestaurantRounded from '@mui/icons-material/TableRestaurantRounded';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { adminErrorMessage } from '../../../shared/admin-error';
import { AdminErrorState, AdminLoadingState } from '../../../shared/AdminStates';
import { AdminFloorplanPreparationHeader } from './AdminFloorplanPreparationHeader';
import { AdminFloorplanSeatControls, AdminFloorplanSeatRenameDialog } from './AdminFloorplanSeatControls';
import { AdminFloorplanShapeInspector } from './AdminFloorplanShapeInspector';
import {
  AdminFloorplanSourceEmptyState,
  AdminFloorplanSourceReplacementDialog,
  AdminFloorplanUploadButton
} from './AdminFloorplanSourceControls';
import { AdminFloorplanSvgMappingInspector } from './AdminFloorplanSvgMappingInspector';
import { AdminFloorplanTraceEntry, type FloorplanConstructionTool } from './AdminFloorplanTraceEntry';

type EditorMode = 'idle' | 'mapping-source' | 'placing-preset' | 'placing-seat' | 'creating-draft' | 'editing-existing';
type Mutation = 'uploading' | 'saving' | 'duplicating' | 'deleting' | 'locking' | 'unlocking' | 'placing' | 'seating';
const emptyDraft = (): AdminFloorplanShapeInput => ({
  name: '',
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.18,
  height: 0.18,
  rotation: 0,
  polygonPoints: null
});
const editable = (shape: AdminFloorplanShape): AdminFloorplanShapeInput => ({
  name: shape.name,
  kind: shape.kind,
  geometry: shape.geometry,
  capacity: shape.capacity,
  x: shape.x,
  y: shape.y,
  width: shape.width,
  height: shape.height,
  rotation: shape.rotation,
  polygonPoints: shape.polygonPoints ?? null
});
export function AdminFloorplanBuilderWorkspace({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const mutationLock = useRef(false);
  const refreshLock = useRef(false);
  const [floorplan, setFloorplan] = useState<AdminFloorplan>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(event.floorplanEnabled);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<EditorMode>('idle');
  const [constructionTool, setConstructionTool] = useState<FloorplanConstructionTool>('entry');
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedSeatId, setSelectedSeatId] = useState<string>();
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [svgSource, setSvgSource] = useState<AdminFloorplanSvgSource>();
  const [svgSourceError, setSvgSourceError] = useState(false);
  const [selectedSourceElementId, setSelectedSourceElementId] = useState<string>();
  const [mappingPreset, setMappingPreset] = useState<string>('Mesa');
  const [mappingName, setMappingName] = useState('Mesa');
  const [mappingCapacity, setMappingCapacity] = useState(8);
  const [tableModeConfirmationOpen, setTableModeConfirmationOpen] = useState(false);
  const [renameSeatOpen, setRenameSeatOpen] = useState(false);
  const [renameSeatTarget, setRenameSeatTarget] = useState<{ id: string; label: string }>();
  const [renameSeatLabel, setRenameSeatLabel] = useState('');
  const [sourceReplacementCandidate, setSourceReplacementCandidate] = useState<File>();
  const [draft, setDraft] = useState<AdminFloorplanShapeInput>(emptyDraft);
  const [selectedPresetId, setSelectedPresetId] = useState<FloorplanStickerPresetId>();
  const [mutation, setMutation] = useState<Mutation>();
  const [message, setMessage] = useState<string>();
  const [validationMessage, setValidationMessage] = useState<string>();
  const [reconciliationError, setReconciliationError] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [pendingTables, setPendingTables] = useState<PendingTable[]>([]);
  const [activePendingId, setActivePendingId] = useState<string>();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [compactCatalogOpen, setCompactCatalogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const theme = useTheme();
  const compactLayout = useMediaQuery(theme.breakpoints.down('lg'));
  const { url: imageUrl, failed: imageLoadFailed } = useAdminFloorplanImageUrl(
    apiClient,
    event,
    floorplan?.image.fileAssetId
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const latest = await apiClient.adminEventPreparation.getFloorplan(event.clientId, event.id, signal);
      setFloorplan(latest);
      setNotFound(false);
      setLoadError(false);
      return latest;
    },
    [apiClient, event.clientId, event.id]
  );

  useEffect(() => {
    if (!event.floorplanEnabled) return;
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal)
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setFloorplan(undefined);
          setNotFound(true);
          setLoadError(false);
        } else setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event.floorplanEnabled, load]);

  useEffect(() => {
    if (floorplan?.image.sourceType !== 'SVG') {
      setSvgSource(undefined);
      setSvgSourceError(false);
      setSelectedSourceElementId(undefined);
      return;
    }
    const controller = new AbortController();
    setSvgSource(undefined);
    setSvgSourceError(false);
    void apiClient.adminEventPreparation
      .getFloorplanSvgSource(event.clientId, event.id, controller.signal)
      .then((source) => {
        if (controller.signal.aborted) return;
        setSvgSource(source);
        setSvgSourceError(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSvgSource(undefined);
        setSvgSourceError(true);
      });
    return () => controller.abort();
  }, [apiClient, event.clientId, event.id, floorplan?.image.sourceType, floorplan?.image.fileAssetId]);

  const selected = floorplan?.shapes.find((shape) => shape.id === selectedId);
  const selectedSeat = floorplan?.seats.find((seat) => seat.id === selectedSeatId);
  const selectedSeats = floorplan?.seats.filter((seat) => selectedSeatIds.includes(seat.id)) ?? [];
  const pending = Boolean(mutation);
  const editing = mode !== 'idle';
  const accessEventReadOnly =
    event.serviceCode === 'ACCESS_CONTROL' &&
    !['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE', 'ACTIVE', 'EVENT_DAY'].includes(event.status);
  const anonymousAccess = event.serviceCode === 'ACCESS_CONTROL' && event.accessMode === 'ANONYMOUS';
  const readOnly = pending || floorplan?.locked === true || accessEventReadOnly;
  const finalized = floorplan?.locked === true || accessEventReadOnly;
  const dirty =
    mode === 'mapping-source' ||
    mode === 'creating-draft' ||
    (mode === 'editing-existing' && Boolean(selected) && !sameShapeInput(draft, editable(selected!))) ||
    pendingTables.length > 0;
  const showValidationMessage = (text: string) => {
    setMessage(undefined);
    setValidationMessage(text);
  };
  const navigationBlocker = useBlocker(dirty);
  const places =
    floorplan?.shapes.filter((shape) => shape.kind === 'TABLE').reduce((total, shape) => total + shape.capacity, 0) ??
    0;
  const cancel = () => {
    setSelectedSourceElementId(undefined);
    setMode('idle');
    setSelectedId(undefined);
    setSelectedSeatId(undefined);
    setSelectedSeatIds([]);
    setSelectedPresetId(undefined);
    setDraft(emptyDraft());
    setInspectorOpen(false);
  };
  const chooseConstructionTool = (tool: FloorplanConstructionTool) => {
    if (readOnly || dirty || refreshRequired || reconciliationError) return;
    if (constructionTool !== tool) cancel();
    setConstructionTool(tool);
    setCompactCatalogOpen(tool === 'manual' && compactLayout);
  };

  useEffect(() => {
    const availableSeatIds = new Set(floorplan?.seats.map((seat) => seat.id) ?? []);
    setSelectedSeatIds((current) => {
      const reconciled = current.filter(
        (seatId, index, all) => availableSeatIds.has(seatId) && all.indexOf(seatId) === index
      );
      setSelectedSeatId((primary) => (primary && reconciled.includes(primary) ? primary : reconciled[0]));
      return reconciled.length === current.length ? current : reconciled;
    });
  }, [floorplan?.seats]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    if (window.confirm('Hay cambios del Croquis sin guardar. ¿Quieres salir y descartarlos?')) {
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);

  const adoptRecoveredFloorplan = (latest: AdminFloorplan, cause?: unknown) => {
    const selectedMissing = Boolean(selectedId) && !latest.shapes.some((shape) => shape.id === selectedId);
    const conflict = cause instanceof ApiError && cause.code === 'FLOORPLAN_CONCURRENCY_CONFLICT';
    if (latest.locked || selectedMissing || (conflict && mode === 'editing-existing')) cancel();
  };

  const recoverAfterFailedMutation = async (cause: unknown, forceAuthoritativeRecovery = false) => {
    const code = cause instanceof ApiError ? cause.code : undefined;
    const requiresImmediateAuthority =
      code === 'FLOORPLAN_CONCURRENCY_CONFLICT' ||
      code === 'FLOORPLAN_LAYOUT_LOCKED' ||
      code === 'FLOORPLAN_EVENT_STATE_LOCKED' ||
      code === 'FLOORPLAN_SHAPE_NOT_FOUND' ||
      code === 'FLOORPLAN_NOT_FOUND';
    if (!requiresImmediateAuthority && !forceAuthoritativeRecovery) {
      setRefreshRequired(
        !(cause instanceof ApiError) || cause.status === 429 || cause.status >= 500 || cause.code === 'NETWORK_ERROR'
      );
      return;
    }
    try {
      const latest = await load();
      adoptRecoveredFloorplan(latest, cause);
      setRefreshRequired(false);
    } catch {
      setRefreshRequired(true);
    }
  };

  const runMutation = async <T,>(
    kind: Mutation,
    operation: () => Promise<T>,
    options: { recover?: boolean; forceAuthoritativeRecovery?: boolean } = {}
  ) => {
    if (mutationLock.current || accessEventReadOnly) return undefined;
    mutationLock.current = true;
    setMutation(kind);
    setMessage(undefined);
    setValidationMessage(undefined);
    try {
      return await operation();
    } catch (cause) {
      setMessage(mutationMessage(kind, cause));
      if (options.recover !== false) await recoverAfterFailedMutation(cause, options.forceAuthoritativeRecovery);
      return undefined;
    } finally {
      mutationLock.current = false;
      setMutation(undefined);
    }
  };
  const refreshAfterConfirmedMutation = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setReconciliationError(false);
    setRefreshRequired(false);
    try {
      await load();
    } catch {
      setReconciliationError(true);
    } finally {
      refreshLock.current = false;
    }
  };
  const refreshAuthoritative = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const latest = await load();
      adoptRecoveredFloorplan(latest);
      setRefreshRequired(false);
      setReconciliationError(false);
    } catch {
      if (!reconciliationError) setRefreshRequired(true);
    } finally {
      refreshLock.current = false;
    }
  };
  const selectPreset = (presetId: FloorplanStickerPresetId) => {
    if (!floorplan || (mode === 'editing-existing' && (constructionTool !== 'trace' || dirty)) || readOnly) return;
    const reservedNames = [
      ...floorplan.shapes.map(({ name }) => name),
      ...pendingTables.map(({ input }) => input.name)
    ];
    setSelectedId(undefined);
    setSelectedPresetId(presetId);
    const nextDraft = createStickerDraft(presetId, { existingNames: reservedNames });
    setDraft(constructionTool === 'trace' ? { ...nextDraft, width: 0.08, height: 0.08 } : nextDraft);
    setMode('placing-preset');
    setInspectorOpen(false);
    setMessage(undefined);
  };
  const selectShape = (shape: AdminFloorplanShape) => {
    if ((editing && (constructionTool !== 'trace' || dirty)) || floorplan?.locked || pending) return;
    if ((constructionTool === 'entry' || constructionTool === 'trace') && shape.kind !== 'TABLE') return;
    if (constructionTool === 'entry') setConstructionTool('trace');
    setSelectedPresetId(undefined);
    setSelectedId(shape.id);
    setSelectedSourceElementId(shape.sourceElementId ?? undefined);
    setSelectedSeatId(undefined);
    setSelectedSeatIds([]);
    setDraft(editable(shape));
    setMode('editing-existing');
    setInspectorOpen(true);
    setMessage(undefined);
  };
  const selectSource = (sourceElementId: string) => {
    if (
      editing ||
      readOnly ||
      !svgSource?.selectableElements.some((element) => element.sourceElementId === sourceElementId)
    )
      return;
    const mapped = floorplan?.shapes.find((shape) => shape.sourceElementId === sourceElementId);
    if (mapped) {
      selectShape(mapped);
      return;
    }
    setSelectedSourceElementId(sourceElementId);
    setSelectedId(undefined);
    setSelectedSeatId(undefined);
    setSelectedSeatIds([]);
    setMappingPreset('Mesa');
    setMappingName(createUniqueFloorplanName('Mesa', floorplan?.shapes.map((shape) => shape.name) ?? []));
    setMappingCapacity(8);
    setMode('mapping-source');
    setInspectorOpen(true);
    setMessage(undefined);
  };
  const mapSource = async () => {
    if (!floorplan || !selectedSourceElementId || readOnly || refreshRequired || reconciliationError) return;
    const table = mappingPreset === 'Mesa';
    if (!mappingName.trim()) {
      showValidationMessage('Escribe el nombre del elemento.');
      return;
    }
    if (table && floorplan.seatingMode === 'TABLE' && (!Number.isInteger(mappingCapacity) || mappingCapacity < 1)) {
      showValidationMessage('Indica un número de lugares mayor a cero.');
      return;
    }
    const saved = await runMutation('saving', () =>
      apiClient.adminEventPreparation.mapFloorplanSvgElement(event.clientId, event.id, {
        sourceElementId: selectedSourceElementId,
        kind: table ? 'TABLE' : 'DECORATIVE_ZONE',
        name: mappingName.trim(),
        capacity: table && floorplan.seatingMode === 'TABLE' ? mappingCapacity : 0
      })
    );
    if (!saved) return;
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const unlinkSource = async () => {
    if (!selected?.sourceElementId || readOnly || refreshRequired || reconciliationError) return;
    const succeeded = await runMutation('saving', async () => {
      await apiClient.adminEventPreparation.unlinkFloorplanSvgMapping(event.clientId, event.id, selected.id);
      return true;
    });
    if (!succeeded) return;
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const addSeat = () => {
    if (!floorplan || !selected || selected.kind !== 'TABLE' || readOnly) return;
    setMode('placing-seat');
    setMessage(undefined);
  };
  const placeSeat = async (point: { x: number; y: number }) => {
    if (!floorplan || !selected || selected.kind !== 'TABLE' || readOnly) return;
    const tableSeats = floorplan.seats.filter((seat) => seat.floorplanShapeId === selected.id);
    const saved = await runMutation('seating', () =>
      apiClient.adminEventPreparation.createFloorplanSeat(event.clientId, event.id, selected.id, {
        label: `Lugar ${tableSeats.length + 1}`,
        ...point
      })
    );
    if (!saved) return;
    setFloorplan((current) => (current ? { ...current, seats: [...current.seats, saved] } : current));
    setSelectedSeatId(saved.id);
    setSelectedSeatIds([saved.id]);
    setMode('idle');
    await refreshAfterConfirmedMutation();
  };
  const moveSeat = async (seatId: string, point: { x: number; y: number }) => {
    if (readOnly || !floorplan) return;
    const source = floorplan.seats.find((seat) => seat.id === seatId);
    if (!source) return;
    const moving = selectedSeatIds.includes(seatId) ? selectedSeats : [source];
    const delta = clampSeatGroupDelta(moving, { x: point.x - source.x, y: point.y - source.y });
    const saved = await runMutation('seating', () =>
      apiClient.adminEventPreparation.batchFloorplanSeats(event.clientId, event.id, {
        seats: moving.map((seat) => ({
          seatId: seat.id,
          x: seat.x + delta.x,
          y: seat.y + delta.y
        }))
      })
    );
    if (!saved) return;
    const savedById = new Map(saved.map((seat) => [seat.id, seat]));
    setFloorplan((current) =>
      current ? { ...current, seats: current.seats.map((seat) => savedById.get(seat.id) ?? seat) } : current
    );
    await refreshAfterConfirmedMutation();
  };
  const renumberSeats = async () => {
    if (!floorplan || !selected || selected.kind !== 'TABLE' || readOnly) return;
    const seatIds = floorplan.seats.filter((seat) => seat.floorplanShapeId === selected.id).map((seat) => seat.id);
    if (!seatIds.length) return;
    const saved = await runMutation('seating', () =>
      apiClient.adminEventPreparation.renumberFloorplanSeats(event.clientId, event.id, { seatIds })
    );
    if (!saved) return;
    const savedById = new Map(saved.map((seat) => [seat.id, seat]));
    setFloorplan((current) =>
      current ? { ...current, seats: current.seats.map((seat) => savedById.get(seat.id) ?? seat) } : current
    );
    await refreshAfterConfirmedMutation();
  };
  const updateSeat = async (seatId: string, input: { label?: string; isBlocked?: boolean }) => {
    if (readOnly) return;
    const saved = await runMutation('seating', () =>
      apiClient.adminEventPreparation.updateFloorplanSeat(event.clientId, event.id, seatId, input)
    );
    if (!saved) return;
    setFloorplan((current) =>
      current ? { ...current, seats: current.seats.map((seat) => (seat.id === saved.id ? saved : seat)) } : current
    );
    await refreshAfterConfirmedMutation();
  };
  const openRenameSeat = () => {
    if (!selectedSeat || readOnly) return;
    setRenameSeatTarget({ id: selectedSeat.id, label: selectedSeat.label });
    setRenameSeatLabel(selectedSeat.label);
    setRenameSeatOpen(true);
  };
  const closeRenameSeat = () => {
    setRenameSeatOpen(false);
    setRenameSeatTarget(undefined);
    setRenameSeatLabel('');
  };
  const submitRenameSeat = () => {
    if (!renameSeatTarget) return;
    const label = renameSeatLabel.trim();
    if (!label || label === renameSeatTarget.label) {
      closeRenameSeat();
      return;
    }
    const seatId = renameSeatTarget.id;
    closeRenameSeat();
    void updateSeat(seatId, { label });
  };
  const duplicateSeat = async () => {
    if (!selectedSeat || readOnly || !floorplan) return;
    const labels = new Set(
      floorplan.seats
        .filter((seat) => seat.floorplanShapeId === selectedSeat.floorplanShapeId)
        .map((seat) => seat.label)
    );
    let sequence = 2;
    let label = `${selectedSeat.label} ${sequence}`;
    while (labels.has(label)) label = `${selectedSeat.label} ${++sequence}`;
    const saved = await runMutation('seating', () =>
      apiClient.adminEventPreparation.createFloorplanSeat(event.clientId, event.id, selectedSeat.floorplanShapeId, {
        label,
        x: Math.min(1, selectedSeat.x + 0.02),
        y: Math.min(1, selectedSeat.y + 0.02)
      })
    );
    if (!saved) return;
    setFloorplan((current) => (current ? { ...current, seats: [...current.seats, saved] } : current));
    setSelectedSeatId(saved.id);
    setSelectedSeatIds([saved.id]);
    await refreshAfterConfirmedMutation();
  };
  const removeSeat = async () => {
    if (!selectedSeat || readOnly) return;
    const removedId = selectedSeat.id;
    const succeeded = await runMutation('seating', async () => {
      await apiClient.adminEventPreparation.removeFloorplanSeat(event.clientId, event.id, removedId);
      return true;
    });
    if (!succeeded) return;
    setFloorplan((current) =>
      current ? { ...current, seats: current.seats.filter((seat) => seat.id !== removedId) } : current
    );
    setSelectedSeatId(undefined);
    setSelectedSeatIds([]);
    await refreshAfterConfirmedMutation();
  };
  const setSeatingMode = async (seatingMode: 'TABLE' | 'SEAT') => {
    if (!floorplan || floorplan.seatingMode === seatingMode || readOnly || (anonymousAccess && seatingMode === 'SEAT'))
      return;
    const updated = await runMutation('seating', () =>
      apiClient.adminEventPreparation.setFloorplanSeatingMode(event.clientId, event.id, seatingMode)
    );
    if (!updated) return;
    setFloorplan(updated);
    setSelectedSeatId(undefined);
    setSelectedSeatIds([]);
    await refreshAfterConfirmedMutation();
  };
  const requestSeatingModeChange = (seatingMode: 'TABLE' | 'SEAT') => {
    if (seatingMode === 'TABLE' && floorplan?.seatingMode === 'SEAT') {
      setTableModeConfirmationOpen(true);
      return;
    }
    void setSeatingMode(seatingMode);
  };
  const upload = async (file: File, confirmSvgMappingDetach = false) => {
    const sourceType = floorplanFileSourceType(file);
    if (!sourceType) {
      showValidationMessage('Selecciona una imagen JPG, PNG o SVG.');
      return;
    }
    const updated = await runMutation(
      'uploading',
      async () => {
        const asset =
          sourceType === 'SVG'
            ? await apiClient.adminEventPreparation.uploadFloorplanSvgAsset(event.clientId, event.id, file)
            : await apiClient.adminEventPreparation.uploadFloorplanAsset(event.clientId, event.id, file);
        return floorplan
          ? apiClient.adminEventPreparation.replaceFloorplanImage(event.clientId, event.id, {
              imageAssetId: asset.id,
              ...(confirmSvgMappingDetach ? { confirmSvgMappingDetach: true } : {})
            })
          : apiClient.adminEventPreparation.createFloorplan(event.clientId, event.id, { imageAssetId: asset.id });
      },
      { forceAuthoritativeRecovery: true }
    );
    if (!updated) return;
    setFloorplan(updated);
    setNotFound(false);
    cancel();
    setConstructionTool('entry');
    await refreshAfterConfirmedMutation();
  };
  const requestUpload = async (file: File) => {
    if (!floorplanFileSourceType(file)) {
      showValidationMessage('Selecciona una imagen JPG, PNG o SVG.');
      return;
    }
    const mappedSvg = floorplan?.image.sourceType === 'SVG' && floorplan.shapes.some((shape) => shape.sourceElementId);
    if (mappedSvg) {
      setSourceReplacementCandidate(file);
      return;
    }
    await upload(file);
  };
  const save = async () => {
    if (!draft.name.trim()) {
      showValidationMessage(
        draft.kind === 'TABLE' ? 'Escribe el nombre o número de la mesa.' : 'Escribe el nombre de la zona.'
      );
      return;
    }
    if (
      draft.kind === 'TABLE' &&
      floorplan?.seatingMode !== 'SEAT' &&
      (!Number.isInteger(draft.capacity) || draft.capacity < 1)
    ) {
      showValidationMessage('Indica un número de lugares mayor a cero.');
      return;
    }
    let normalized: AdminFloorplanShapeInput;
    try {
      normalized = normalizeFloorplanShape({ ...draft, name: draft.name.trim() });
    } catch (cause) {
      showValidationMessage(
        cause instanceof FloorplanShapeValidationError
          ? 'Ajusta la forma para que permanezca dentro del plano.'
          : 'No pudimos preparar este elemento.'
      );
      return;
    }
    const saved = await runMutation('saving', () =>
      selected
        ? apiClient.adminEventPreparation.updateFloorplanShape(event.clientId, event.id, selected.id, normalized)
        : apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, normalized)
    );
    if (!saved) return;
    setFloorplan((current) =>
      current
        ? {
            ...current,
            shapes: selected
              ? current.shapes.map((shape) => (shape.id === selected.id ? saved : shape))
              : [...current.shapes, saved]
          }
        : current
    );
    if (constructionTool === 'trace') {
      setSelectedId(saved.id);
      setDraft(editable(saved));
      setMode('editing-existing');
      setInspectorOpen(true);
      setSelectedPresetId(undefined);
    } else {
      cancel();
    }
    await refreshAfterConfirmedMutation();
  };
  const remove = async () => {
    if (!selected) return;
    const removedId = selected.id;
    const succeeded = await runMutation('deleting', async () => {
      await apiClient.adminEventPreparation.removeFloorplanShape(event.clientId, event.id, removedId);
      return true;
    });
    if (!succeeded) return;
    setFloorplan((current) =>
      current ? { ...current, shapes: current.shapes.filter((shape) => shape.id !== removedId) } : current
    );
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const duplicate = async () => {
    if (!selected || !floorplan || readOnly) return;
    const names = floorplan.shapes.map(({ name }) => name);
    const name =
      selected.kind === 'TABLE'
        ? createStickerDraft('round-table', { existingNames: names }).name
        : createUniqueFloorplanName(selected.name, names);
    const input = normalizeFloorplanShape({
      name,
      kind: selected.kind,
      geometry: selected.geometry,
      capacity: selected.kind === 'TABLE' ? selected.capacity : 0,
      x: selected.x + 0.02,
      y: selected.y + 0.02,
      width: selected.width,
      height: selected.height,
      rotation: selected.rotation,
      polygonPoints: selected.polygonPoints?.map(({ x, y }) => ({ x, y })) ?? null
    });
    const saved = await runMutation('duplicating', () =>
      apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, input)
    );
    if (!saved) return;
    setFloorplan((current) => (current ? { ...current, shapes: [...current.shapes, saved] } : current));
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const createInventory = (configurations: readonly InventoryConfiguration[]) => {
    if (!floorplan || editing || readOnly) return;
    const requested = configurations.reduce((total, configuration) => total + configuration.quantity, 0);
    if (pendingTables.length + requested > 200) {
      showValidationMessage('El inventario puede contener hasta 200 mesas pendientes.');
      return;
    }
    const reserved = [...floorplan.shapes, ...pendingTables.map((table) => table.input)];
    const created = createPendingTables(configurations, reserved);
    setPendingTables((current) => [...current, ...created]);
    setActivePendingId((current) => current ?? created[0]?.temporaryId);
    setInventoryOpen(false);
  };
  const persistPending = async (table: PendingTable, point: { x: number; y: number }, refresh = true) => {
    const input = placePendingTable(table, point);
    const saved = await runMutation(
      'placing',
      () => apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, input),
      { recover: false }
    );
    if (!saved) {
      try {
        const latest = await load();
        if (!latest.shapes.some((shape) => matchesAuthoritativeShape(table, shape))) {
          setRefreshRequired(true);
          return false;
        }
        setRefreshRequired(false);
      } catch {
        setRefreshRequired(true);
        return false;
      }
    } else {
      setFloorplan((current) => (current ? { ...current, shapes: [...current.shapes, saved] } : current));
    }
    setPendingTables((current) => current.filter((candidate) => candidate.temporaryId !== table.temporaryId));
    setActivePendingId((current) => (current === table.temporaryId ? undefined : current));
    if (refresh && saved) await refreshAfterConfirmedMutation();
    return true;
  };
  const placePending = (
    point: { x: number; y: number },
    requestedId?: string,
    canvasSize?: { width: number; height: number }
  ) => {
    if (readOnly || mode === 'creating-draft' || mode === 'editing-existing') return;
    if (mode === 'placing-preset' && selectedPresetId) {
      setDraft((current) => {
        if (constructionTool !== 'trace' || !canvasSize?.width || !canvasSize.height)
          return placeStickerDraft(current, point);
        const rect = shapeToStageRect(current, canvasSize);
        return normalizeFloorplanShape({
          ...current,
          x: Math.max(0, point.x - rect.width / canvasSize.width / 2),
          y: Math.max(0, point.y - rect.height / canvasSize.height / 2)
        });
      });
      setMode('creating-draft');
      setInspectorOpen(true);
      return;
    }
    const table = pendingTables.find((candidate) => candidate.temporaryId === (requestedId ?? activePendingId));
    if (table) void persistPending(table, point);
  };
  const placeOnCanvas = (
    point: { x: number; y: number },
    requestedId?: string,
    canvasSize?: { width: number; height: number }
  ) => {
    if (mode === 'placing-seat') {
      void placeSeat(point);
      return;
    }
    placePending(point, requestedId, canvasSize);
  };
  const autoPlace = async () => {
    const snapshot = [...pendingTables];
    let placed = 0;
    for (const [index, table] of snapshot.entries()) {
      if (!(await persistPending(table, autoPlacePoint(index, snapshot.length), false))) break;
      placed += 1;
    }
    if (placed) await refreshAfterConfirmedMutation();
  };
  const changeLock = async () => {
    if (!floorplan || accessEventReadOnly) return;
    const kind = floorplan.locked ? 'unlocking' : 'locking';
    const updated = await runMutation(kind, () =>
      floorplan.locked
        ? apiClient.adminEventPreparation.unlockFloorplan(event.clientId, event.id)
        : apiClient.adminEventPreparation.lockFloorplan(event.clientId, event.id)
    );
    if (!updated) return;
    setFloorplan(updated);
    cancel();
    await refreshAfterConfirmedMutation();
  };

  if (!event.floorplanEnabled) {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 }, borderRadius: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 620 }}>
          <Typography component="h2" variant="h4">
            Croquis deshabilitado
          </Typography>
          <Typography color="text.secondary">
            Habilita el Croquis en Datos cuando el Evento requiera distribución de mesas.
          </Typography>
          <Button
            component={Link}
            to={`/eventos/${event.id}/preparar/datos`}
            variant="contained"
            sx={{ alignSelf: 'flex-start' }}
          >
            Ir a Datos
          </Button>
        </Stack>
      </Paper>
    );
  }
  if (loading) return <AdminLoadingState label="Preparando el taller de Croquis..." />;
  if (loadError) return <AdminErrorState onRetry={() => void load().catch(() => setLoadError(true))} />;
  if (notFound || !floorplan) {
    return (
      <AdminFloorplanSourceEmptyState
        uploading={mutation === 'uploading'}
        disabled={pending || accessEventReadOnly}
        validationMessage={validationMessage}
        message={message}
        refreshRequired={refreshRequired}
        onFile={requestUpload}
        onRefresh={() => void refreshAuthoritative()}
      />
    );
  }

  const inventory = (
    <FloorplanInventory
      disabled={readOnly || editing}
      maxTables={200 - pendingTables.length}
      onCreate={createInventory}
    />
  );
  const compactInventory = (
    <FloorplanInventory
      disabled={readOnly || editing}
      maxTables={200 - pendingTables.length}
      onCreate={(configurations) => {
        createInventory(configurations);
        setCompactCatalogOpen(false);
      }}
    />
  );
  const inspector =
    !finalized && mode === 'mapping-source' ? (
      <AdminFloorplanSvgMappingInspector
        mappingPreset={mappingPreset}
        mappingName={mappingName}
        mappingCapacity={mappingCapacity}
        seatingMode={floorplan.seatingMode}
        readOnly={readOnly}
        pending={pending}
        refreshRequired={refreshRequired}
        reconciliationError={reconciliationError}
        onPresetChange={(preset) => {
          setMappingPreset(preset);
          setMappingName(
            createUniqueFloorplanName(
              preset,
              floorplan.shapes.map((shape) => shape.name)
            )
          );
        }}
        onNameChange={setMappingName}
        onCapacityChange={setMappingCapacity}
        onSave={() => void mapSource()}
        onCancel={cancel}
      />
    ) : !finalized && editing ? (
      <AdminFloorplanShapeInspector
        creating={mode === 'creating-draft'}
        value={draft}
        disabled={readOnly}
        mapped={Boolean(selected?.sourceElementId)}
        {...(selected?.sourceElementId ? { onUnlink: () => void unlinkSource() } : {})}
        capacityDerived={floorplan?.seatingMode === 'SEAT'}
        simple={constructionTool === 'trace' && draft.kind === 'TABLE'}
        traceSeatCount={floorplan.seats.filter((seat) => seat.floorplanShapeId === selectedId).length}
        showTraceNextStep={
          constructionTool === 'trace' && floorplan.seatingMode === 'SEAT' && selected?.kind === 'TABLE'
        }
        onChange={setDraft}
        onSave={() => void save()}
        {...(selected ? { onDuplicate: () => void duplicate(), onDelete: () => void remove() } : {})}
        onCancel={cancel}
      />
    ) : null;
  const tracing = constructionTool === 'trace' && !finalized && Boolean(imageUrl);
  return (
    <Stack
      spacing={1}
      component="section"
      aria-labelledby="admin-floorplan-title"
      sx={
        tracing
          ? {
              position: 'fixed',
              inset: 0,
              m: '0 !important',
              zIndex: 1201,
              bgcolor: 'background.default',
              p: { xs: 1, sm: 2 },
              overflow: 'auto'
            }
          : undefined
      }
    >
      <AdminFloorplanPreparationHeader
        compact={tracing}
        locked={floorplan.locked}
        finalized={finalized}
        seatingMode={floorplan.seatingMode}
        elementCount={floorplan.shapes.length}
        places={places}
        pending={pending}
        readOnly={readOnly}
        editing={editing}
        hasPendingTables={pendingTables.length > 0}
        accessEventReadOnly={accessEventReadOnly}
        anonymousAccess={anonymousAccess}
        reconciliationError={reconciliationError}
        validationMessage={validationMessage}
        message={message}
        refreshRequired={refreshRequired}
        dirty={dirty}
        sourceControl={
          !finalized ? (
            <AdminFloorplanUploadButton label="Cambiar plano" disabled={readOnly || editing} onFile={requestUpload} />
          ) : null
        }
        onSeatingModeChange={requestSeatingModeChange}
        onChangeLock={() => void changeLock()}
        onRefresh={() => void refreshAuthoritative()}
      />
      {!finalized && imageUrl ? (
        <AdminFloorplanTraceEntry
          tool={constructionTool}
          disabled={readOnly || dirty || refreshRequired || reconciliationError}
          canAddTable={!readOnly && !dirty && !refreshRequired && !reconciliationError && !pendingTables.length}
          svgAvailable={floorplan.image.sourceType === 'SVG'}
          selectedTableName={selected?.kind === 'TABLE' ? selected.name : undefined}
          onToolChange={chooseConstructionTool}
          onAddTable={() => selectPreset('round-table')}
        />
      ) : null}
      <Box
        sx={{
          display: tracing ? 'flex' : 'grid',
          flexDirection: 'column',
          flex: tracing ? '1 1 0' : undefined,
          minHeight: tracing ? 240 : undefined,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg:
              !finalized && constructionTool === 'manual'
                ? inspector
                  ? '248px minmax(0, 1fr) 320px'
                  : '248px minmax(0, 1fr)'
                : inspector
                  ? 'minmax(0, 1fr) 320px'
                  : 'minmax(0, 1fr)'
          },
          gap: 1.5,
          alignItems: 'start'
        }}
      >
        {!finalized && constructionTool === 'manual' ? (
          <Box component="aside" sx={{ px: 0.5, display: { xs: 'none', lg: 'block' } }}>
            <Stack spacing={1.5}>
              <Palette
                selectedPresetId={selectedPresetId}
                disabled={readOnly || mode === 'editing-existing'}
                onSelect={selectPreset}
                onInventory={() => setInventoryOpen(true)}
              />
              {!compactLayout && inventoryOpen ? inventory : null}
            </Stack>
          </Box>
        ) : null}
        <Box
          sx={{
            minWidth: 0,
            ...(tracing ? { display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, width: '100%' } : {})
          }}
        >
          {svgSourceError ? (
            <Alert severity="warning" sx={{ mb: 1 }}>
              No pudimos preparar las áreas editables del SVG.
            </Alert>
          ) : null}
          {mode === 'placing-preset' || mode === 'placing-seat' ? (
            <Alert
              severity="info"
              action={
                <Button color="inherit" onClick={cancel}>
                  Cancelar
                </Button>
              }
              sx={{ mb: 1 }}
            >
              {mode === 'placing-seat'
                ? 'Selecciona en el croquis dónde irá el lugar.'
                : 'Haz click o toca el punto del plano donde quieres colocar el elemento.'}
            </Alert>
          ) : null}
          {!finalized &&
          constructionTool !== 'entry' &&
          constructionTool !== 'trace' &&
          floorplan.seatingMode === 'SEAT' &&
          selected?.kind === 'TABLE' ? (
            <AdminFloorplanSeatControls
              readOnly={readOnly}
              placingSeat={mode === 'placing-seat'}
              hasSeats={floorplan.seats.some((seat) => seat.floorplanShapeId === selected.id)}
              tableName={selected.name}
              selectedSeat={selectedSeat}
              selectedSeatCount={selectedSeats.length}
              onAdd={addSeat}
              onRenumber={() => void renumberSeats()}
              onRename={openRenameSeat}
              onDuplicate={() => void duplicateSeat()}
              onToggleBlocked={() => {
                if (selectedSeat) void updateSeat(selectedSeat.id, { isBlocked: !selectedSeat.isBlocked });
              }}
              onRemove={() => void removeSeat()}
            />
          ) : null}
          {imageUrl ? (
            <FloorplanSurface
              floorplan={floorplan}
              tracePresentation={tracing}
              imageUrl={imageUrl}
              selectedId={selectedId}
              selectedSeatId={selectedSeatId}
              selectedSeatIds={selectedSeatIds}
              draft={
                (mode === 'creating-draft' || mode === 'editing-existing') && !selected?.sourceElementId
                  ? draft
                  : undefined
              }
              disabled={readOnly}
              readOnly={finalized}
              onSelect={selectShape}
              onSeatSelect={(seatId, options) => {
                if (editing || readOnly || constructionTool === 'entry' || constructionTool === 'trace') return;
                const seat = floorplan.seats.find((candidate) => candidate.id === seatId);
                if (!seat) return;
                setSelectedId(seat.floorplanShapeId);
                setSelectedSeatIds((current) => {
                  const next = options.additive
                    ? current.includes(seat.id)
                      ? current.filter((id) => id !== seat.id)
                      : [...current, seat.id]
                    : [seat.id];
                  setSelectedSeatId(next.includes(seat.id) ? seat.id : next[0]);
                  return next;
                });
              }}
              onDraftChange={setDraft}
              onCanvasPlace={
                mode === 'placing-preset' || mode === 'placing-seat' || pendingTables.length ? placeOnCanvas : undefined
              }
              captureCanvasClicks={
                mode === 'placing-seat' || (constructionTool === 'trace' && mode === 'placing-preset')
              }
              onSeatMove={
                constructionTool === 'manual' || constructionTool === 'svg'
                  ? (seatId, point) => void moveSeat(seatId, point)
                  : undefined
              }
              svgSource={svgSource}
              selectedSourceElementId={selectedSourceElementId}
              onSourceSelect={constructionTool === 'svg' ? selectSource : undefined}
              dock={
                !finalized && mode === 'idle' ? (
                  <FloorplanTray
                    tables={pendingTables}
                    activeId={activePendingId}
                    disabled={pending}
                    onChoose={(id) => setActivePendingId((current) => (current === id ? undefined : id))}
                    onAutoPlace={() => void autoPlace()}
                  />
                ) : undefined
              }
            />
          ) : (
            <Paper variant="outlined" sx={{ minHeight: 460, display: 'grid', placeItems: 'center', borderRadius: 3 }}>
              {imageLoadFailed ? (
                <Alert severity="warning">No pudimos cargar el plano.</Alert>
              ) : (
                <Typography color="text.secondary">Cargando plano...</Typography>
              )}
            </Paper>
          )}
        </Box>
        {!tracing && !finalized && inspector ? (
          <Box component="aside" sx={{ display: { xs: 'none', lg: 'block' } }}>
            {inspector}
          </Box>
        ) : null}
      </Box>
      {tracing ? (
        <Box sx={{ flexShrink: 0, minHeight: 112 }}>
          {inspector ?? (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              Selecciona una mesa del plano o agrega una referencia sobre el centro del mueble.
            </Typography>
          )}
        </Box>
      ) : null}
      {!finalized && constructionTool === 'manual' ? (
        <Box sx={{ display: { xs: 'block', lg: 'none' } }}>
          <Button
            variant="outlined"
            startIcon={<TableRestaurantRounded />}
            disabled={readOnly || mode === 'editing-existing'}
            onClick={() => setCompactCatalogOpen(true)}
            sx={{ minHeight: 44 }}
          >
            Agregar mesa o zona
          </Button>
        </Box>
      ) : null}
      <Drawer
        anchor="bottom"
        open={!finalized && compactLayout && compactCatalogOpen}
        onClose={() => setCompactCatalogOpen(false)}
        slotProps={{ paper: { sx: { p: 2, maxHeight: '82vh', borderRadius: '22px 22px 0 0' } } }}
      >
        <Stack spacing={1.5}>
          <Typography component="h3" variant="h6">
            Agregar mesa o zona
          </Typography>
          <Palette
            selectedPresetId={selectedPresetId}
            disabled={readOnly || mode === 'editing-existing'}
            showInventoryAction={false}
            onSelect={(presetId) => {
              selectPreset(presetId);
              setCompactCatalogOpen(false);
            }}
            onInventory={() => undefined}
          />
          {compactInventory}
        </Stack>
      </Drawer>
      <Drawer
        anchor="right"
        open={!tracing && compactLayout && inspectorOpen && Boolean(inspector)}
        onClose={cancel}
        slotProps={{ paper: { sx: { p: 2, width: 'min(360px, 92vw)' } } }}
      >
        {inspector}
      </Drawer>
      <Dialog open={tableModeConfirmationOpen} onClose={() => setTableModeConfirmationOpen(false)}>
        <DialogTitle>¿Cambiar a acomodo por mesa?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Las personas conservarán su mesa, pero dejarán de tener un lugar exacto asignado.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableModeConfirmationOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              setTableModeConfirmationOpen(false);
              void setSeatingMode('TABLE');
            }}
          >
            Cambiar a mesas
          </Button>
        </DialogActions>
      </Dialog>
      <AdminFloorplanSeatRenameDialog
        open={renameSeatOpen}
        label={renameSeatLabel}
        onLabelChange={setRenameSeatLabel}
        onClose={closeRenameSeat}
        onSubmit={submitRenameSeat}
      />
      <AdminFloorplanSourceReplacementDialog
        open={Boolean(sourceReplacementCandidate)}
        onClose={() => setSourceReplacementCandidate(undefined)}
        onConfirm={() => {
          const candidate = sourceReplacementCandidate;
          setSourceReplacementCandidate(undefined);
          if (candidate) void upload(candidate, true);
        }}
      />
    </Stack>
  );
}

function Palette({
  selectedPresetId,
  disabled,
  showInventoryAction = true,
  onSelect,
  onInventory
}: {
  selectedPresetId?: FloorplanStickerPresetId | undefined;
  disabled: boolean;
  showInventoryAction?: boolean;
  onSelect: (presetId: FloorplanStickerPresetId) => void;
  onInventory: () => void;
}) {
  return (
    <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <FloorplanStickerCatalog selectedId={selectedPresetId} disabled={disabled} onSelect={onSelect} />
      {showInventoryAction ? (
        <Button
          variant="text"
          startIcon={<TableRestaurantRounded />}
          disabled={disabled}
          onClick={onInventory}
          sx={{ minHeight: 44, justifyContent: 'flex-start' }}
        >
          Crear varias mesas
        </Button>
      ) : null}
    </Stack>
  );
}

function floorplanFileSourceType(file: File): 'SVG' | 'RASTER' | undefined {
  // Browser metadata only routes the upload; the backend validates and sanitizes the bytes.
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') return 'SVG';
  if (/\.(jpe?g|png)$/i.test(file.name) || ['image/jpeg', 'image/png'].includes(file.type)) return 'RASTER';
  return undefined;
}

function useAdminFloorplanImageUrl(apiClient: ApiClient, event: AdminEvent, assetId?: string) {
  const [image, setImage] = useState<{ url?: string; failed: boolean }>({ failed: false });
  useEffect(() => {
    if (!assetId) {
      setImage({ failed: false });
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setImage({ failed: false });
    void apiClient.adminEventPreparation
      .floorplanAssetContent(event.clientId, event.id, assetId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setImage({ failed: true });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiClient, assetId, event.clientId, event.id]);
  return image;
}

function mutationMessage(kind: Mutation, cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === 'FLOORPLAN_CONCURRENCY_CONFLICT')
      return 'El plano cambió al mismo tiempo. Actualizamos la información sin repetir tu operación.';
    if (cause.code === 'FLOORPLAN_LAYOUT_LOCKED' || cause.code === 'FLOORPLAN_EVENT_STATE_LOCKED')
      return 'La distribución fue protegida y ahora está en modo de lectura.';
    if (cause.code === 'FLOORPLAN_SHAPE_NOT_FOUND')
      return 'Esta mesa o zona ya no está disponible. Actualizamos el plano.';
    if (cause.code === 'FLOORPLAN_TABLE_OCCUPIED') return 'Esta mesa tiene lugares asignados y no puede eliminarse.';
    if (cause.code === 'FILE_SVG_INVALID')
      return 'El archivo SVG no es válido. Vuelve a exportarlo y carga el nuevo archivo.';
    if (cause.code === 'FILE_SVG_UNSAFE')
      return 'El SVG contiene contenido no permitido. Exporta una versión sin scripts ni recursos externos.';
    if (cause.code === 'FILE_SVG_LIMIT_EXCEEDED')
      return 'El SVG supera los límites de tamaño o complejidad. Simplifica el plano y vuelve a cargarlo.';
  }
  if (kind === 'deleting') return 'No pudimos eliminar este elemento. Inténtalo nuevamente.';
  if (kind === 'locking') return 'No pudimos finalizar la distribución. Inténtalo nuevamente.';
  if (kind === 'unlocking') return 'No pudimos habilitar la edición. Inténtalo nuevamente.';
  if (kind === 'uploading') return 'No pudimos guardar el plano. Inténtalo nuevamente.';
  return adminErrorMessage(cause).message || 'No pudimos guardar los cambios. Inténtalo nuevamente.';
}

function sameShapeInput(left: AdminFloorplanShapeInput, right: AdminFloorplanShapeInput) {
  return (
    left.name === right.name &&
    left.kind === right.kind &&
    left.geometry === right.geometry &&
    left.capacity === right.capacity &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    JSON.stringify(left.polygonPoints ?? null) === JSON.stringify(right.polygonPoints ?? null)
  );
}
