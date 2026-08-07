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
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttemptManager, isUncertainFailure } from '../wizard-model';
import { downloadBlob, errorMessage } from '../wizard-utils';

type ContactForm = { name: string; whatsappPhone: string; groupId: string };
const blank: ContactForm = { name: '', whatsappPhone: '', groupId: '' };

export function ContactsStep({
  apiClient,
  event,
  disabled
}: {
  apiClient: ApiClient;
  event: Event;
  disabled: boolean;
}) {
  const attempts = useRef(new AttemptManager());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitations, setInvitations] = useState<Awaited<ReturnType<ApiClient['invitations']['list']>>>([]);
  const [groups, setGroups] = useState<Awaited<ReturnType<ApiClient['contacts']['groups']>>>([]);
  const [form, setForm] = useState<ContactForm>(blank);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contact>();
  const [deleting, setDeleting] = useState<Contact>();
  const [preview, setPreview] = useState<Awaited<ReturnType<ApiClient['contacts']['preview']>>>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    try {
      const [nextContacts, nextGroups, nextInvitations] = await Promise.all([
        apiClient.contacts.list(event.id, search),
        apiClient.contacts.groups(event.id),
        apiClient.invitations.list(event.id)
      ]);
      setContacts(nextContacts);
      setGroups(nextGroups);
      setInvitations(nextInvitations);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [apiClient, event.id, search]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const authorized = invitations.reduce((total, invitation) => total + invitation.assistants.length, 0);
  const remaining = event.capacity === null ? null : event.capacity - authorized;
  const setField = (field: keyof ContactForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const commitPreview = async () => {
    if (!preview) return;
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
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Invitados
      </Typography>
      <Typography color={remaining !== null && remaining < 0 ? 'error' : 'text.secondary'}>
        Invitaciones: {invitations.length} · Personas contempladas: {authorized}
        {remaining === null ? '' : ` · Lugares disponibles: ${remaining}`}
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <TextField label="Buscar invitado" value={search} onChange={(e) => setSearch(e.target.value)} />
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        onSubmit={(e) => {
          e.preventDefault();
          void apiClient.contacts
            .create(event.id, { name: form.name, whatsappPhone: form.whatsappPhone, groupId: form.groupId || null })
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
          disabled={disabled}
          onChange={(e) => setField('name', e.target.value)}
        />
        <TextField
          required
          label="Número de WhatsApp"
          value={form.whatsappPhone}
          disabled={disabled}
          onChange={(e) => setField('whatsappPhone', e.target.value)}
        />
        <TextField
          select
          label="Grupo"
          value={form.groupId}
          disabled={disabled}
          onChange={(e) => setField('groupId', e.target.value)}
        >
          <MenuItem value="">Sin grupo</MenuItem>
          {groups.map((group) => (
            <MenuItem key={group.id} value={group.id}>
              {group.name}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" disabled={disabled}>
          Agregar
        </Button>
      </Stack>
      <Stack
        component="form"
        direction="row"
        spacing={1}
        onSubmit={(e) => {
          e.preventDefault();
          void apiClient.contacts.createGroup(event.id, { name: groupName }).then(() => {
            setGroupName('');
            return refresh();
          });
        }}
      >
        <TextField
          required
          label="Nuevo grupo"
          value={groupName}
          disabled={disabled}
          onChange={(e) => setGroupName(e.target.value)}
        />
        <Button type="submit" disabled={disabled}>
          Crear grupo
        </Button>
      </Stack>
      <Box component="ul" sx={{ m: 0 }}>
        {contacts.map((contact) => (
          <li key={contact.id}>
            <Typography component="span">
              {contact.name ?? 'Contacto anonimizado'} · {contact.whatsappPhone ?? 'Sin teléfono'}
            </Typography>{' '}
            <Button
              size="small"
              disabled={disabled}
              onClick={() => {
                setEditing(contact);
                setForm({
                  name: contact.name ?? '',
                  whatsappPhone: contact.whatsappPhone ?? '',
                  groupId: contact.groupId ?? ''
                });
              }}
            >
              Editar
            </Button>
            <Button size="small" color="error" disabled={disabled} onClick={() => setDeleting(contact)}>
              Eliminar
            </Button>
          </li>
        ))}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button
          onClick={() => void apiClient.contacts.template(event.id).then((blob) => downloadBlob(blob, 'contactos.csv'))}
        >
          Descargar plantilla
        </Button>
        <Button component="label" disabled={disabled}>
          Importar lista
          <input
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
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
      {preview ? (
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
          <Button
            disabled={disabled || preview.validRows === 0 || preview.invalidRows > 0}
            onClick={() => void commitPreview()}
          >
            Confirmar importación
          </Button>
        </Box>
      ) : null}
      <Dialog open={Boolean(editing)} onClose={() => setEditing(undefined)} aria-labelledby="edit-contact-title">
        <DialogTitle id="edit-contact-title">Editar Contacto</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Nombre" value={form.name} onChange={(e) => setField('name', e.target.value)} />
            <TextField
              label="Número de WhatsApp"
              value={form.whatsappPhone}
              onChange={(e) => setField('whatsappPhone', e.target.value)}
            />
            <TextField select label="Grupo" value={form.groupId} onChange={(e) => setField('groupId', e.target.value)}>
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
              if (!editing) return;
              void apiClient.contacts
                .update(event.id, editing.id, {
                  name: form.name,
                  whatsappPhone: form.whatsappPhone,
                  groupId: form.groupId || null
                })
                .then(() => {
                  setEditing(undefined);
                  setForm(blank);
                  return refresh();
                });
            }}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(deleting)} onClose={() => setDeleting(undefined)} aria-labelledby="delete-contact-title">
        <DialogTitle id="delete-contact-title">Eliminar Contacto</DialogTitle>
        <DialogContent>
          Se eliminará {deleting?.name ?? 'este Contacto'} y sus recursos dependientes permitidos.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(undefined)}>Cancelar</Button>
          <Button
            color="error"
            onClick={() => {
              if (!deleting) return;
              void apiClient.contacts.remove(event.id, deleting.id).then(() => {
                setDeleting(undefined);
                return refresh();
              });
            }}
          >
            Confirmar eliminación
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
