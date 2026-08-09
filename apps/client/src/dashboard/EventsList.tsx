import { useMemo, useState } from 'react';
import type { Event } from '@invitaciones/api-client';
import { EmptyState, StatusChip } from '@invitaciones/ui';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Box,
  Button,
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
                  <TableCell>Tipo de evento</TableCell>
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
                          <Button component={Link} to={`/eventos/${event.id}`}>
                            Ver evento
                          </Button>
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
              <EventCard key={event.id} event={event} />
            ))}
          </Box>
        </>
      )}
    </section>
  );
}
