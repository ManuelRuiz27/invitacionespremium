import type { FloorplanShape } from '@invitaciones/api-client';
import { Autocomplete, Box, TextField, createFilterOptions } from '@mui/material';

const filterTables = createFilterOptions<FloorplanShape>({ stringify: (table) => table.name });

export function TableNameSelector({
  tables,
  selectedTable,
  onSelect,
  onClear
}: {
  tables: FloorplanShape[];
  selectedTable: FloorplanShape | undefined;
  onSelect: (table: FloorplanShape) => void;
  onClear: () => void;
}) {
  const label = (table: FloorplanShape) => {
    const matches = tables.filter((candidate) => candidate.name === table.name);
    return matches.length > 1
      ? `${table.name} (${matches.findIndex((candidate) => candidate.id === table.id) + 1}/${matches.length})`
      : table.name;
  };
  return (
    <Autocomplete
      options={tables}
      value={selectedTable ?? null}
      getOptionKey={(table) => table.id}
      getOptionLabel={label}
      isOptionEqualToValue={(table, value) => table.id === value.id}
      filterOptions={filterTables}
      onChange={(_event, table) => (table ? onSelect(table) : onClear())}
      autoHighlight
      clearText="Limpiar mesa seleccionada"
      openText="Abrir lista de mesas"
      closeText="Cerrar lista de mesas"
      noOptionsText="No hay mesas con ese nombre."
      sx={{ width: '100%', maxWidth: 520, minWidth: 0, mb: 2 }}
      slotProps={{
        listbox: { sx: { maxHeight: 'min(320px, 40dvh)', '& .MuiAutocomplete-option': { minHeight: 44 } } },
        clearIndicator: { sx: { minWidth: 44, minHeight: 44 } },
        popupIndicator: { sx: { minWidth: 44, minHeight: 44 } }
      }}
      renderOption={({ key, ...optionProps }, table) => (
        <Box component="li" key={key} {...optionProps} sx={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
          {label(table)}
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label="Buscar o seleccionar mesa" />}
    />
  );
}
