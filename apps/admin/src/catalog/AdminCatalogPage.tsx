import { useMemo, useState } from 'react';
import type {
  AdminClient,
  AdminPrice,
  AdminPromotion,
  AdminService,
  ApiClient,
  CreateAdminPriceInput,
  CreateAdminPromotionInput
} from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { AddOutlined } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { adminQueryKeys } from '../app/query-client';
import { formatDate } from '../shared/admin-labels';
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { ConfirmSensitiveActionDialog } from '../shared/ConfirmSensitiveActionDialog';
import { adminErrorMessage } from '../shared/admin-error';
import { isAbortError, useAdminOperationScope } from '../shared/useAdminOperationScope';
import {
  clientTypeLabels,
  intervalLabel,
  intervalsOverlap,
  promotionScopeLabels,
  serviceLabels,
  toIso,
  toLocalInput
} from './catalog-format';

type ServiceReference = Pick<AdminService, 'id' | 'code'> & { isActive?: boolean };
const uncertainMessage = 'El resultado no pudo confirmarse. Actualiza la informacion antes de repetir la accion.';

export function AdminCatalogPage({ apiClient }: { apiClient: ApiClient }) {
  const [tab, setTab] = useState(0);
  const [knownServices, setKnownServices] = useState<AdminService[]>([]);
  const prices = useQuery({
    queryKey: adminQueryKeys.prices,
    queryFn: ({ signal }) => apiClient.adminCatalog.listPrices(signal)
  });
  const promotions = useQuery({
    queryKey: adminQueryKeys.promotions,
    queryFn: ({ signal }) => apiClient.adminCatalog.listPromotions(signal)
  });
  const serviceReferences = useMemo(() => {
    const refs = new Map<string, ServiceReference>();
    for (const price of prices.data ?? []) refs.set(price.serviceId, { id: price.serviceId, code: price.serviceCode });
    for (const service of knownServices) refs.set(service.id, service);
    return [...refs.values()];
  }, [knownServices, prices.data]);

  const rememberService = (service: AdminService) => {
    setKnownServices((items) => [...items.filter((item) => item.id !== service.id), service]);
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Catalogo"
        description="Servicios referenciados, historial de precios y elegibilidad de promociones."
      />
      <Paper variant="outlined">
        <Tabs
          value={tab}
          onChange={(_, value: number) => setTab(value)}
          aria-label="Secciones del catalogo"
          variant="scrollable"
        >
          <Tab label="Servicios" />
          <Tab label="Precios" />
          <Tab label="Promociones" />
        </Tabs>
      </Paper>
      {tab === 0 ? (
        <ServicesSection
          apiClient={apiClient}
          query={prices}
          references={serviceReferences}
          onServiceSaved={rememberService}
        />
      ) : tab === 1 ? (
        <PricesSection apiClient={apiClient} query={prices} references={serviceReferences} />
      ) : (
        <PromotionsSection apiClient={apiClient} query={promotions} references={serviceReferences} />
      )}
    </Stack>
  );
}

function ServicesSection({
  apiClient,
  query,
  references,
  onServiceSaved
}: {
  apiClient: ApiClient;
  query: UseQueryResult<AdminPrice[]>;
  references: ServiceReference[];
  onServiceSaved: (service: AdminService) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ServiceReference | null | 'create'>(null);
  if (query.isPending) return <AdminLoadingState label="Cargando referencias de Servicios..." />;
  if (query.isError) return <AdminErrorState onRetry={() => void query.refetch()} />;
  const services = references;
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Servicios referenciados
      </Typography>
      <Alert severity="info">
        El OpenAPI no publica un listado administrativo completo de Servicios. Esta vista muestra solo referencias
        autoritativas presentes en precios y respuestas creadas durante esta sesion.
      </Alert>
      <Box>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing('create')}>
          Crear Servicio
        </Button>
      </Box>
      {services.length === 0 ? (
        <AdminEmptyState
          title="Sin referencias de Servicios"
          description="Crea un Servicio o espera a que exista una referencia administrativa."
        />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Servicio</TableCell>
                  <TableCell>Referencia</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Accion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>{serviceLabels[service.code]}</TableCell>
                    <TableCell>{service.id}</TableCell>
                    <TableCell>
                      {service.isActive === undefined ? 'No expuesto' : service.isActive ? 'Activo' : 'Inactivo'}
                    </TableCell>
                    <TableCell align="right">
                      <Button onClick={() => setEditing(service)}>Actualizar estado</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {services.map((service) => (
              <Paper key={service.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{serviceLabels[service.code]}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {service.id}
                    </Typography>
                    {service.isActive === undefined ? (
                      <Typography variant="caption">Estado no expuesto por la referencia de precio</Typography>
                    ) : (
                      <StatusChip
                        label={service.isActive ? 'Activo' : 'Inactivo'}
                        tone={service.isActive ? 'success' : 'neutral'}
                      />
                    )}
                  </Box>
                  <Button onClick={() => setEditing(service)}>Actualizar estado</Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
      )}
      {editing ? (
        <ServiceDialog
          key={editing === 'create' ? editing : editing.id}
          apiClient={apiClient}
          target={editing}
          onClose={() => setEditing(null)}
          onSaved={(service) => {
            onServiceSaved(service);
            void queryClient.invalidateQueries({ queryKey: adminQueryKeys.prices });
            void queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotions });
            setEditing(null);
          }}
        />
      ) : null}
    </Stack>
  );
}

function PricesSection({
  apiClient,
  query,
  references
}: {
  apiClient: ApiClient;
  query: UseQueryResult<AdminPrice[]>;
  references: ServiceReference[];
}) {
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<AdminPrice | null>(null);
  if (query.isPending) return <AdminLoadingState label="Cargando historial de precios..." />;
  if (query.isError) return <AdminErrorState onRetry={() => void query.refetch()} />;
  return (
    <Stack spacing={2}>
      <Box>
        <Button
          variant="contained"
          startIcon={<AddOutlined />}
          onClick={() => setCreating(true)}
          disabled={references.length === 0}
        >
          Crear precio
        </Button>
      </Box>
      {query.data.length === 0 ? (
        <AdminEmptyState title="Sin precios" description="No hay historial administrativo disponible." />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Servicio</TableCell>
                  <TableCell>Tipo de Cliente</TableCell>
                  <TableCell>Creditos</TableCell>
                  <TableCell>Vigencia</TableCell>
                  <TableCell align="right">Accion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell>{serviceLabels[price.serviceCode]}</TableCell>
                    <TableCell>{clientTypeLabels[price.clientType]}</TableCell>
                    <TableCell>{price.credits}</TableCell>
                    <TableCell>
                      {intervalLabel(price)}
                      <br />[ {formatDate(price.validFrom)},{' '}
                      {price.validUntil ? formatDate(price.validUntil) : 'sin limite'} )
                    </TableCell>
                    <TableCell align="right">
                      {price.validUntil === null ? (
                        <Button onClick={() => setClosing(price)}>Cerrar vigencia</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {query.data.map((price: AdminPrice) => (
              <Paper key={price.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>
                      {serviceLabels[price.serviceCode]} · {clientTypeLabels[price.clientType]}
                    </Typography>
                    <Typography>{price.credits} creditos</Typography>
                    <Typography variant="body2" color="text.secondary">
                      [ {formatDate(price.validFrom)}, {price.validUntil ? formatDate(price.validUntil) : 'sin limite'}{' '}
                      )
                    </Typography>
                  </Box>
                  <Stack spacing={1} sx={{ alignItems: { md: 'flex-end' } }}>
                    <StatusChip
                      label={intervalLabel(price)}
                      tone={intervalLabel(price).startsWith('En intervalo') ? 'success' : 'neutral'}
                    />
                    {price.validUntil === null ? (
                      <Button onClick={() => setClosing(price)}>Cerrar vigencia</Button>
                    ) : null}
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
      )}
      {creating ? (
        <PriceDialog
          apiClient={apiClient}
          open
          prices={query.data}
          references={references}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {closing ? <ClosePriceDialog apiClient={apiClient} price={closing} onClose={() => setClosing(null)} /> : null}
    </Stack>
  );
}

function PromotionsSection({
  apiClient,
  query,
  references
}: {
  apiClient: ApiClient;
  query: UseQueryResult<AdminPromotion[]>;
  references: ServiceReference[];
}) {
  const [editing, setEditing] = useState<AdminPromotion | 'create' | null>(null);
  const [toggling, setToggling] = useState<AdminPromotion | null>(null);
  const clients = useQuery({
    queryKey: adminQueryKeys.clients,
    queryFn: ({ signal }) => apiClient.adminClients.list(signal)
  });
  const clientsById = useMemo(() => new Map((clients.data ?? []).map((client) => [client.id, client])), [clients.data]);
  const servicesById = useMemo(() => new Map(references.map((service) => [service.id, service])), [references]);
  if (query.isPending) return <AdminLoadingState label="Cargando promociones..." />;
  if (query.isError) return <AdminErrorState onRetry={() => void query.refetch()} />;
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Las promociones de este MVP definen elegibilidad y si permiten acumulacion. No calculan descuentos ni bonos.
      </Alert>
      <Box>
        <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setEditing('create')}>
          Crear promocion
        </Button>
      </Box>
      {query.data.length === 0 ? (
        <AdminEmptyState title="Sin promociones" />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Promocion</TableCell>
                  <TableCell>Alcance</TableCell>
                  <TableCell>Vigencia</TableCell>
                  <TableCell>Objetivo</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.map((promo) => (
                  <TableRow key={promo.id}>
                    <TableCell>{promo.name}</TableCell>
                    <TableCell>{promotionScopeLabels[promo.scope]}</TableCell>
                    <TableCell>
                      {intervalLabel(promo)}
                      <br />[ {formatDate(promo.validFrom)},{' '}
                      {promo.validUntil ? formatDate(promo.validUntil) : 'sin limite'} )
                    </TableCell>
                    <TableCell>
                      <PromotionTargets promo={promo} clients={clientsById} services={servicesById} />
                    </TableCell>
                    <TableCell>
                      {promo.isActive ? 'Activa' : 'Inactiva'} ·{' '}
                      {promo.allowsStacking ? 'Permite acumulacion' : 'No permite acumulacion'}
                    </TableCell>
                    <TableCell align="right">
                      <Button onClick={() => setEditing(promo)}>Editar</Button>
                      <Button color={promo.isActive ? 'error' : 'primary'} onClick={() => setToggling(promo)}>
                        {promo.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {query.data.map((promo: AdminPromotion) => (
              <Paper key={promo.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2, justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{promo.name}</Typography>
                    <Typography>
                      {promotionScopeLabels[promo.scope]} · {intervalLabel(promo)}
                    </Typography>
                    <PromotionTargets promo={promo} clients={clientsById} services={servicesById} />
                    <Typography variant="body2">
                      {promo.allowsStacking ? 'Permite acumulacion' : 'No permite acumulacion'}
                    </Typography>
                    <Typography variant="caption">
                      Vigencia [ {formatDate(promo.validFrom)},{' '}
                      {promo.validUntil ? formatDate(promo.validUntil) : 'sin limite'} )
                    </Typography>
                  </Box>
                  <Stack spacing={1} sx={{ alignItems: { md: 'flex-end' } }}>
                    <StatusChip
                      label={promo.isActive ? 'Activa' : 'Inactiva'}
                      tone={promo.isActive ? 'success' : 'neutral'}
                    />
                    <Stack direction="row">
                      <Button onClick={() => setEditing(promo)}>Editar</Button>
                      <Button color={promo.isActive ? 'error' : 'primary'} onClick={() => setToggling(promo)}>
                        {promo.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
      )}
      {editing ? (
        <PromotionDialog
          key={editing === 'create' ? editing : editing.id}
          apiClient={apiClient}
          target={editing}
          references={references}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {toggling ? (
        <TogglePromotionDialog apiClient={apiClient} promotion={toggling} onClose={() => setToggling(null)} />
      ) : null}
    </Stack>
  );
}

function PromotionTargets({
  promo,
  clients,
  services
}: {
  promo: AdminPromotion;
  clients: Map<string, AdminClient>;
  services: Map<string, ServiceReference>;
}) {
  const client = promo.clientId ? clients.get(promo.clientId) : undefined;
  const service = promo.serviceId ? services.get(promo.serviceId) : undefined;
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {client ? client.name : promo.clientId ? 'Cliente no resuelto' : 'Todos los Clientes'}
      </Typography>
      {promo.clientId ? (
        <Typography variant="caption" color="text.secondary">
          Referencia: {promo.clientId}
        </Typography>
      ) : null}
      <Typography variant="body2">
        {promo.clientType ? clientTypeLabels[promo.clientType] : 'Todos los tipos de Cliente'}
      </Typography>
      <Typography variant="body2">
        {service ? serviceLabels[service.code] : promo.serviceId ? 'Servicio no resuelto' : 'Todos los Servicios'}
      </Typography>
      {promo.serviceId ? (
        <Typography variant="caption" color="text.secondary">
          Referencia: {promo.serviceId}
        </Typography>
      ) : null}
    </Stack>
  );
}

function mutationError(error: unknown) {
  const parsed = adminErrorMessage(error);
  return parsed.uncertain ? uncertainMessage : parsed.message;
}

function ServiceDialog({
  apiClient,
  target,
  onClose,
  onSaved
}: {
  apiClient: ApiClient;
  target: ServiceReference | 'create' | null;
  onClose: () => void;
  onSaved: (value: AdminService) => void;
}) {
  const creating = target === 'create';
  const [code, setCode] = useState<keyof typeof serviceLabels>('FLYER');
  const [active, setActive] = useState<'active' | 'inactive' | ''>(() => {
    if (creating) return 'active';
    if (!target || typeof target !== 'object' || target.isActive === undefined) return '';
    return target.isActive ? 'active' : 'inactive';
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scope = useAdminOperationScope('catalog-service', typeof target === 'object' && target ? target.id : 'create');
  const queryClient = useQueryClient();
  const submit = async () => {
    if (!active) {
      setError('Selecciona explicitamente el nuevo estado del Servicio.');
      return;
    }
    const operation = scope.begin();
    if (!operation) return;
    setBusy(true);
    setError('');
    try {
      const result = creating
        ? await apiClient.adminCatalog.createService({ code, isActive: active === 'active' }, operation.signal)
        : await apiClient.adminCatalog.updateService(
            (target as ServiceReference).id,
            { isActive: active === 'active' },
            operation.signal
          );
      if (operation.isCurrent()) onSaved(result);
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        setError(mutationError(reason));
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.prices });
      }
    } finally {
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  };
  return (
    <Dialog open={target !== null} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{creating ? 'Crear Servicio' : 'Actualizar Servicio'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {creating ? (
            <TextField
              select
              label="Codigo"
              value={code}
              onChange={(event) => setCode(event.target.value as keyof typeof serviceLabels)}
            >
              {Object.entries(serviceLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography>{target && typeof target === 'object' ? serviceLabels[target.code] : ''}</Typography>
          )}
          {!creating && target && typeof target === 'object' && target.isActive === undefined && !active ? (
            <Alert severity="warning">
              Estado actual no expuesto. Selecciona explicitamente el nuevo estado antes de confirmar.
            </Alert>
          ) : null}
          <TextField
            select
            label="Estado"
            value={active}
            onChange={(event) => setActive(event.target.value as 'active' | 'inactive')}
          >
            {!creating && active === '' ? <MenuItem value="">Estado actual no expuesto</MenuItem> : null}
            <MenuItem value="active">Activo</MenuItem>
            <MenuItem value="inactive">Inactivo</MenuItem>
          </TextField>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy || !active}>
          {busy ? 'Procesando...' : 'Confirmar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PriceDialog({
  apiClient,
  open,
  prices,
  references,
  onClose
}: {
  apiClient: ApiClient;
  open: boolean;
  prices: AdminPrice[];
  references: ServiceReference[];
  onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState('');
  const [clientType, setClientType] = useState<CreateAdminPriceInput['clientType']>('PLANNER');
  const [credits, setCredits] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scope = useAdminOperationScope('catalog-price', 'create');
  const queryClient = useQueryClient();
  const submit = async () => {
    const numeric = Number(credits);
    if (!serviceId || !Number.isInteger(numeric) || numeric < 0 || !from) {
      setError('Completa una revision valida del precio.');
      return;
    }
    const body: CreateAdminPriceInput = {
      serviceId,
      clientType,
      credits: numeric,
      validFrom: toIso(from),
      validUntil: until ? toIso(until) : null
    };
    if (body.validUntil && body.validUntil <= body.validFrom) {
      setError('El fin de vigencia debe ser posterior al inicio.');
      return;
    }
    if (
      prices.some(
        (price) => price.serviceId === serviceId && price.clientType === clientType && intervalsOverlap(price, body)
      )
    ) {
      setError('La vigencia aparente se solapa con otro precio. El backend realizara la validacion definitiva.');
      return;
    }
    const code = references.find((item) => item.id === serviceId)?.code;
    if (code === 'DEMO' && numeric !== 0) {
      setError('Demo debe conservar precio de cero creditos.');
      return;
    }
    const operation = scope.begin();
    if (!operation) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.adminCatalog.createPrice(body, operation.signal);
      if (operation.isCurrent()) {
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.prices });
        onClose();
      }
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        setError(mutationError(reason));
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.prices });
      }
    } finally {
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Crear precio</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Servicio" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {references.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {serviceLabels[item.code]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Tipo de Cliente"
            value={clientType}
            onChange={(e) => setClientType(e.target.value as CreateAdminPriceInput['clientType'])}
          >
            {Object.entries(clientTypeLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Creditos"
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 1 } }}
          />
          <TextField
            label="Inicio de vigencia"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
          />
          <TextField
            label="Fin de vigencia (opcional)"
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
          />
          <Alert severity="info">
            Revisa Servicio, tipo de Cliente, creditos y el intervalo [inicio, fin). El historial no se edita: un precio
            vigente solo puede cerrarse.
          </Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Procesando...' : 'Confirmar precio'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ClosePriceDialog({
  apiClient,
  price,
  onClose
}: {
  apiClient: ApiClient;
  price: AdminPrice | null;
  onClose: () => void;
}) {
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scope = useAdminOperationScope('catalog-price', price?.id ?? 'none');
  const queryClient = useQueryClient();
  const submit = async () => {
    if (!price || !until) return;
    if (toIso(until) <= price.validFrom) {
      setError('La fecha de cierre debe ser posterior al inicio de la vigencia.');
      return;
    }
    const operation = scope.begin();
    if (!operation) return;
    setBusy(true);
    try {
      await apiClient.adminCatalog.closePrice(price.id, { validUntil: toIso(until) }, operation.signal);
      if (operation.isCurrent()) {
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.prices });
        onClose();
      }
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        setError(mutationError(reason));
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.prices });
      }
    } finally {
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  };
  return (
    <ConfirmSensitiveActionDialog
      open={price !== null}
      title="Cerrar vigencia"
      description="El precio historico no se modifica; solo se fija su limite superior exclusivo."
      confirmLabel="Cerrar precio"
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => void submit()}
    >
      {price ? (
        <Typography variant="body2">
          {serviceLabels[price.serviceCode]} · {clientTypeLabels[price.clientType]} · {price.credits} creditos · inicio{' '}
          {formatDate(price.validFrom)}
        </Typography>
      ) : null}
      <TextField
        label="Fin de vigencia"
        type="datetime-local"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
        fullWidth
      />
    </ConfirmSensitiveActionDialog>
  );
}

function PromotionDialog({
  apiClient,
  target,
  references,
  onClose
}: {
  apiClient: ApiClient;
  target: AdminPromotion | 'create' | null;
  references: ServiceReference[];
  onClose: () => void;
}) {
  const current = target && target !== 'create' ? target : null;
  const [name, setName] = useState(current?.name ?? '');
  const [scopeValue, setScopeValue] = useState<CreateAdminPromotionInput['scope']>(current?.scope ?? 'CREDIT_PURCHASE');
  const [clientType, setClientType] = useState(current?.clientType ?? '');
  const [clientId, setClientId] = useState(current?.clientId ?? '');
  const [serviceId, setServiceId] = useState(current?.serviceId ?? '');
  const [from, setFrom] = useState(toLocalInput(current?.validFrom));
  const [until, setUntil] = useState(toLocalInput(current?.validUntil));
  const [stacking, setStacking] = useState(current?.allowsStacking ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operationScope = useAdminOperationScope('catalog-promotion', current?.id ?? 'create');
  const queryClient = useQueryClient();
  const submit = async () => {
    if (!name.trim() || !from) {
      setError('Completa nombre e inicio de vigencia.');
      return;
    }
    const body: CreateAdminPromotionInput = {
      name: name.trim(),
      scope: scopeValue,
      clientType: (clientType || null) as NonNullable<CreateAdminPromotionInput['clientType']>,
      clientId: clientId.trim() || null,
      serviceId: serviceId || null,
      validFrom: toIso(from),
      validUntil: until ? toIso(until) : null,
      allowsStacking: stacking
    };
    if (body.validUntil && body.validUntil <= body.validFrom) {
      setError('El fin de vigencia debe ser posterior al inicio.');
      return;
    }
    const operation = operationScope.begin();
    if (!operation) return;
    setBusy(true);
    setError('');
    try {
      if (current) await apiClient.adminCatalog.updatePromotion(current.id, body, operation.signal);
      else await apiClient.adminCatalog.createPromotion(body, operation.signal);
      if (operation.isCurrent()) {
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotions });
        onClose();
      }
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        setError(mutationError(reason));
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotions });
      }
    } finally {
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  };
  return (
    <Dialog open={target !== null} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{current ? 'Editar promocion' : 'Crear promocion'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            select
            label="Alcance"
            value={scopeValue}
            onChange={(e) => setScopeValue(e.target.value as CreateAdminPromotionInput['scope'])}
          >
            {Object.entries(promotionScopeLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Tipo de Cliente" value={clientType} onChange={(e) => setClientType(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(clientTypeLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Cliente especifico (UUID opcional)"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
          {clientId && clientType ? (
            <Alert severity="warning">El backend comprobara que el tipo coincida con el Cliente real.</Alert>
          ) : null}
          <TextField select label="Servicio" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {references.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {serviceLabels[item.code]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Inicio de vigencia"
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
          />
          <TextField
            label="Fin de vigencia (opcional)"
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
          />
          <FormControlLabel
            control={<Checkbox checked={stacking} onChange={(e) => setStacking(e.target.checked)} />}
            label="Admite acumulacion"
          />
          <Alert severity="info">
            Esta configuracion solo define elegibilidad. No contiene porcentaje, monto, bonos ni formulas economicas.
          </Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Procesando...' : 'Confirmar promocion'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TogglePromotionDialog({
  apiClient,
  promotion,
  onClose
}: {
  apiClient: ApiClient;
  promotion: AdminPromotion | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scope = useAdminOperationScope('catalog-promotion-toggle', promotion?.id ?? 'none');
  const queryClient = useQueryClient();
  const submit = async () => {
    if (!promotion) return;
    const operation = scope.begin();
    if (!operation) return;
    setBusy(true);
    try {
      if (promotion.isActive) await apiClient.adminCatalog.deactivatePromotion(promotion.id, operation.signal);
      else await apiClient.adminCatalog.activatePromotion(promotion.id, operation.signal);
      if (operation.isCurrent()) {
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotions });
        onClose();
      }
    } catch (reason) {
      if (operation.isCurrent() && !isAbortError(reason)) {
        setError(mutationError(reason));
        void queryClient.invalidateQueries({ queryKey: adminQueryKeys.promotions });
      }
    } finally {
      if (operation.isCurrent()) setBusy(false);
      operation.finish();
    }
  };
  return (
    <ConfirmSensitiveActionDialog
      open={promotion !== null}
      title={`${promotion?.isActive ? 'Desactivar' : 'Activar'} promocion`}
      description="La accion cambia la elegibilidad operativa y no aplica efectos economicos retroactivos."
      confirmLabel={promotion?.isActive ? 'Desactivar' : 'Activar'}
      destructive={Boolean(promotion?.isActive)}
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => void submit()}
    />
  );
}
