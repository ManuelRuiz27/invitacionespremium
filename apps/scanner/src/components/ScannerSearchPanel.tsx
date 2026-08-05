import { useState } from 'react';
import type { ScannerInvitationResult, ScannerSearchResponse } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography
} from '@mui/material';

export interface ScannerSearchPanelProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  result: ScannerSearchResponse | null;
  errorMessage?: string | null;
  onSelectResult: (result: ScannerInvitationResult) => void;
}

export function ScannerSearchPanel({
  onSearch,
  isLoading,
  result,
  errorMessage,
  onSelectResult
}: ScannerSearchPanelProps) {
  const [query, setQuery] = useState('');
  const submit = () => {
    const normalized = query.trim().replace(/\s+/g, ' ');
    if (normalized) onSearch(normalized);
  };

  return (
    <Box component="section" aria-labelledby="manual-search-title">
      <Typography id="manual-search-title" variant="h2" sx={{ mb: 2 }}>
        Búsqueda exacta
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          fullWidth
          label="Nombre exacto del Contacto o Asistente"
          value={query}
          slotProps={{ htmlInput: { maxLength: 160 } }}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <Button
          variant="contained"
          size="large"
          onClick={submit}
          disabled={isLoading || !query.trim()}
          sx={{ minHeight: 48 }}
        >
          Buscar
        </Button>
      </Stack>
      {isLoading ? <CircularProgress aria-label="Buscando" sx={{ display: 'block', mx: 'auto', mt: 3 }} /> : null}
      {errorMessage ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {errorMessage}
        </Alert>
      ) : null}
      {result?.status === 'NO_MATCHES' ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          No se encontraron coincidencias exactas.
        </Alert>
      ) : null}
      {result?.status === 'MATCHES' ? (
        <List aria-label="Resultados de búsqueda" sx={{ mt: 2 }}>
          {result.results.map((item) => (
            <ListItemButton
              key={item.invitation.id}
              onClick={() => onSelectResult(item)}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1, minHeight: 56 }}
            >
              <ListItemText
                primary={
                  item.pendingAssistants.map((assistant) => assistant.name).join(', ') || 'Sin Asistentes pendientes'
                }
                secondary={`${item.pendingCount} pendiente(s) de ${item.confirmedCount} confirmado(s)`}
              />
            </ListItemButton>
          ))}
        </List>
      ) : null}
    </Box>
  );
}
