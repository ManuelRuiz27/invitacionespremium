import { useState } from 'react';
import type { AdminClientUser, ApiClient } from '@invitaciones/api-client';
import { PageHeader, StatusChip } from '@invitaciones/ui';
import { ArrowBackOutlined, PersonAddOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { adminQueryKeys } from '../app/query-client';
import { AdminClientFinancePanel } from '../finance/AdminClientFinancePanel';
import { adminErrorMessage } from '../shared/admin-error';
import { clientStatusLabel, clientTypeLabel, formatDate, userRoleLabel } from '../shared/admin-labels';
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from '../shared/AdminStates';
import { ConfirmSensitiveActionDialog } from '../shared/ConfirmSensitiveActionDialog';
import { isAbortError, type AdminScopedOperation, useAdminOperationScope } from '../shared/useAdminOperationScope';

type ClientAction = 'rename' | 'suspend' | 'restore' | 'planner' | null;
type ClientMutationRequest =
  | { operation: AdminScopedOperation; kind: 'user'; userId: string; email: string; password: string }
  | { operation: AdminScopedOperation; kind: 'rename'; name: string }
  | { operation: AdminScopedOperation; kind: 'suspend'; reason: string }
  | { operation: AdminScopedOperation; kind: 'restore' }
  | { operation: AdminScopedOperation; kind: 'planner'; email: string; password: string };

export function AdminClientDetailPage({ apiClient }: { apiClient: ApiClient }) {
  const { clientId = '' } = useParams();
  return <AdminClientDetail key={clientId} apiClient={apiClient} clientId={clientId} />;
}

function AdminClientDetail({ apiClient, clientId }: { apiClient: ApiClient; clientId: string }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ClientAction>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingUser, setEditingUser] = useState<AdminClientUser | null>(null);
  const [error, setError] = useState<string>();
  const operationScope = useAdminOperationScope('client', clientId);
  const client = useQuery({
    queryKey: adminQueryKeys.client(clientId),
    queryFn: ({ signal }) => apiClient.adminClients.get(clientId, signal),
    enabled: Boolean(clientId)
  });
  const users = useQuery({
    queryKey: adminQueryKeys.clientUsers(clientId),
    queryFn: ({ signal }) => apiClient.adminClients.listUsers(clientId, signal),
    enabled: Boolean(clientId)
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.client(clientId) }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clients }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clientUsers(clientId) })
    ]);
  };
  const mutation = useMutation({
    mutationFn: async (request: ClientMutationRequest) => {
      const { signal } = request.operation;
      if (request.kind === 'user')
        return apiClient.adminClients.updateUser(
          clientId,
          request.userId,
          {
            ...(request.email ? { email: request.email } : {}),
            ...(request.password ? { password: request.password } : {})
          },
          signal
        );
      if (request.kind === 'rename') return apiClient.adminClients.update(clientId, { name: request.name }, signal);
      if (request.kind === 'suspend')
        return apiClient.adminClients.suspend(clientId, request.reason ? { reason: request.reason } : {}, signal);
      if (request.kind === 'restore') return apiClient.adminClients.restore(clientId, signal);
      return apiClient.adminClients.createPlanner(
        clientId,
        { email: request.email, password: request.password },
        signal
      );
    },
    onSuccess: async (_result, request) => {
      if (!request.operation.isCurrent()) return;
      await refresh();
      if (!request.operation.isCurrent()) return;
      request.operation.finish();
      closeDialog();
    },
    onError: (cause, request) => {
      if (request.operation.isCurrent() && !isAbortError(cause)) setError(adminErrorMessage(cause).message);
      request.operation.finish();
    }
  });

  function submitMutation() {
    const operation = operationScope.begin();
    if (!operation) return;
    setError(undefined);
    if (editingUser) {
      mutation.mutate({
        operation,
        kind: 'user',
        userId: editingUser.id,
        email: email.trim(),
        password
      });
      return;
    }
    if (action === 'rename') mutation.mutate({ operation, kind: 'rename', name: name.trim() });
    else if (action === 'suspend') mutation.mutate({ operation, kind: 'suspend', reason: reason.trim() });
    else if (action === 'restore') mutation.mutate({ operation, kind: 'restore' });
    else if (action === 'planner') mutation.mutate({ operation, kind: 'planner', email: email.trim(), password });
    else operation.finish();
  }

  function closeDialog() {
    setAction(null);
    setEditingUser(null);
    setError(undefined);
    setEmail('');
    setPassword('');
    setReason('');
  }
  if (client.isPending) return <AdminLoadingState label="Cargando detalle del Cliente..." />;
  if (client.isError) return <AdminErrorState onRetry={() => void client.refetch()} />;
  const data = client.data;
  const dialogAction = editingUser ? 'user' : action;
  return (
    <Stack spacing={4}>
      <Button component={Link} to="/clientes" startIcon={<ArrowBackOutlined />} sx={{ alignSelf: 'flex-start' }}>
        Volver a Clientes
      </Button>
      <PageHeader
        title={data.name}
        description={`${clientTypeLabel[data.type]} · creado ${formatDate(data.createdAt)}`}
        action={
          <StatusChip label={clientStatusLabel[data.status]} tone={data.status === 'ACTIVE' ? 'success' : 'warning'} />
        }
      />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h2">Cuenta</Typography>
            {data.status === 'SUSPENDED' ? (
              <Alert severity="warning">
                Suspendido {data.suspendedAt ? formatDate(data.suspendedAt) : ''}
                {data.suspensionReason ? `: ${data.suspensionReason}` : ''}
              </Alert>
            ) : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                onClick={() => {
                  setName(data.name);
                  setAction('rename');
                }}
              >
                Editar nombre
              </Button>
              {data.status === 'ACTIVE' ? (
                <Button color="error" onClick={() => setAction('suspend')}>
                  Suspender Cliente
                </Button>
              ) : (
                <Button onClick={() => setAction('restore')}>Restaurar Cliente</Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h2">Usuarios</Typography>
                <Typography color="text.secondary">Identidades asociadas al Cliente.</Typography>
              </Box>
              {data.type === 'ORGANIZATION' ? (
                <Button startIcon={<PersonAddOutlined />} onClick={() => setAction('planner')}>
                  Agregar planner
                </Button>
              ) : null}
            </Stack>
            <Divider />
            {users.isPending ? (
              <AdminLoadingState label="Cargando usuarios..." />
            ) : users.isError ? (
              <AdminErrorState onRetry={() => void users.refetch()} />
            ) : users.data.length === 0 ? (
              <AdminEmptyState title="Sin usuarios" />
            ) : (
              users.data.map((user) => (
                <Stack
                  key={user.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{user.email}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {userRoleLabel[user.role]}
                    </Typography>
                  </Box>
                  <Button
                    onClick={() => {
                      setEditingUser(user);
                      setEmail(user.email);
                    }}
                  >
                    Editar acceso
                  </Button>
                </Stack>
              ))
            )}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <AdminClientFinancePanel apiClient={apiClient} clientId={clientId} />
        </CardContent>
      </Card>
      <ConfirmSensitiveActionDialog
        open={Boolean(dialogAction)}
        title={
          dialogAction === 'rename'
            ? 'Editar Cliente'
            : dialogAction === 'suspend'
              ? 'Suspender Cliente'
              : dialogAction === 'restore'
                ? 'Restaurar Cliente'
                : dialogAction === 'planner'
                  ? 'Crear planner'
                  : 'Editar usuario'
        }
        description={
          dialogAction === 'suspend'
            ? 'La cuenta dejara de operar hasta que un Platform Admin la restaure.'
            : dialogAction === 'restore'
              ? 'El Cliente recuperara el acceso operativo.'
              : 'Confirma los datos antes de continuar.'
        }
        confirmLabel={dialogAction === 'suspend' ? 'Suspender' : dialogAction === 'restore' ? 'Restaurar' : 'Guardar'}
        destructive={dialogAction === 'suspend'}
        busy={mutation.isPending}
        {...(error ? { error } : {})}
        onClose={closeDialog}
        onConfirm={submitMutation}
      >
        {dialogAction === 'rename' ? (
          <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        ) : null}
        {dialogAction === 'suspend' ? (
          <TextField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} multiline />
        ) : null}
        {dialogAction === 'planner' || dialogAction === 'user' ? (
          <>
            <TextField label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField
              label={dialogAction === 'user' ? 'Nueva contrasena (opcional)' : 'Contrasena temporal'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        ) : null}
      </ConfirmSensitiveActionDialog>
    </Stack>
  );
}
