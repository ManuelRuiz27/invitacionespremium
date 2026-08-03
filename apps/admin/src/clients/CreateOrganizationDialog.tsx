import { useRef, useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminQueryKeys } from '../app/query-client';
import { adminErrorMessage } from '../shared/admin-error';

export function CreateOrganizationDialog({
  apiClient,
  open,
  onClose
}: {
  apiClient: ApiClient;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const lock = useRef(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => apiClient.adminClients.createOrganization({ name, adminEmail: email, adminPassword: password }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.clients });
      setName('');
      setEmail('');
      setPassword('');
      onClose();
    },
    onError: (cause) => setError(adminErrorMessage(cause).message),
    onSettled: () => {
      lock.current = false;
    }
  });
  const submit = () => {
    if (lock.current) return;
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      setError('Completa nombre, correo valido y una contrasena de al menos 8 caracteres.');
      return;
    }
    lock.current = true;
    setError('');
    mutation.mutate();
  };
  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Crear organizacion</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Nombre de la organizacion"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label="Correo del Administrador de organizacion"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <TextField
            label="Contrasena inicial"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={submit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Creando...' : 'Crear organizacion'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
