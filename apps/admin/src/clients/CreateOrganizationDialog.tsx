import { useRef, useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const lock = useRef(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [operatingProfile, setOperatingProfile] = useState<'MANAGED' | 'SELF_SERVICE'>('MANAGED');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      apiClient.adminClients.createOrganization({ name, adminEmail: email, adminPassword: password, operatingProfile }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.clients });
      setName('');
      setEmail('');
      setPassword('');
      setOperatingProfile('MANAGED');
      onClose();
      await navigate(`/clientes/${result.client.id}`);
    },
    onError: (cause) => setError(adminErrorMessage(cause).message),
    onSettled: () => {
      lock.current = false;
    }
  });
  const submit = () => {
    if (lock.current) return;
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      setError('Completa nombre, correo valido y una contraseña de al menos 8 caracteres.');
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
            label="Contraseña inicial"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <TextField
            select
            label="Perfil operativo"
            value={operatingProfile}
            disabled={mutation.isPending}
            onChange={(event) => setOperatingProfile(event.target.value as typeof operatingProfile)}
            helperText="El control de acceso B01 requiere el perfil Gestionado."
          >
            <MenuItem value="MANAGED">Gestionado por InvitacionesPremium</MenuItem>
            <MenuItem value="SELF_SERVICE">Autoservicio</MenuItem>
          </TextField>
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
