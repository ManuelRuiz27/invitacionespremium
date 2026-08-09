import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { Box, Button, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useDeferredValue, useMemo, useState } from 'react';
import type { PendingTable } from './floorplan-inventory';
import { floorplanColors } from './floorplan-sticker-style';

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
    <Box
      component="section"
      aria-labelledby="tray-title"
      sx={{
        borderTop: `1px solid ${floorplanColors.line}`,
        bgcolor: floorplanColors.paper,
        px: { xs: 1.5, sm: 2 },
        py: 1.5
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography component="h3" variant="subtitle2" id="tray-title">
              Por colocar · {tables.length}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Selecciona y toca el plano, o arrastra una mesa.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="text"
            startIcon={<AutoAwesomeRounded />}
            disabled={disabled}
            onClick={onAutoPlace}
            sx={{ minHeight: 44, flexShrink: 0 }}
          >
            Colocar automáticamente
          </Button>
        </Stack>

        {tables.length > 12 ? (
          <TextField
            size="small"
            label="Buscar mesa pendiente"
            value={search}
            disabled={disabled}
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
        ) : null}

        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ flexWrap: 'nowrap', overflowX: 'auto', pb: 0.5, scrollbarWidth: 'thin' }}
        >
          {visible.map((table) => {
            const active = activeId === table.temporaryId;
            return (
              <Button
                key={table.temporaryId}
                variant={active ? 'contained' : 'outlined'}
                color="primary"
                disabled={disabled}
                draggable={!disabled}
                aria-pressed={active}
                onClick={() => onChoose(table.temporaryId)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-floorplan-pending-table', table.temporaryId);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                startIcon={<DragIndicatorRounded fontSize="small" />}
                sx={{ minHeight: 44, minWidth: 112, flexShrink: 0, justifyContent: 'flex-start' }}
              >
                <Stack component="span" sx={{ textAlign: 'left', lineHeight: 1.15 }}>
                  <span>{table.input.name}</span>
                  <Typography component="span" variant="caption" color={active ? 'inherit' : 'text.secondary'}>
                    {table.input.capacity} lugares
                  </Typography>
                </Stack>
              </Button>
            );
          })}
        </Stack>
      </Stack>
    </Box>
  );
}
