import {
  ApiError,
  type ApiClient,
  type Event,
  type Floorplan,
  type FloorplanShape,
  type SeatingWorkspaceItem,
  type SeatingWorkspacePage
} from '@invitaciones/api-client';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { FloorplanSurface } from '@invitaciones/floorplan';
import { useWorkspaceRealtime } from './useWorkspaceRealtime';

type Scope = 'UNASSIGNED' | 'TABLE';
type ConfirmIntent = { kind: 'FAMILY'; item: SeatingWorkspaceItem } | { kind: 'GROUP'; item: SeatingWorkspaceItem };
type MutationIntent =
  | { kind: 'ASSIGN'; assistantIds: string[]; tableShapeId: string; key: string }
  | { kind: 'FAMILY'; invitationId: string; tableShapeId: string; key: string }
  | { kind: 'GROUP'; groupId: string; tableShapeId: string; key: string }
  | { kind: 'UPDATE'; assistantId: string; tableShapeId: string | null; key: string };

const mutableStatuses = new Set(['ACTIVE', 'EVENT_DAY']);

export function SeatingWorkspace({ apiClient, event }: { apiClient: ApiClient; event: Event }) {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const mobile = useMediaQuery(theme.breakpoints.down('sm'));
  const digital = event.serviceCode === 'FLYER' || event.serviceCode === 'FLIPBOOK';
  const [realtimeTerminal, setRealtimeTerminal] = useState(false);
  const mutable = digital && mutableStatuses.has(event.status) && !realtimeTerminal;
  const [selectedTableId, setSelectedTableId] = useState<string>();
  const [scope, setScope] = useState<Scope>('UNASSIGNED');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent>();
  const [feedback, setFeedback] = useState<string>();
  const [uncertainIntent, setUncertainIntent] = useState<MutationIntent>();
  const submittingRef = useRef(false);
  const mutationControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setCursor(undefined);
    setSelectedIds(new Set());
  }, [debouncedSearch, groupId, scope, selectedTableId]);

  const floorplanQuery = useQuery({
    queryKey: ['workspace-floorplan', event.id],
    queryFn: ({ signal }) => apiClient.floorplan.get(event.id, signal)
  });
  const imageQuery = useQuery({
    queryKey: ['workspace-floorplan-image', event.id, floorplanQuery.data?.image.fileAssetId],
    queryFn: ({ signal }) => apiClient.fileAssets.content(event.id, floorplanQuery.data!.image.fileAssetId, signal),
    enabled: Boolean(floorplanQuery.data)
  });
  const imageUrl = useObjectUrl(imageQuery.data);
  const groupsQuery = useQuery({
    queryKey: ['workspace-groups', event.id],
    queryFn: () => apiClient.contacts.groups(event.id),
    enabled: digital
  });
  const seatingQuery = useQuery({
    queryKey: ['workspace-seating', event.id, scope, selectedTableId, groupId, debouncedSearch, cursor],
    queryFn: ({ signal }) =>
      apiClient.floorplan.seating(
        event.id,
        {
          scope,
          ...(scope === 'TABLE' && selectedTableId ? { tableShapeId: selectedTableId } : {}),
          ...(groupId ? { groupId } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(cursor ? { cursor } : {}),
          limit: 50
        },
        signal
      ),
    enabled: digital && (scope === 'UNASSIGNED' || Boolean(selectedTableId))
  });

  const floorplan = floorplanQuery.data;
  const selectedTable = floorplan?.shapes.find((shape) => shape.id === selectedTableId && shape.kind === 'TABLE');
  const tableSummary = seatingQuery.data?.summary.selectedTable;
  const available = selectedTable ? Math.max(0, selectedTable.capacity - selectedTable.occupancy) : 0;
  const items = seatingQuery.data?.items ?? [];

  useEffect(() => {
    if (!floorplan || !selectedTableId) return;
    if (!floorplan.shapes.some((shape) => shape.id === selectedTableId && shape.kind === 'TABLE')) {
      setSelectedTableId(undefined);
      setScope('UNASSIGNED');
    }
  }, [floorplan, selectedTableId]);

  const updateFloorplanFromMutation = (result: { affectedTables: Array<{ tableId: string; occupancy: number }> }) => {
    queryClient.setQueryData<Floorplan>(['workspace-floorplan', event.id], (current) =>
      current
        ? {
            ...current,
            shapes: current.shapes.map((shape) => {
              const update = result.affectedTables.find((table) => table.tableId === shape.id);
              return update
                ? {
                    ...shape,
                    occupancy: update.occupancy,
                    availableCapacity: Math.max(0, shape.capacity - update.occupancy)
                  }
                : shape;
            })
          }
        : current
    );
  };

  useWorkspaceRealtime(event.id, digital, {
    onSeatingUpdated: (affectedTables) => updateFloorplanFromMutation({ affectedTables }),
    onTerminal: () => {
      mutationControllerRef.current?.abort();
      submittingRef.current = false;
      setRealtimeTerminal(true);
      setFeedback('El Evento finalizó. La distribución quedó en modo de consulta.');
    }
  });

  useEffect(
    () => () => {
      mutationControllerRef.current?.abort();
    },
    []
  );

  const executeIntent = async (intent: MutationIntent) => {
    if (submittingRef.current || !mutable) return;
    submittingRef.current = true;
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setFeedback(undefined);
    try {
      const result =
        intent.kind === 'ASSIGN'
          ? await apiClient.floorplan.assign(
              event.id,
              { assistantIds: intent.assistantIds, tableShapeId: intent.tableShapeId },
              intent.key,
              controller.signal
            )
          : intent.kind === 'FAMILY'
            ? await apiClient.floorplan.assignFamily(
                event.id,
                { invitationId: intent.invitationId, tableShapeId: intent.tableShapeId },
                intent.key,
                controller.signal
              )
            : intent.kind === 'GROUP'
              ? await apiClient.floorplan.assignGroup(
                  event.id,
                  { groupId: intent.groupId, tableShapeId: intent.tableShapeId },
                  intent.key,
                  controller.signal
                )
              : await apiClient.floorplan.updateSeating(
                  event.id,
                  intent.assistantId,
                  { tableShapeId: intent.tableShapeId },
                  intent.key,
                  controller.signal
                );
      updateFloorplanFromMutation(result);
      setSelectedIds(new Set());
      setUncertainIntent(undefined);
      setFeedback('Cambio guardado. Actualizando la distribución…');
      const refresh = await seatingQuery.refetch();
      if (refresh.isError) setFeedback('El cambio se guardó. Actualiza la lectura para ver el estado más reciente.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFeedback('La disponibilidad cambió. Actualizamos las Mesas para que elijas nuevamente.');
        const [, refreshed] = await Promise.all([floorplanQuery.refetch(), seatingQuery.refetch()]);
        const eligible = new Set(refreshed.data?.items.map(({ assistantId }) => assistantId) ?? []);
        setSelectedIds((current) => new Set([...current].filter((assistantId) => eligible.has(assistantId))));
      } else {
        const refreshed = await seatingQuery.refetch();
        if (refreshed.data && intentIsReflected(intent, refreshed.data, scope, selectedTableId)) {
          setSelectedIds(new Set());
          setUncertainIntent(undefined);
          setFeedback('La lectura actual confirma que el cambio se guardó.');
        } else {
          setUncertainIntent(intent);
          setFeedback('No pudimos confirmar el resultado. Consulta el estado antes de volver a intentar.');
        }
      }
    } finally {
      if (mutationControllerRef.current === controller) mutationControllerRef.current = null;
      submittingRef.current = false;
    }
  };

  if (floorplanQuery.isPending || imageQuery.isPending) {
    return <Typography role="status">Cargando distribución…</Typography>;
  }
  if (floorplanQuery.isError || imageQuery.isError || !floorplan || !imageUrl) {
    return <Alert severity="error">No pudimos cargar la distribución. Inténtalo nuevamente.</Alert>;
  }

  const selectTable = (shape: FloorplanShape) => {
    if (shape.kind !== 'TABLE') return;
    setSelectedTableId(shape.id);
    setScope('UNASSIGNED');
  };
  const panel = selectedTable ? (
    digital ? (
      <AssignmentPanel
        table={selectedTable}
        {...(tableSummary === undefined ? {} : { tableSummary })}
        scope={scope}
        items={items}
        selectedIds={selectedIds}
        search={search}
        groupId={groupId}
        groups={groupsQuery.data ?? []}
        {...(seatingQuery.data === undefined ? {} : { page: seatingQuery.data })}
        mutable={mutable}
        {...(feedback ? { feedback } : {})}
        uncertain={Boolean(uncertainIntent)}
        onClose={() => setSelectedTableId(undefined)}
        onScopeChange={setScope}
        onSearchChange={setSearch}
        onGroupChange={setGroupId}
        onToggle={(assistantId) =>
          setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(assistantId)) next.delete(assistantId);
            else next.add(assistantId);
            return next;
          })
        }
        onNextPage={() => setCursor(seatingQuery.data?.nextCursor ?? undefined)}
        onAssign={() =>
          void executeIntent({
            kind: 'ASSIGN',
            assistantIds: [...selectedIds],
            tableShapeId: selectedTable.id,
            key: newKey()
          })
        }
        onMove={() => setDestinationOpen(true)}
        onUnassign={(assistantId) =>
          void executeIntent({ kind: 'UPDATE', assistantId, tableShapeId: null, key: newKey() })
        }
        onFamily={(item) => setConfirmIntent({ kind: 'FAMILY', item })}
        onGroup={(item) => setConfirmIntent({ kind: 'GROUP', item })}
        onRetry={() => uncertainIntent && void executeIntent(uncertainIntent)}
        onRefresh={() => void Promise.all([floorplanQuery.refetch(), seatingQuery.refetch()])}
      />
    ) : (
      <PhysicalTablePanel table={selectedTable} onClose={() => setSelectedTableId(undefined)} />
    )
  ) : null;

  return (
    <>
      {!mutable && digital ? (
        <Alert severity="info">Este Evento está en modo de consulta. La distribución no admite cambios.</Alert>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: compact || !selectedTable ? 'minmax(0, 1fr)' : 'minmax(0, 3fr) minmax(340px, 2fr)',
          gap: 2,
          alignItems: 'start'
        }}
      >
        <FloorplanSurface
          floorplan={floorplan}
          imageUrl={imageUrl}
          selectedId={selectedTableId}
          disabled={false}
          readOnly
          onSelect={selectTable}
          onDraftChange={() => undefined}
        />
        {!compact ? panel : null}
      </Box>
      {compact ? (
        <Drawer
          anchor={mobile ? 'bottom' : 'right'}
          open={Boolean(panel)}
          onClose={() => setSelectedTableId(undefined)}
          slotProps={{
            paper: {
              sx: mobile ? { maxHeight: '88dvh', borderRadius: '20px 20px 0 0' } : { width: 'min(460px, 92vw)' }
            }
          }}
        >
          {panel}
        </Drawer>
      ) : null}
      {selectedTable ? (
        <DestinationDialog
          open={destinationOpen}
          tables={floorplan.shapes.filter((shape) => shape.kind === 'TABLE')}
          sourceTableId={selectedTable.id}
          count={selectedIds.size}
          onClose={() => setDestinationOpen(false)}
          onChoose={(tableShapeId) => {
            setDestinationOpen(false);
            const assistantIds = [...selectedIds];
            void executeIntent(
              assistantIds.length === 1
                ? { kind: 'UPDATE', assistantId: assistantIds[0]!, tableShapeId, key: newKey() }
                : { kind: 'ASSIGN', assistantIds, tableShapeId, key: newKey() }
            );
          }}
        />
      ) : null}
      {selectedTable ? (
        <ConfirmationDialog
          {...(confirmIntent ? { intent: confirmIntent } : {})}
          table={selectedTable}
          available={available}
          onClose={() => setConfirmIntent(undefined)}
          onConfirm={() => {
            if (!confirmIntent) return;
            const intent: MutationIntent =
              confirmIntent.kind === 'FAMILY'
                ? {
                    kind: 'FAMILY',
                    invitationId: confirmIntent.item.invitation.id,
                    tableShapeId: selectedTable.id,
                    key: newKey()
                  }
                : {
                    kind: 'GROUP',
                    groupId: confirmIntent.item.group!.id,
                    tableShapeId: selectedTable.id,
                    key: newKey()
                  };
            setConfirmIntent(undefined);
            void executeIntent(intent);
          }}
        />
      ) : null}
    </>
  );
}

function AssignmentPanel(props: {
  table: FloorplanShape;
  tableSummary?: SeatingWorkspacePage['summary']['selectedTable'];
  scope: Scope;
  items: SeatingWorkspaceItem[];
  selectedIds: Set<string>;
  search: string;
  groupId: string;
  groups: Array<{ id: string; name: string }>;
  page?: SeatingWorkspacePage;
  mutable: boolean;
  feedback?: string;
  uncertain: boolean;
  onClose: () => void;
  onScopeChange: (scope: Scope) => void;
  onSearchChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onToggle: (id: string) => void;
  onNextPage: () => void;
  onAssign: () => void;
  onMove: () => void;
  onUnassign: (id: string) => void;
  onFamily: (item: SeatingWorkspaceItem) => void;
  onGroup: (item: SeatingWorkspaceItem) => void;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const occupancy = props.tableSummary?.occupancy ?? props.table.occupancy;
  const available = Math.max(0, props.table.capacity - occupancy);
  return (
    <Stack sx={{ minWidth: 0, maxHeight: { md: 'calc(100dvh - 180px)' }, bgcolor: 'background.paper' }}>
      <Stack direction="row" sx={{ px: 2.5, pt: 2.5, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography component="h2" variant="h5">
            {props.table.name}
          </Typography>
          <Typography color="text.secondary">
            {occupancy} / {props.table.capacity} lugares ·{' '}
            {available === 0 ? 'Mesa completa' : `${available} disponibles`}
          </Typography>
        </Box>
        <IconButton aria-label="Cerrar panel de Mesa" onClick={props.onClose} sx={{ width: 44, height: 44 }}>
          <CloseRounded />
        </IconButton>
      </Stack>
      <Tabs
        value={props.scope}
        onChange={(_, value: Scope) => props.onScopeChange(value)}
        variant="fullWidth"
        sx={{ px: 1.5 }}
      >
        <Tab
          value="UNASSIGNED"
          label={`Sin mesa${props.page ? ` (${props.page.summary.unassignedCount})` : ''}`}
          sx={{ minHeight: 48 }}
        />
        <Tab value="TABLE" label="En esta mesa" sx={{ minHeight: 48 }} />
      </Tabs>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ px: 2, py: 1.5 }}>
        <TextField
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Buscar Asistente"
          slotProps={{
            htmlInput: { 'aria-label': 'Buscar Asistente' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded />
                </InputAdornment>
              )
            }
          }}
          fullWidth
        />
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel id="group-filter-label">Grupo</InputLabel>
          <Select
            labelId="group-filter-label"
            label="Grupo"
            value={props.groupId}
            onChange={(event) => props.onGroupChange(event.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            {props.groups.map((group) => (
              <MenuItem key={group.id} value={group.id}>
                {group.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
      {props.feedback ? (
        <Alert
          severity={props.uncertain ? 'warning' : 'info'}
          sx={{ mx: 2, mb: 1 }}
          action={
            props.uncertain ? (
              <Button color="inherit" onClick={props.onRetry}>
                Reintentar
              </Button>
            ) : undefined
          }
        >
          {props.feedback}
          {props.uncertain ? (
            <Button size="small" onClick={props.onRefresh}>
              Actualizar lectura
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <Stack
        component="ul"
        aria-label={props.scope === 'UNASSIGNED' ? 'Asistentes sin mesa' : `Asistentes en ${props.table.name}`}
        sx={{ listStyle: 'none', p: 0, m: 0, overflowY: 'auto', minHeight: 180 }}
      >
        {props.items.map((item) => (
          <Box
            component="li"
            key={item.assistantId}
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'center',
              px: 2,
              py: 0.75,
              minHeight: 56,
              borderTop: 1,
              borderColor: 'divider'
            }}
          >
            <Checkbox
              checked={props.selectedIds.has(item.assistantId)}
              onChange={() => props.onToggle(item.assistantId)}
              slotProps={{ input: { 'aria-label': `Seleccionar ${item.name ?? 'Asistente'}` } }}
              sx={{ width: 44, height: 44 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 700 }}>
                {item.name ?? 'Nombre protegido'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.checkedIn ? 'Ingreso registrado' : (item.group?.name ?? 'Sin grupo')}
              </Typography>
              {props.mutable && props.scope === 'UNASSIGNED' ? (
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', mt: 0.25, ml: -1 }}>
                  <Button size="small" onClick={() => props.onFamily(item)} sx={{ minHeight: 44 }}>
                    Invitación completa
                  </Button>
                  {item.group ? (
                    <Button size="small" onClick={() => props.onGroup(item)} sx={{ minHeight: 44 }}>
                      Grupo completo
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </Box>
            {props.mutable && props.scope === 'TABLE' ? (
              <Button size="small" color="inherit" onClick={() => props.onUnassign(item.assistantId)}>
                Quitar Mesa
              </Button>
            ) : null}
          </Box>
        ))}
        {props.items.length === 0 ? (
          <Typography component="li" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            No hay Asistentes en esta vista.
          </Typography>
        ) : null}
      </Stack>
      {props.page?.nextCursor ? (
        <Button onClick={props.onNextPage} sx={{ minHeight: 44, mx: 2 }}>
          Ver siguientes 50
        </Button>
      ) : null}
      {props.mutable ? (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            p: 2,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider'
          }}
        >
          <Button
            variant="contained"
            fullWidth
            disabled={
              props.selectedIds.size === 0 || (props.scope === 'UNASSIGNED' && props.selectedIds.size > available)
            }
            onClick={props.scope === 'UNASSIGNED' ? props.onAssign : props.onMove}
            sx={{ minHeight: 48 }}
          >
            {props.scope === 'UNASSIGNED'
              ? `Asignar ${props.selectedIds.size} a ${props.table.name}`
              : `Cambiar mesa de ${props.selectedIds.size}`}
          </Button>
          {props.scope === 'UNASSIGNED' && props.selectedIds.size > available ? (
            <Typography variant="caption" color="error.main">
              La selección supera los lugares disponibles.
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Stack>
  );
}

function PhysicalTablePanel({ table, onClose }: { table: FloorplanShape; onClose: () => void }) {
  return (
    <Stack spacing={1} sx={{ p: 2.5, minWidth: 300 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography component="h2" variant="h5">
          {table.name}
        </Typography>
        <IconButton aria-label="Cerrar panel de Mesa" onClick={onClose} sx={{ width: 44, height: 44 }}>
          <CloseRounded />
        </IconButton>
      </Stack>
      <Typography>
        {table.occupancy} / {table.capacity} lugares
      </Typography>
      <Typography color="text.secondary">
        {table.availableCapacity === 0 ? 'Mesa completa' : `${table.availableCapacity} lugares disponibles`}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Los pases físicos se consultan sin lista nominal ni reasignación.
      </Typography>
    </Stack>
  );
}

function DestinationDialog({
  open,
  tables,
  sourceTableId,
  count,
  onClose,
  onChoose
}: {
  open: boolean;
  tables: FloorplanShape[];
  sourceTableId: string;
  count: number;
  onClose: () => void;
  onChoose: (id: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Cambiar mesa</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {tables
            .filter((table) => table.id !== sourceTableId)
            .map((table) => {
              const available = Math.max(0, table.capacity - table.occupancy);
              const disabled = available < count;
              return (
                <Button
                  key={table.id}
                  disabled={disabled}
                  onClick={() => onChoose(table.id)}
                  sx={{ minHeight: 52, justifyContent: 'space-between' }}
                >
                  <span>{table.name}</span>
                  <span>
                    {table.occupancy}/{table.capacity} ·{' '}
                    {disabled ? 'Sin lugares suficientes' : `${available} disponibles`}
                  </span>
                </Button>
              );
            })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
}

function ConfirmationDialog({
  intent,
  table,
  available,
  onClose,
  onConfirm
}: {
  intent?: ConfirmIntent;
  table: FloorplanShape;
  available: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const count =
    intent?.kind === 'FAMILY'
      ? intent.item.invitation.eligibleAssistantCount
      : (intent?.item.group?.eligibleAssistantCount ?? 0);
  const assigned =
    intent?.kind === 'FAMILY'
      ? intent.item.invitation.assignedAssistantCount
      : (intent?.item.group?.assignedAssistantCount ?? 0);
  const label = intent?.kind === 'FAMILY' ? 'esta invitación' : (intent?.item.group?.name ?? 'este grupo');
  return (
    <Dialog open={Boolean(intent)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{intent?.kind === 'FAMILY' ? 'Asignar invitación completa' : 'Asignar grupo completo'}</DialogTitle>
      <DialogContent>
        <Typography>
          Asignar a las {count} personas de {label} a {table.name}.
        </Typography>
        {assigned > 0 ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {assigned} ya tienen Mesa y pueden cambiar de ubicación.
          </Alert>
        ) : null}
        {count > available ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            La cantidad supera los {available} lugares disponibles.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={count === 0 || count > available} onClick={onConfirm}>
          Confirmar asignación
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(undefined);
    };
  }, [blob]);
  return url;
}

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

function intentIsReflected(
  intent: MutationIntent,
  page: SeatingWorkspacePage,
  scope: Scope,
  selectedTableId: string | undefined
): boolean {
  const visibleIds = new Set(page.items.map(({ assistantId }) => assistantId));
  if (intent.kind === 'ASSIGN') {
    if (scope === 'UNASSIGNED') return intent.assistantIds.every((id) => !visibleIds.has(id));
    return selectedTableId === intent.tableShapeId && intent.assistantIds.every((id) => visibleIds.has(id));
  }
  if (intent.kind === 'UPDATE') {
    if (scope === 'TABLE' && selectedTableId !== intent.tableShapeId) return !visibleIds.has(intent.assistantId);
    if (scope === 'TABLE' && selectedTableId === intent.tableShapeId) return visibleIds.has(intent.assistantId);
    return intent.tableShapeId === null ? visibleIds.has(intent.assistantId) : !visibleIds.has(intent.assistantId);
  }
  const matching = page.items.find((item) =>
    intent.kind === 'FAMILY' ? item.invitation.id === intent.invitationId : item.group?.id === intent.groupId
  );
  if (!matching) return false;
  const aggregate = intent.kind === 'FAMILY' ? matching.invitation : matching.group;
  return aggregate !== null && aggregate.assignedAssistantCount === aggregate.eligibleAssistantCount;
}
