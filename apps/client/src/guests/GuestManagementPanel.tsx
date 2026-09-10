import type { ApiClient, Contact, Event } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptManager, isUncertainFailure } from '../shared/attempt-manager';
import { downloadBlob, errorMessage } from '../shared/client-utils';

type ContactForm = { name: string; whatsappPhone: string; groupId: string };

const blank: ContactForm = { name: '', whatsappPhone: '', groupId: '' };
const mutableStatuses = new Set<Event['status']>(['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE']);

export function GuestManagementPanel({
  apiClient,
  event,
  readOnly = false
}: {
  apiClient: ApiClient;
  event: Event;
  readOnly?: boolean;
}) {
  const attempts = useRef(new AttemptManager());
  const refreshSequence = useRef(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitations, setInvitations] = useState<Awaited<ReturnType<ApiClient['invitations']['list']>>>([]);
  const [groups, setGroups] = useState<Awaited<ReturnType<ApiClient['contacts']['groups']>>>([]);
  const [form, setForm] = useState<ContactForm>(blank);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contact>();
  const [editForm, setEditForm] = useState<ContactForm>(blank);
  const [deleting, setDeleting] = useState<Contact>();
  const [preview, setPreview] = useState<Awaited<ReturnType<ApiClient['contacts']['preview']>>>();
  const [error, setError] = useState<string>();
  const canMutate = !readOnly && mutableStatuses.has(event.status);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const [nextContacts, nextGroups, nextInvitations] = await Promise.all([
        apiClient.contacts.list(event.id),
        apiClient.contacts.groups(event.id),
        apiClient.invitations.list(event.id)
      ]);
      if (sequence !== refreshSequence.current) return;
      setContacts(nextContacts);
      setGroups(nextGroups);
      setInvitations(nextInvitations);
      setError(undefined);
    } catch (reason) {
      if (sequence !== refreshSequence.current) return;
      setError(errorMessage(reason));
    }
  }, [apiClient, event.id]);

  useEffect(() => {
    setContacts([]);
    setGroups([]);
    setInvitations([]);
    setSearch('');
    setPreview(undefined);
    void refresh();
    return () => {
      refreshSequence.current += 1;
    };
  }, [refresh]);

  const filteredContacts = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.whatsappPhone].some((value) => value && normalizeSearch(value).includes(query))
    );
  }, [contacts, search]);

  const authorized = invitations.reduce((total, invitation) => total + invitation.assistants.length, 0);
  const remaining = event.capacity === null ? null : event.capacity - authorized;
  const setField = (field: keyof ContactForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const setEditField = (field: keyof ContactForm, value: string) =>
    setEditForm((current) => ({ ...current, [field]: value }));

  const commitPreview = async () => {
    if (!preview || !canMutate) return;
    const attempt = attempts.current.start('csv', preview.previewId);
    try {
      await apiClient.contacts.commit(event.id, preview.previewId, attempt.key);
      attempts.current.clear('csv', attempt.key);
      setPreview(undefined);
      await refresh();
    } catch (reason) {
      if (!isUncertainFailure(reason)) attempts.current.clear('csv', attempt.key);
      setError(errorMessage(reason));
    }
  };

  return (
    <Stack data-testid="guest-management-panel" spacing={2} sx={{ maxWidth: 920 }}>
      <Typography component="h2" variant="h3">
        Invitados
      </Typography>
      <Typography color={remaining !== null && remaining < 0 ? 'error' : 'text.secondary'}>
        Invitaciones: {invitations.length} · Personas contempladas: {authorized}
        {remaining === null ? '' : ` · Lugares disponibles: ${remaining}`}
      </Typography>
      {!canMutate ? (
        <Alert severity="info">La lista de invitados está disponible en modo de consulta para este evento.</Alert>
      ) : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField label="Buscar invitado" value={search} onChange={(event) => setSearch(event.target.value)} />

      {canMutate ? (
        <>
          <Stack
            component="form"
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void apiClient.contacts
                .create(event.id, {
                  name: form.name,
                  whatsappPhone: form.whatsappPhone,
                  groupId: form.groupId || null
                })
                .then(() => {
                  setForm(blank);
                  return refresh();
                })
                .catch((reason) => setError(errorMessage(reason)));
            }}
          >
            <TextField
              required
              label="Nombre"
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
            />
            <TextField
              required
              label="Número de WhatsApp"
              value={form.whatsappPhone}
              onChange={(event) => setField('whatsappPhone', event.target.value)}
            />
            <TextField
              select
              label="Grupo"
              value={form.groupId}
              onChange={(event) => setField('groupId', event.target.value)}
            >
              <MenuItem value="">Sin grupo</MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </TextField>
            <Button type="submit" variant="contained">
              Agregar
            </Button>
          </Stack>

          <Stack
            component="form"
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void apiClient.contacts
                .createGroup(event.id, { name: groupName })
                .then(() => {
                  setGroupName('');
                  return refresh();
                })
                .catch((reason) => setError(errorMessage(reason)));
            }}
          >
            <TextField
              required
              label="Nuevo grupo"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <Button type="submit">Crear grupo</Button>
          </Stack>
        </>
      ) : null}

      <Box component="ul" aria-label="Lista de invitados" sx={{ m: 0 }}>
        {filteredContacts.map((contact) => (
          <li key={contact.id}>
            <Typography component="span">
              {contact.name ?? 'Contacto anonimizado'} · {contact.whatsappPhone ?? 'Sin teléfono'}
            </Typography>{' '}
            {canMutate ? (
              <>
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(contact);
                    setEditForm({
                      name: contact.name ?? '',
                      whatsappPhone: contact.whatsappPhone ?? '',
                      groupId: contact.groupId ?? ''
                    });
                  }}
                >
                  Editar
                </Button>
                <Button size="small" color="error" onClick={() => setDeleting(contact)}>
                  Eliminar
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </Box>
      {contacts.length > 0 && filteredContacts.length === 0 ? (
        <Typography color="text.secondary">No encontramos invitados con esa búsqueda.</Typography>
      ) : null}

      {canMutate ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            onClick={() =>
              void apiClient.contacts
                .template(event.id)
                .then((blob) => downloadBlob(blob, 'contactos.csv'))
                .catch((reason) => setError(errorMessage(reason)))
            }
          >
            Descargar plantilla
          </Button>
          <Button component="label">
            Importar lista
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(changeEvent) => {
                const file = changeEvent.target.files?.[0];
                if (file)
                  void apiClient.contacts
                    .preview(event.id, file)
                    .then((value) => {
                      attempts.current.clear('csv');
                      setPreview(value);
                    })
                    .catch((reason) => setError(errorMessage(reason)));
              }}
            />
          </Button>
        </Stack>
      ) : null}

      {preview && canMutate ? (
        <Box>
          <Alert severity={preview.invalidRows ? 'warning' : 'success'}>
            {preview.validRows} registros listos para importar · {preview.invalidRows} necesitan corrección
          </Alert>
          <Box component="ol">
            {preview.rows.map((row) => (
              <li key={row.rowNumber}>
                Fila {row.rowNumber}: {row.name ?? 'sin nombre'} · {row.normalizedPhone ?? 'sin teléfono'} ·{' '}
                {row.group ?? 'sin grupo'}
                {row.errors.length ? ` — ${row.errors.join('; ')}` : ' — válida'}
              </li>
            ))}
          </Box>
          <Button disabled={preview.validRows === 0 || preview.invalidRows > 0} onClick={() => void commitPreview()}>
            Confirmar importación
          </Button>
        </Box>
      ) : null}

      <Dialog
        open={canMutate && Boolean(editing)}
        onClose={() => setEditing(undefined)}
        aria-labelledby="edit-contact-title"
      >
        <DialogTitle id="edit-contact-title">Editar Contacto</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Nombre"
              value={editForm.name}
              onChange={(event) => setEditField('name', event.target.value)}
            />
            <TextField
              label="Número de WhatsApp"
              value={editForm.whatsappPhone}
              onChange={(event) => setEditField('whatsappPhone', event.target.value)}
            />
            <TextField
              select
              label="Grupo"
              value={editForm.groupId}
              onChange={(event) => setEditField('groupId', event.target.value)}
            >
              <MenuItem value="">Sin grupo</MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id}>
                  {group.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(undefined)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!editing || !canMutate) return;
              void apiClient.contacts
                .update(event.id, editing.id, {
                  name: editForm.name,
                  whatsappPhone: editForm.whatsappPhone,
                  groupId: editForm.groupId || null
                })
                .then(() => {
                  setEditing(undefined);
                  setEditForm(blank);
                  return refresh();
                })
                .catch((reason) => setError(errorMessage(reason)));
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={canMutate && Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        aria-labelledby="delete-contact-title"
      >
        <DialogTitle id="delete-contact-title">Eliminar Contacto</DialogTitle>
        <DialogContent>
          Se eliminará {deleting?.name ?? 'este Contacto'} y sus recursos dependientes permitidos.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(undefined)}>Cancelar</Button>
          <Button
            color="error"
            onClick={() => {
              if (!deleting || !canMutate) return;
              void apiClient.contacts
                .remove(event.id, deleting.id)
                .then(() => {
                  setDeleting(undefined);
                  return refresh();
                })
                .catch((reason) => setError(errorMessage(reason)));
            }}
          >
            Confirmar eliminación
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}
