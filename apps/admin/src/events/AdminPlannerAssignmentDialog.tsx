import { useRef, useState } from 'react';
import type { AdminClient, AdminEvent, ApiClient } from '@invitaciones/api-client';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';

export function AdminPlannerAssignmentDialog({
  apiClient,
  client,
  event,
  open,
  onClose
}: {
  apiClient: ApiClient;
  client: AdminClient;
  event: AdminEvent;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const [plannerId, setPlannerId] = useState(event.assignedPlannerUserId ?? '');
  const [error, setError] = useState('');
  const users = useQuery({
    queryKey: adminQueryKeys.clientUsers(client.id),
    queryFn: ({ signal }) => apiClient.adminClients.listUsers(client.id, signal),
    enabled: open
  });
  const candidates = (users.data ?? []).filter((user) =>
    client.type === 'PLANNER' ? user.role === 'INDEPENDENT_PLANNER' : user.role === 'ORGANIZATION_PLANNER'
  );
  const update = useMutation({
    mutationFn: () =>
      apiClient.adminEvents.updateAssignment(client.id, event.id, { assignedPlannerUserId: plannerId || null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.event(event.id) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.events })
      ]);
      onClose();
    },
    onError: (cause) => setError(adminErrorMessage(cause).message),
    onSettled: () => {
      lock.current = false;
    }
  });

  function submit() {
    if (lock.current) return;
    if (client.type === 'PLANNER' && !plannerId) {
      setError('Selecciona la Planner independiente responsable.');
      return;
    }
    lock.current = true;
    setError('');
    update.mutate();
  }

  return (
    <Dialog open={open} onClose={update.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Cambiar planner</DialogTitle>
      <DialogContent>
        <TextField
          select
          fullWidth
          label="Planner responsable"
          value={plannerId}
          disabled={users.isPending}
          onChange={(change) => setPlannerId(change.target.value)}
          sx={{ mt: 1 }}
        >
          {client.type === 'ORGANIZATION' ? <MenuItem value="">Sin asignar</MenuItem> : null}
          {candidates.map((user) => (
            <MenuItem key={user.id} value={user.id}>
              {user.email}
            </MenuItem>
          ))}
        </TextField>
        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={update.isPending || users.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar asignación'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
