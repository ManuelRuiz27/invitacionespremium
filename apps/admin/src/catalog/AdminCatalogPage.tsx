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
import { ApiError } from '@invitaciones/api-client';
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
import {
  clientTypeLabels,
  intervalLabel,
  intervalsOverlap,
  promotionScopeLabels,
  serviceLabels,
  toIso,
  toLocalInput
} from './catalog-format';
import { useCatalogMutationState } from './useCatalogMutationState';

type ServiceReference = Pick<AdminService, 'id' | 'code'> & { isActive?: boolean };

const commercialChannelLabels = {
  STANDARD: 'Estándar / PVP',
  PARTNER: 'Planner / agencia partner',
  VENUE: 'Venue recurrente'
} as const;
const venueTierLabels = {
  ONE_TO_TWO: '1–2 eventos',
  THREE_TO_FIVE: '3–5 eventos',
  SIX_TO_TEN: '6–10 eventos',
  ELEVEN_PLUS: '11+ eventos'
} as const;

function priceApplicabilityLabel(price: AdminPrice): string {
  if (price.pricingVersion === 1) {
    return `Legado · ${price.clientType ? clientTypeLabels[price.clientType] : 'sin tipo'}`;
  }
  const channel = price.commercialChannel ? commercialChannelLabels[price.commercialChannel] : 'Canal inválido';
  if (price.venueTier) return `${channel} · ${venueTierLabels[price.venueTier]}`;
  return `${channel} · ${price.capacityMin ?? '—'}–${price.capacityMax ?? '—'} personas`;
}

function formatMxn(value: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(value);
}

export function AdminCatalogPage({ apiClient }: { apiClient: ApiClient }) {
  const [tab, setTab] = useState(0);
  const [knownServices, setKnownServices] = useState<AdminService[]>([]);
  const [notice, setNotice] = useState('');
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
      {notice ? (
        <Alert severity="success" onClose={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}
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
          onNotice={setNotice}
        />
      ) : tab === 1 ? (
        <PricesSection apiClient={apiClient} query={prices} references={serviceReferences} onNotice={setNotice} />
      ) : (
        <PromotionsSection
          apiClient={apiClient}
          query={promotions}
          references={serviceReferences}
          onNotice={setNotice}
        />
      )}
    </Stack>
  );
}

function ServicesSection({
  apiClient,
  query,
  references,
  onServiceSaved,
  onNotice
}: {
  apiClient: ApiClient;
  query: UseQueryResult<AdminPrice[]>;
  references: ServiceReference[];
  onServiceSaved: (service: AdminService) => void;
  onNotice: (message: string) => void;
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
          knownServices={references}
          onNotice={onNotice}
        />
      ) : null}
    </Stack>
  );
}

function PricesSection({
  apiClient,
  query,
  references,
  onNotice
}: {
  apiClient: ApiClient;
  query: UseQueryResult<AdminPrice[]>;
  references: ServiceReference[];
  onNotice: (message: string) => void;
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
                  <TableCell>Canal / aplicabilidad</TableCell>
                  <TableCell>Creditos</TableCell>
                  <TableCell>MXN</TableCell>
                  <TableCell>Vigencia</TableCell>
                  <TableCell align="right">Accion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.map((price) => (
                  <TableRow key={price.id}>
                    <TableCell>{serviceLabels[price.serviceCode]}</TableCell>
                    <TableCell>{priceApplicabilityLabel(price)}</TableCell>
                    <TableCell>{price.credits}</TableCell>
                    <TableCell>{formatMxn(price.credits * 20)}</TableCell>
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
                      {serviceLabels[price.serviceCode]} · {priceApplicabilityLabel(price)}
                    </Typography>
                    <Typography>
                      {price.credits} creditos · {formatMxn(price.credits * 20)}
                    </Typography>
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
          onNotice={onNotice}
        />
      ) : null}
      {closing ? (
        <ClosePriceDialog apiClient={apiClient} price={closing} onClose={() => setClosing(null)} onNotice={onNotice} />
      ) : null}
    </Stack>
  );
}

function PromotionsSection({
  apiClient,
  query,
  references,
  onNotice
}: {
  apiClient: ApiClient;
  query: UseQueryResult<AdminPromotion[]>;
  references: ServiceReference[];
  onNotice: (message: string) => void;
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
      {clients.isError ? (
        <Alert
          severity="warning"
          action={
            clients.error instanceof ApiError && clients.error.status === 403 ? undefined : (
              <Button color="inherit" onClick={() => void clients.refetch()}>
                Reintentar resolución
              </Button>
            )
          }
        >
          {clients.error instanceof ApiError && clients.error.status === 403
            ? 'No fue posible consultar los nombres de Clientes por falta de permiso.'
            : 'No fue posible resolver los Clientes.'}
        </Alert>
      ) : null}
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
                      <PromotionTargets
                        promo={promo}
                        clients={clientsById}
                        services={servicesById}
                        clientStatus={clients.status}
                      />
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
                    <PromotionTargets
                      promo={promo}
                      clients={clientsById}
                      services={servicesById}
                      clientStatus={clients.status}
                    />
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
          onNotice={onNotice}
        />
      ) : null}
      {toggling ? (
        <TogglePromotionDialog
          apiClient={apiClient}
          promotion={toggling}
          onClose={() => setToggling(null)}
          onNotice={onNotice}
        />
      ) : null}
    </Stack>
  );
}

function PromotionTargets({
  promo,
  clients,
  services,
  clientStatus
}: {
  promo: AdminPromotion;
  clients: Map<string, AdminClient>;
  services: Map<string, ServiceReference>;
  clientStatus: 'pending' | 'error' | 'success';
}) {
  const client = promo.clientId ? clients.get(promo.clientId) : undefined;
  const service = promo.serviceId ? services.get(promo.serviceId) : undefined;
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {client
          ? client.name
          : promo.clientId
            ? clientStatus === 'pending'
              ? 'Resolviendo Cliente…'
              : 'Cliente no resuelto'
            : 'Todos los Clientes'}
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

function priceMatchesInput(price: AdminPrice, input: CreateAdminPriceInput) {
  return (
    price.serviceId === input.serviceId &&
    price.commercialChannel === input.commercialChannel &&
    price.capacityMin === (input.capacityMin ?? null) &&
    price.capacityMax === (input.capacityMax ?? null) &&
    price.venueTier === (input.venueTier ?? null) &&
    price.credits === input.credits &&
    price.validFrom === input.validFrom &&
    price.validUntil === (input.validUntil ?? null)
  );
}

function promotionMatchesInput(promotion: AdminPromotion, input: CreateAdminPromotionInput) {
  return (
    promotion.name === input.name &&
    promotion.scope === input.scope &&
    promotion.clientId === (input.clientId ?? null) &&
    promotion.clientType === (input.clientType ?? null) &&
    promotion.serviceId === (input.serviceId ?? null) &&
    promotion.validFrom === input.validFrom &&
    promotion.validUntil === (input.validUntil ?? null) &&
    promotion.allowsStacking === input.allowsStacking
  );
}

function ServiceDialog({
  apiClient,
  target,
  onClose,
  onSaved,
  knownServices,
  onNotice
}: {
  apiClient: ApiClient;
  target: ServiceReference | 'create' | null;
  onClose: () => void;
  onSaved: (value: AdminService) => void;
  knownServices: ServiceReference[];
  onNotice: (message: string) => void;
}) {
  const creating = target === 'create';
  const [code, setCode] = useState<keyof typeof serviceLabels>('FLYER');
  const [active, setActive] = useState<'active' | 'inactive' | ''>(() => {
    if (creating) return 'active';
    if (!target || typeof target !== 'object' || target.isActive === undefined) return '';
    return target.isActive ? 'active' : 'inactive';
  });
  const [validationError, setValidationError] = useState('');
  const mutation = useCatalogMutationState(
    'catalog-service',
    typeof target === 'object' && target ? target.id : 'create'
  );
  const submit = async () => {
    if (!active) {
      setValidationError('Selecciona explicitamente el nuevo estado del Servicio.');
      return;
    }
    setValidationError('');
    await mutation.submit(
      (signal) =>
        creating
          ? apiClient.adminCatalog.createService({ code, isActive: active === 'active' }, signal)
          : apiClient.adminCatalog.updateService(
              (target as ServiceReference).id,
              { isActive: active === 'active' },
              signal
            ),
      (result) => {
        onSaved(result);
        onNotice('La respuesta autoritativa del Servicio fue aplicada.');
      }
    );
  };
  const reconcile = async () => {
    await mutation.reconcile(
      async () => {
        const matches = creating
          ? knownServices.filter((service) => service.code === code && service.isActive === (active === 'active'))
          : knownServices.filter(
              (service) => service.id === (target as ServiceReference).id && service.isActive === (active === 'active')
            );
        if (matches.length === 1) return { status: 'applied', value: matches[0] } as const;
        return { status: 'ambiguous' } as const;
      },
      {
        applied: () => {
          onNotice('La informacion conservada confirma que el Servicio ya fue actualizado.');
          onClose();
        }
      }
    );
  };
  return (
    <Dialog open={target !== null} onClose={mutation.busy ? undefined : onClose} fullWidth maxWidth="sm">
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
          {validationError ? <Alert severity="error">{validationError}</Alert> : null}
          {mutation.error ? <Alert severity="error">{mutation.error}</Alert> : null}
          {mutation.needsReconciliation ? (
            <Stack direction="row" spacing={1}>
              <Button onClick={() => void reconcile()}>Actualizar información</Button>
              <Button onClick={mutation.allowExplicitRetry}>Habilitar reintento explicito</Button>
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!mutation.canSubmit || !active}>
          {mutation.busy ? 'Procesando...' : 'Confirmar'}
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
  onClose,
  onNotice
}: {
  apiClient: ApiClient;
  open: boolean;
  prices: AdminPrice[];
  references: ServiceReference[];
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [serviceId, setServiceId] = useState('');
  const [commercialChannel, setCommercialChannel] = useState<CreateAdminPriceInput['commercialChannel']>('STANDARD');
  const [capacityMin, setCapacityMin] = useState('1');
  const [capacityMax, setCapacityMax] = useState('50');
  const [venueTier, setVenueTier] = useState<NonNullable<CreateAdminPriceInput['venueTier']>>('ONE_TO_TWO');
  const [credits, setCredits] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [validationError, setValidationError] = useState('');
  const mutation = useCatalogMutationState('catalog-price', 'create');
  const queryClient = useQueryClient();
  const buildBody = () => {
    const numeric = Number(credits);
    const minimum = Number(capacityMin);
    const maximum = Number(capacityMax);
    if (
      !serviceId ||
      !Number.isInteger(numeric) ||
      numeric < 0 ||
      !from ||
      (commercialChannel !== 'VENUE' &&
        (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum > 150 || minimum > maximum))
    ) {
      setValidationError('Completa una revision valida del precio.');
      return null;
    }
    const body: CreateAdminPriceInput = {
      serviceId,
      commercialChannel,
      ...(commercialChannel === 'VENUE'
        ? { venueTier, capacityMin: null, capacityMax: null }
        : { capacityMin: minimum, capacityMax: maximum, venueTier: null }),
      credits: numeric,
      validFrom: toIso(from),
      validUntil: until ? toIso(until) : null
    };
    if (body.validUntil && body.validUntil <= body.validFrom) {
      setValidationError('El fin de vigencia debe ser posterior al inicio.');
      return null;
    }
    if (
      prices.some(
        (price) =>
          price.serviceId === serviceId &&
          price.commercialChannel === commercialChannel &&
          price.capacityMin === (body.capacityMin ?? null) &&
          price.capacityMax === (body.capacityMax ?? null) &&
          price.venueTier === (body.venueTier ?? null) &&
          intervalsOverlap(price, body)
      )
    ) {
      setValidationError(
        'La vigencia aparente se solapa con otro precio. El backend realizara la validacion definitiva.'
      );
      return null;
    }
    const code = references.find((item) => item.id === serviceId)?.code;
    if (code === 'DEMO' && numeric !== 0) {
      setValidationError('Demo debe conservar precio de cero creditos.');
      return null;
    }
    setValidationError('');
    return body;
  };
  const submit = async () => {
    const body = buildBody();
    if (!body) return;
    await mutation.submit(
      (signal) => apiClient.adminCatalog.createPrice(body, signal),
      (result) => {
        queryClient.setQueryData<AdminPrice[]>(adminQueryKeys.prices, (items = []) => [...items, result]);
        onNotice('El Precio fue confirmado por la respuesta autoritativa.');
        onClose();
      }
    );
  };
  const reconcile = async () => {
    const body = buildBody();
    if (!body) return;
    await mutation.reconcile(
      async (signal) => {
        const items = await apiClient.adminCatalog.listPrices(signal);
        queryClient.setQueryData(adminQueryKeys.prices, items);
        const matches = items.filter((item) => priceMatchesInput(item, body));
        if (matches.length === 1) return { status: 'applied', value: matches[0] } as const;
        if (matches.length > 1) return { status: 'ambiguous' } as const;
        return { status: 'not_applied' } as const;
      },
      {
        applied: () => {
          onNotice('La consulta autoritativa confirma que el Precio ya fue creado.');
          onClose();
        }
      }
    );
  };
  return (
    <Dialog open={open} onClose={mutation.busy ? undefined : onClose} fullWidth maxWidth="sm">
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
            label="Canal comercial"
            value={commercialChannel}
            onChange={(e) => setCommercialChannel(e.target.value as CreateAdminPriceInput['commercialChannel'])}
          >
            {Object.entries(commercialChannelLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          {commercialChannel === 'VENUE' ? (
            <TextField
              select
              label="Volumen efectivo M-1"
              value={venueTier}
              onChange={(e) => setVenueTier(e.target.value as NonNullable<CreateAdminPriceInput['venueTier']>)}
            >
              {Object.entries(venueTierLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Capacidad mínima"
                type="number"
                value={capacityMin}
                onChange={(e) => setCapacityMin(e.target.value)}
              />
              <TextField
                label="Capacidad máxima"
                type="number"
                value={capacityMax}
                onChange={(e) => setCapacityMax(e.target.value)}
              />
            </Stack>
          )}
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
          {validationError ? <Alert severity="error">{validationError}</Alert> : null}
          {mutation.error ? <Alert severity="error">{mutation.error}</Alert> : null}
          {mutation.needsReconciliation ? (
            <Button onClick={() => void reconcile()}>Actualizar información</Button>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!mutation.canSubmit}>
          {mutation.busy ? 'Procesando...' : 'Confirmar precio'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ClosePriceDialog({
  apiClient,
  price,
  onClose,
  onNotice
}: {
  apiClient: ApiClient;
  price: AdminPrice | null;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [currentPrice, setCurrentPrice] = useState(price);
  const [until, setUntil] = useState('');
  const [validationError, setValidationError] = useState('');
  const mutation = useCatalogMutationState('catalog-price-close', currentPrice?.id ?? 'none');
  const queryClient = useQueryClient();
  const submit = async () => {
    if (!currentPrice || !until) return;
    if (toIso(until) <= currentPrice.validFrom) {
      setValidationError('La fecha de cierre debe ser posterior al inicio de la vigencia.');
      return;
    }
    setValidationError('');
    const requestedUntil = toIso(until);
    await mutation.submit(
      (signal) => apiClient.adminCatalog.closePrice(currentPrice.id, { validUntil: requestedUntil }, signal),
      (result) => {
        queryClient.setQueryData<AdminPrice[]>(adminQueryKeys.prices, (items = []) =>
          items.map((item) => (item.id === result.id ? result : item))
        );
        onNotice('El cierre del Precio fue confirmado por la respuesta autoritativa.');
        onClose();
      }
    );
  };
  const reconcile = async () => {
    if (!currentPrice || !until) return;
    const requestedUntil = toIso(until);
    await mutation.reconcile(
      async (signal) => {
        const items = await apiClient.adminCatalog.listPrices(signal);
        queryClient.setQueryData(adminQueryKeys.prices, items);
        const current = items.find((item) => item.id === currentPrice.id);
        if (!current) return { status: 'unavailable' } as const;
        if (current.validUntil === requestedUntil) return { status: 'applied', value: current } as const;
        if (current.validUntil === null) return { status: 'not_applied', value: current } as const;
        return { status: 'unavailable' } as const;
      },
      {
        applied: () => {
          onNotice('La consulta autoritativa confirma que el Precio ya fue cerrado.');
          onClose();
        },
        notApplied: (latest) => {
          if (latest) setCurrentPrice(latest);
        },
        unavailable: () => {
          onNotice('El Precio ya no esta disponible para esta operacion.');
          onClose();
        }
      }
    );
  };
  return (
    <ConfirmSensitiveActionDialog
      open={currentPrice !== null}
      title="Cerrar vigencia"
      description="El precio historico no se modifica; solo se fija su limite superior exclusivo."
      confirmLabel="Cerrar precio"
      busy={mutation.busy}
      confirmDisabled={!mutation.canSubmit}
      error={validationError || mutation.error}
      onClose={onClose}
      onConfirm={() => void submit()}
    >
      {currentPrice ? (
        <Typography variant="body2">
          {serviceLabels[currentPrice.serviceCode]} · {priceApplicabilityLabel(currentPrice)} · {currentPrice.credits}{' '}
          creditos · inicio {formatDate(currentPrice.validFrom)}
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
      {mutation.needsReconciliation ? <Button onClick={() => void reconcile()}>Actualizar información</Button> : null}
    </ConfirmSensitiveActionDialog>
  );
}

function PromotionDialog({
  apiClient,
  target,
  references,
  onClose,
  onNotice
}: {
  apiClient: ApiClient;
  target: AdminPromotion | 'create' | null;
  references: ServiceReference[];
  onClose: () => void;
  onNotice: (message: string) => void;
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
  const [validationError, setValidationError] = useState('');
  const mutation = useCatalogMutationState('catalog-promotion', current?.id ?? 'create');
  const queryClient = useQueryClient();
  const buildBody = () => {
    if (!name.trim() || !from) {
      setValidationError('Completa nombre e inicio de vigencia.');
      return null;
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
      setValidationError('El fin de vigencia debe ser posterior al inicio.');
      return null;
    }
    setValidationError('');
    return body;
  };
  const applyAuthoritative = (value: AdminPromotion) => {
    setName(value.name);
    setScopeValue(value.scope);
    setClientType(value.clientType ?? '');
    setClientId(value.clientId ?? '');
    setServiceId(value.serviceId ?? '');
    setFrom(toLocalInput(value.validFrom));
    setUntil(toLocalInput(value.validUntil));
    setStacking(value.allowsStacking);
  };
  const submit = async () => {
    const body = buildBody();
    if (!body) return;
    await mutation.submit(
      (signal) =>
        current
          ? apiClient.adminCatalog.updatePromotion(current.id, body, signal)
          : apiClient.adminCatalog.createPromotion(body, signal),
      (result) => {
        queryClient.setQueryData<AdminPromotion[]>(adminQueryKeys.promotions, (items = []) => [
          ...items.filter((item) => item.id !== result.id),
          result
        ]);
        onNotice(`La ${current ? 'actualizacion' : 'creacion'} de la Promocion fue confirmada.`);
        onClose();
      }
    );
  };
  const reconcile = async () => {
    const body = buildBody();
    if (!body) return;
    await mutation.reconcile(
      async (signal) => {
        const items = await apiClient.adminCatalog.listPromotions(signal);
        queryClient.setQueryData(adminQueryKeys.promotions, items);
        if (current) {
          const latest = items.find((item) => item.id === current.id);
          if (!latest) return { status: 'unavailable' } as const;
          return promotionMatchesInput(latest, body)
            ? ({ status: 'applied', value: latest } as const)
            : ({ status: 'not_applied', value: latest } as const);
        }
        const matches = items.filter((item) => promotionMatchesInput(item, body));
        if (matches.length === 1) return { status: 'applied', value: matches[0] } as const;
        if (matches.length > 1) return { status: 'ambiguous' } as const;
        return { status: 'not_applied' } as const;
      },
      {
        applied: () => {
          onNotice('La consulta autoritativa confirma que la Promocion ya fue aplicada.');
          onClose();
        },
        notApplied: (latest) => {
          if (latest) applyAuthoritative(latest);
        },
        unavailable: () => {
          onNotice('La Promocion ya no esta disponible.');
          onClose();
        }
      }
    );
  };
  return (
    <Dialog open={target !== null} onClose={mutation.busy ? undefined : onClose} fullWidth maxWidth="sm">
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
          {validationError ? <Alert severity="error">{validationError}</Alert> : null}
          {mutation.error ? <Alert severity="error">{mutation.error}</Alert> : null}
          {mutation.needsReconciliation ? (
            <Button onClick={() => void reconcile()}>Actualizar información</Button>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={!mutation.canSubmit}>
          {mutation.busy ? 'Procesando...' : 'Confirmar promocion'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TogglePromotionDialog({
  apiClient,
  promotion,
  onClose,
  onNotice
}: {
  apiClient: ApiClient;
  promotion: AdminPromotion | null;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [currentPromotion, setCurrentPromotion] = useState(promotion);
  const mutation = useCatalogMutationState('catalog-promotion-toggle', promotion?.id ?? 'none');
  const queryClient = useQueryClient();
  const submit = async () => {
    if (!currentPromotion) return;
    await mutation.submit(
      (signal) =>
        currentPromotion.isActive
          ? apiClient.adminCatalog.deactivatePromotion(currentPromotion.id, signal)
          : apiClient.adminCatalog.activatePromotion(currentPromotion.id, signal),
      (result) => {
        queryClient.setQueryData<AdminPromotion[]>(adminQueryKeys.promotions, (items = []) =>
          items.map((item) => (item.id === result.id ? result : item))
        );
        onNotice(`La Promocion fue ${result.isActive ? 'activada' : 'desactivada'} de forma autoritativa.`);
        onClose();
      }
    );
  };
  const reconcile = async () => {
    if (!currentPromotion) return;
    const requestedState = !currentPromotion.isActive;
    await mutation.reconcile(
      async (signal) => {
        const items = await apiClient.adminCatalog.listPromotions(signal);
        queryClient.setQueryData(adminQueryKeys.promotions, items);
        const latest = items.find((item) => item.id === currentPromotion.id);
        if (!latest) return { status: 'unavailable' } as const;
        return latest.isActive === requestedState
          ? ({ status: 'applied', value: latest } as const)
          : ({ status: 'not_applied', value: latest } as const);
      },
      {
        applied: (latest) => {
          onNotice(
            `La consulta autoritativa confirma que la Promocion esta ${latest?.isActive ? 'activa' : 'inactiva'}.`
          );
          onClose();
        },
        notApplied: (latest) => {
          if (latest) setCurrentPromotion(latest);
        },
        unavailable: () => {
          onNotice('La Promocion ya no esta disponible.');
          onClose();
        }
      }
    );
  };
  return (
    <ConfirmSensitiveActionDialog
      open={currentPromotion !== null}
      title={`${currentPromotion?.isActive ? 'Desactivar' : 'Activar'} promocion`}
      description="La accion cambia la elegibilidad operativa y no aplica efectos economicos retroactivos."
      confirmLabel={currentPromotion?.isActive ? 'Desactivar' : 'Activar'}
      destructive={Boolean(currentPromotion?.isActive)}
      busy={mutation.busy}
      confirmDisabled={!mutation.canSubmit}
      error={mutation.error}
      onClose={onClose}
      onConfirm={() => void submit()}
    >
      {mutation.needsReconciliation ? <Button onClick={() => void reconcile()}>Actualizar información</Button> : null}
    </ConfirmSensitiveActionDialog>
  );
}
