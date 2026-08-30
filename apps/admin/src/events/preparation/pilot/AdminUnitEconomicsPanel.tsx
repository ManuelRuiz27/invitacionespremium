import type { AdminPilotObservationInput, AdminUnitEconomics } from '@invitaciones/api-client';
import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';

const costKinds = {
  DESIGNER_COST: 'Costo de diseñador',
  EXTERNAL_COST: 'Otro costo externo',
  TECHNOLOGY_COST: 'Tecnología marginal'
} as const;
const areaLabels = {
  GENERAL: 'General',
  INVITATION: 'Invitación',
  FLOORPLAN: 'Croquis',
  GUESTS: 'Invitados',
  RSVP: 'RSVP',
  SEATING: 'Mesas',
  STAFF: 'Staff',
  CHECKIN: 'Check-in',
  CLOSE_REPORT: 'Cierre y reporte'
} as const;
type CostKind = keyof typeof costKinds;
type Area = keyof typeof areaLabels;

interface Props {
  economics: AdminUnitEconomics | undefined;
  loading: boolean;
  busy: boolean;
  onRecorded: (input: AdminPilotObservationInput, confirmation: string) => Promise<boolean>;
}

export function AdminUnitEconomicsPanel({ economics, loading, busy, onRecorded }: Props) {
  const [costKind, setCostKind] = useState<CostKind>('DESIGNER_COST');
  const [costArea, setCostArea] = useState<Area>('INVITATION');
  const [amount, setAmount] = useState('');
  const [costNote, setCostNote] = useState('');
  const [roundNote, setRoundNote] = useState('');
  const [validation, setValidation] = useState<string>();

  const submitCost = async (event: FormEvent) => {
    event.preventDefault();
    const amountMxnCents = parseMxnToCents(amount);
    if (amountMxnCents === undefined || amountMxnCents <= 0) {
      setValidation('Ingresa un monto MXN mayor a cero, con hasta dos decimales.');
      return;
    }
    if (costNote.trim().length > 500) {
      setValidation('La nota no puede exceder 500 caracteres.');
      return;
    }
    setValidation(undefined);
    const recorded = await onRecorded(
      {
        kind: costKind,
        area: costArea,
        amountMxnCents,
        count: 1,
        ...(costNote.trim() ? { note: costNote.trim() } : {})
      },
      'Costo registrado.'
    );
    if (recorded) {
      setAmount('');
      setCostNote('');
    }
  };

  const submitRound = async () => {
    if (roundNote.trim().length > 500) {
      setValidation('La nota no puede exceder 500 caracteres.');
      return;
    }
    setValidation(undefined);
    const recorded = await onRecorded(
      {
        kind: 'DESIGN_ROUND',
        area: 'INVITATION',
        count: 1,
        ...(roundNote.trim() ? { note: roundNote.trim() } : {})
      },
      'Ronda de diseño registrada.'
    );
    if (recorded) setRoundNote('');
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h4">
          Rentabilidad estimada
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Margen de contribución estimado; no representa utilidad neta.
        </Typography>
      </Box>
      <Box
        data-testid="unit-economics-summary"
        aria-busy={loading}
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))'
          },
          overflow: 'hidden'
        }}
      >
        <Metric label="Ingreso comercial neto" value={money(economics?.netRevenueMxnCents)} loading={loading} />
        <Metric label="Costos directos" value={money(economics?.directCostMxnCents)} loading={loading} />
        <Metric label="Margen de contribución" value={money(economics?.contributionMarginMxnCents)} loading={loading} />
        <Metric label="Margen %" value={percent(economics?.contributionMarginPct)} loading={loading} />
        <Metric label="Tiempo operativo" value={`${economics?.operatorMinutesTotal ?? 0} min`} loading={loading} />
        {economics?.operatorShadowCostMxnCents !== null && economics?.operatorShadowCostMxnCents !== undefined ? (
          <Metric label="Costo sombra operador" value={money(economics.operatorShadowCostMxnCents)} loading={loading} />
        ) : null}
      </Box>
      {!loading && economics?.operatorHourlyRateMxnCents === null ? (
        <Alert severity="info">Costo sombra no disponible: la tarifa interna por hora no está configurada.</Alert>
      ) : null}
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '1fr 1fr' } }}>
        <Stack spacing={1}>
          <Typography component="h3" variant="h6">
            Desglose
          </Typography>
          <Detail label="Diseño" value={money(economics?.designerCostMxnCents)} />
          <Detail label="Otros costos externos" value={money(economics?.externalCostMxnCents)} />
          <Detail label="Tecnología marginal" value={money(economics?.technologyCostMxnCents)} />
          <Detail label="Rondas de diseño" value={String(economics?.designRounds ?? 0)} />
          <Detail label="Tiempo operador" value={`${economics?.operatorMinutesTotal ?? 0} min`} />
        </Stack>
        <Stack spacing={1}>
          <Typography component="h3" variant="h6">
            Contexto comercial
          </Typography>
          <Detail label="SKU" value={economics?.serviceCode ?? 'Sin configurar'} />
          <Detail label="Canal" value={channelLabel(economics?.commercialChannel)} />
          <Detail label="Bracket" value={bracket(economics)} />
          <Detail label="Tier venue" value={economics?.venueTier ?? 'No aplica'} />
        </Stack>
      </Box>
      <Divider />
      {validation ? <Alert severity="error">{validation}</Alert> : null}
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '2fr 1fr' } }}>
        <Stack component="form" spacing={2} onSubmit={(event) => void submitCost(event)}>
          <Typography component="h3" variant="h6">
            Registrar costo directo
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
            <TextField
              select
              label="Tipo de costo"
              value={costKind}
              onChange={(event) => setCostKind(event.target.value as CostKind)}
              disabled={busy}
            >
              {Object.entries(costKinds).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Monto MXN"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
              placeholder="1,250.50"
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 15 } }}
            />
            <TextField
              select
              label="Área del costo"
              value={costArea}
              onChange={(event) => setCostArea(event.target.value as Area)}
              disabled={busy}
            >
              {Object.entries(areaLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Nota del costo (opcional)"
              value={costNote}
              onChange={(event) => setCostNote(event.target.value)}
              disabled={busy}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </Box>
          <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>
            {busy ? 'Registrando…' : 'Registrar costo'}
          </Button>
        </Stack>
        <Stack spacing={2}>
          <Typography component="h3" variant="h6">
            Rondas de diseño
          </Typography>
          <TextField
            label="Nota de ronda (opcional)"
            value={roundNote}
            onChange={(event) => setRoundNote(event.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <Button variant="outlined" disabled={busy} onClick={() => void submitRound()} sx={{ minHeight: 44 }}>
            Registrar ronda de diseño
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

function Metric({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
        {loading ? 'Cargando…' : value}
      </Typography>
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, borderBottom: 1, borderColor: 'divider', py: 1 }}
    >
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  );
}

export function parseMxnToCents(raw: string): number | undefined {
  const normalized = raw.trim().replace(/[$,\s]/gu, '');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/u.exec(normalized);
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 100_000_000 ? cents : undefined;
}

function money(cents: number | undefined): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((cents ?? 0) / 100);
}
function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'No disponible' : `${value.toFixed(2)}%`;
}
function channelLabel(channel: AdminUnitEconomics['commercialChannel'] | undefined): string {
  return channel === 'PARTNER' ? 'Planner / agencia' : channel === 'VENUE' ? 'Venue' : 'Estándar';
}
function bracket(economics: AdminUnitEconomics | undefined): string {
  if (economics?.capacityMin === null || economics?.capacityMin === undefined) return 'No aplica';
  return `${economics.capacityMin}–${economics.capacityMax ?? 'sin límite'}`;
}
