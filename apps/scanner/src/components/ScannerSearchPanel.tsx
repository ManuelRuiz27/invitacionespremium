import { useState } from 'react';
import { Box, TextField, Button, Typography, List, ListItem, ListItemText, CircularProgress, Alert } from '@mui/material';

export interface ScannerSearchResponse {
  status: 'MATCHES' | 'NO_MATCHES';
  results: {
    confirmedCount: number;
    checkedInCount: number;
    invitation: { id: string; name: string };
  }[];
}

export interface ScannerSearchPanelProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  result: ScannerSearchResponse | null;
  error: unknown;
  onSelectResult: (invitationId: string) => void;
}

export function ScannerSearchPanel({ onSearch, isLoading, result, error, onSelectResult }: ScannerSearchPanelProps) {
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Búsqueda Manual</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Nombre o ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button variant="contained" onClick={handleSearch} disabled={isLoading || !query.trim()}>
          Buscar
        </Button>
      </Box>

      {isLoading && <CircularProgress sx={{ display: 'block', mx: 'auto', mt: 2 }} />}

      {Boolean(error) && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {((error as { body?: { message?: string } })?.body?.message) || 'Error al buscar'}
        </Alert>
      )}

      {result && result.status === 'NO_MATCHES' && (
        <Alert severity="info" sx={{ mt: 2 }}>No se encontraron coincidencias.</Alert>
      )}

      {result && result.status === 'MATCHES' && result.results.length > 0 && (
        <List sx={{ mt: 2 }}>
          {result.results.map((r: { invitation: { id: string, name: string }, confirmedCount: number, checkedInCount: number }) => (
            <ListItem 
              key={r.invitation.id} 
              sx={{ border: '1px solid #ddd', borderRadius: 1, mb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => onSelectResult(r.invitation.id)}
            >
              <ListItemText 
                primary={r.invitation.name || 'Invitación Sin Nombre'} 
                secondary={`Pendientes: ${r.confirmedCount - r.checkedInCount}`}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
