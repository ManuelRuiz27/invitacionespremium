import { useMemo, useState } from 'react';
import type { Event } from '@invitaciones/api-client';
import { EmptyState, StatusChip } from '@invitaciones/ui';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { getEventStatusPresentation, type EventGroup } from '../shared/event-status';
import { formatEventDate, socialTypeLabels } from '../shared/formatters';
import { EventCard } from './EventCard';
import { Link } from 'react-router-dom';

type Filter = 'all' | EventGroup;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'preparation', label: 'En preparación' },
  { value: 'active', label: 'Activos' },
  { value: 'finished', label: 'Finalizados' },
  { value: 'cancelled', label: 'Cancelados' }
];

export function EventsList({ events }: { events: Event[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Event | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-MX');
    return events.filter((event) => {
      const matchesFilter = filter === 'all' || getEventStatusPresentation(event.status).group === filter;
      const matchesSearch = !term || (event.name ?? '').toLocaleLowerCase('es-MX').includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [events, filter, search]);

  return (
    <section aria-labelledby="events-list-title">
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        sx={{ gap: 2, justifyContent: 'space-between', alignItems: { xs: 'stretch', lg: 'center' }, mb: 2 }}
      >
        <Typography id="events-list-title" component="h2" variant="h3">
          Tus Eventos
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' } }}>
          <TextField
            size="small"
            label="Buscar por nombre"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
          />
          <Box sx={{ maxWidth: '100%', overflowX: 'auto', pb: 0.5 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={filter}
              onChange={(_, value: Filter | null) => {
                if (value) setFilter(value);
              }}
              aria-label="Filtrar Eventos"
            >
              {filters.map((item) => (
                <ToggleButton key={item.value} value={item.value} aria-label={item.label}>
                  {item.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </Stack>

      {visible.length === 0 ? (
        <EmptyState
          title={
            events.length ? 'No hay Eventos que coincidan con tu búsqueda.' : 'Aún no tienes eventos para mostrar.'
          }
        />
      ) : (
        <>
          <TableContainer sx={{ display: { xs: 'none', md: 'block' }, borderTop: 1, borderColor: 'divider' }}>
            <Table aria-label="Eventos">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Tipo social</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Capacidad</TableCell>
                  <TableCell>Última actualización</TableCell>
                  <TableCell align="right">Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((event) => {
                  const presentation = getEventStatusPresentation(event.status);
                  return (
                    <TableRow key={event.id} hover>
                      <TableCell sx={{ fontWeight: 650 }}>{event.name ?? 'Evento sin nombre'}</TableCell>
                      <TableCell>{event.socialType ? socialTypeLabels[event.socialType] : 'Pendiente'}</TableCell>
                      <TableCell>{formatEventDate(event.eventDateTime, event.timeZone)}</TableCell>
                      <TableCell>
                        <StatusChip label={presentation.label} tone={presentation.tone} />
                      </TableCell>
                      <TableCell align="right">{event.capacity ?? 'Pendiente'}</TableCell>
                      <TableCell>{formatEventDate(event.updatedAt, event.timeZone, true)}</TableCell>
                      <TableCell align="right">
                        {['DRAFT', 'CONFIGURED'].includes(event.status) ? (
                          <Button component={Link} to={`/eventos/${event.id}/configuracion/datos`}>
                            Continuar configuración
                          </Button>
                        ) : event.status === 'READY_TO_ACTIVATE' ? (
                          <Button component={Link} to={`/eventos/${event.id}/configuracion/revision`}>
                            Activar evento
                          </Button>
                        ) : (
                          <Button onClick={() => setSelected(event)}>Ver evento</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box aria-label="Eventos en tarjetas" sx={{ display: { xs: 'block', md: 'none' } }}>
            {visible.map((event) => (
              <EventCard key={event.id} event={event} onView={setSelected} />
            ))}
          </Box>
        </>
      )}

      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, p: 3 } } }}
      >
        {selected ? (
          <Stack spacing={3}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography component="h2" variant="h3">
                Resumen del Evento
              </Typography>
              <IconButton aria-label="Cerrar resumen" onClick={() => setSelected(null)}>
                <CloseRounded />
              </IconButton>
            </Stack>
            <Typography component="h3" variant="h2">
              {selected.name ?? 'Evento sin nombre'}
            </Typography>
            <EventDetails event={selected} />
            <Button onClick={() => setSelected(null)}>Cerrar</Button>
          </Stack>
        ) : null}
      </Drawer>
    </section>
  );
}

function EventDetails({ event }: { event: Event }) {
  const presentation = getEventStatusPresentation(event.status);
  const rows = [
    ['Estado', presentation.label],
    ['Tipo social', event.socialType ? socialTypeLabels[event.socialType] : 'Pendiente'],
    ['Fecha', formatEventDate(event.eventDateTime, event.timeZone, true)],
    ['Capacidad', event.capacity?.toString() ?? 'Pendiente'],
    ['Última actualización', formatEventDate(event.updatedAt, event.timeZone, true)]
  ];
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography component="dt" variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography component="dd" sx={{ m: 0, mt: 0.5 }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
