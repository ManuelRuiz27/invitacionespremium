import { useMemo, useState } from 'react';
import type { Event } from '@invitaciones/api-client';
import { EmptyState, StatusChip } from '@invitaciones/ui';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Box,
  Button,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { Link } from 'react-router-dom';
import { getEventStatusPresentation, type EventGroup } from '../shared/event-status';
import { formatEventDate, socialTypeLabels } from '../shared/formatters';

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

  const clearFilters = () => {
    setFilter('all');
    setSearch('');
  };

  return (
    <section aria-label="Lista de Eventos">
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        sx={{ gap: 2, justifyContent: 'space-between', alignItems: { xs: 'stretch', lg: 'center' }, mb: 2 }}
      >
        <Typography component="p" color="text.secondary" variant="body2">
          {events.length === 1 ? '1 evento' : `${events.length} eventos`}
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
          description={
            events.length ? 'Prueba con otra búsqueda o filtro.' : 'Crea un Evento para comenzar a prepararlo.'
          }
          action={events.length ? <Button onClick={clearFilters}>Limpiar búsqueda y filtros</Button> : undefined}
        />
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0, borderTop: 1, borderColor: 'divider', listStyle: 'none' }}>
          {visible.map((event) => {
            const presentation = getEventStatusPresentation(event.status);
            const action = ['DRAFT', 'CONFIGURED'].includes(event.status)
              ? { label: 'Continuar configuración', to: `/eventos/${event.id}/configuracion/datos` }
              : event.status === 'READY_TO_ACTIVATE'
                ? { label: 'Activar evento', to: `/eventos/${event.id}/configuracion/revision` }
                : { label: 'Ver evento', to: `/eventos/${event.id}` };

            return (
              <Box component="li" key={event.id}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  sx={{ py: 2.25, gap: 1.5, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component="h2" variant="h4" sx={{ overflowWrap: 'anywhere' }}>
                      {event.name ?? 'Evento sin nombre'}
                    </Typography>
                    <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
                      {[
                        formatEventDate(event.eventDateTime, event.timeZone),
                        event.socialType ? socialTypeLabels[event.socialType] : null
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', justifyContent: { sm: 'flex-end' } }}
                  >
                    <StatusChip label={presentation.label} tone={presentation.tone} />
                    <Button component={Link} to={action.to} variant="text">
                      {action.label}
                    </Button>
                  </Stack>
                </Stack>
                <Divider />
              </Box>
            );
          })}
        </Box>
      )}
    </section>
  );
}
