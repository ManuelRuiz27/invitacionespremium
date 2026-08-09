import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import { Button, Chip, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useDeferredValue, useMemo, useState } from 'react';
import type { PendingTable } from './floorplan-inventory';

export function FloorplanTray({
  tables,
  activeId,
  disabled,
  onChoose,
  onAutoPlace
}: {
  tables: readonly PendingTable[];
  activeId?: string | undefined;
  disabled: boolean;
  onChoose: (id: string) => void;
  onAutoPlace: () => void;
}) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase('es-MX'));
  const visible = useMemo(
    () => tables.filter((table) => table.input.name.toLocaleLowerCase('es-MX').includes(deferredSearch)),
    [deferredSearch, tables]
  );

  if (tables.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }} component="section" aria-labelledby="tray-title">
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between' }}>
          <Stack spacing={0.25}>
            <Typography component="h3" variant="h4" id="tray-title">
              Mesas sin colocar ({tables.length})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Elige una Mesa y toca el plano, o arrástrala. Estas mesas todavía no se han enviado a la API.
            </Typography>
          </Stack>
          <Button
            variant="outlined"
            startIcon={<AutoAwesomeRounded />}
            disabled={disabled}
            onClick={onAutoPlace}
            sx={{ minHeight: 44, alignSelf: { md: 'flex-start' } }}
          >
            Colocar automáticamente
          </Button>
        </Stack>
        <TextField
          label="Buscar mesa pendiente"
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRounded />
                </InputAdornment>
              )
            }
          }}
        />
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ flexWrap: 'wrap', maxHeight: 180, overflow: 'auto', py: 0.5 }}
        >
          {visible.map((table) => (
            <Chip
              key={table.temporaryId}
              icon={<PlaceRounded />}
              label={`${table.input.name} · ${table.input.capacity}`}
              color={activeId === table.temporaryId ? 'primary' : 'default'}
              variant={activeId === table.temporaryId ? 'filled' : 'outlined'}
              clickable
              draggable={!disabled}
              aria-pressed={activeId === table.temporaryId}
              onClick={() => onChoose(table.temporaryId)}
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-floorplan-pending-table', table.temporaryId);
                event.dataTransfer.effectAllowed = 'move';
              }}
              sx={{ minHeight: 44, '& .MuiChip-label': { px: 1.5 } }}
            />
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
