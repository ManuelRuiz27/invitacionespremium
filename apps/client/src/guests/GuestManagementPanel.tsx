import { ApiError, type ApiClient, type Contact, type Event } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import SearchIcon from '@mui/icons-material/Search';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AttemptManager, isUncertainFailure, type Attempt } from '../shared/attempt-manager';
import { layoutTokens } from '@invitaciones/ui';
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
  const queryClient = useQueryClient();
  const refreshSequence = useRef(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invitations, setInvitations] = useState<Awaited<ReturnType<ApiClient['invitations']['list']>>>([]);
  const [groups, setGroups] = useState<Awaited<ReturnType<ApiClient['contacts']['groups']>>>([]);
  const [form, setForm] = useState<ContactForm>(blank);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Contact>();
  const [selectedGroup, setSelectedGroup] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; contact: Contact }>();
  const [mutationBusy, setMutationBusy] = useState(false);
  const mutationSubmitting = useRef(false);
  const [editorError, setEditorError] = useState<string>();
  const [groupError, setGroupError] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const [importOpen, setImportOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewSequence = useRef(0);
  const currentPreview = useRef<Awaited<ReturnType<ApiClient['contacts']['preview']>> | undefined>(undefined);
  const [importError, setImportError] = useState<string>();
  const [importResult, setImportResult] = useState<Awaited<ReturnType<ApiClient['contacts']['commit']>>>();
  const [templateBusy, setTemplateBusy] = useState(false);
  const [deleting, setDeleting] = useState<Contact>();
  const [preview, setPreview] = useState<Awaited<ReturnType<ApiClient['contacts']['preview']>>>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvUncertain, setCsvUncertain] = useState(false);
  const csvSubmitting = useRef(false);
  const blocker = useBlocker(csvBusy || csvUncertain);
  useBeforeUnload((event) => {
    if (!csvBusy && !csvUncertain) return;
    event.preventDefault();
    event.returnValue = '';
  });
  const nominalAccess = event.serviceCode === 'ACCESS_CONTROL' && event.accessMode === 'NOMINAL';
  const canMutate = !readOnly && mutableStatuses.has(event.status);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const [nextContacts, nextGroups, nextInvitations] = await Promise.all([
        apiClient.contacts.list(event.id),
        apiClient.contacts.groups(event.id),
        nominalAccess ? Promise.resolve([]) : apiClient.invitations.list(event.id)
      ]);
      if (sequence !== refreshSequence.current) return;
      setContacts(nextContacts);
      setGroups(nextGroups);
      setInvitations(nextInvitations);
      setError(undefined);
    } catch (reason) {
      if (sequence !== refreshSequence.current) return;
      setError(errorMessage(reason));
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [apiClient, event.id, nominalAccess]);

  const refreshAfterMutation = async () => {
    await refresh();
    if (!nominalAccess) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['events', event.id] }),
      queryClient.invalidateQueries({ queryKey: ['access-subjects', event.id] }),
      queryClient.invalidateQueries({ queryKey: ['access-material', event.id] }),
      queryClient.invalidateQueries({ queryKey: ['access-readiness', event.id] })
    ]);
  };

  useEffect(() => {
    setContacts([]);
    setGroups([]);
    setInvitations([]);
    setSearch('');
    setSelectedGroup('');
    setPreview(undefined);
    currentPreview.current = undefined;
    previewSequence.current += 1;
    setPreviewBusy(false);
    setEditorOpen(false);
    setImportOpen(false);
    setImportResult(undefined);
    setImportError(undefined);
    setFileName('');
    void refresh();
    return () => {
      refreshSequence.current += 1;
      previewSequence.current += 1;
      currentPreview.current = undefined;
    };
  }, [refresh]);

  const groupNames = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const filteredContacts = useMemo(() => {
    const query = normalizeSearch(search);
    return contacts.filter(
      (contact) =>
        (!selectedGroup || contact.groupId === selectedGroup) &&
        (!query ||
          [contact.name, contact.whatsappPhone, groupNames.get(contact.groupId ?? '')].some(
            (value) => value && normalizeSearch(value).includes(query)
          ))
    );
  }, [contacts, search, selectedGroup, groupNames]);

  const authorized = nominalAccess
    ? contacts.length
    : invitations.reduce((total, invitation) => total + invitation.assistants.length, 0);
  const remaining = event.capacity === null ? null : event.capacity - authorized;
  const setField = (field: keyof ContactForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const openEditor = (contact?: Contact) => {
    setEditing(contact);
    setForm(
      contact
        ? { name: contact.name ?? '', whatsappPhone: contact.whatsappPhone ?? '', groupId: contact.groupId ?? '' }
        : blank
    );
    setEditorError(undefined);
    setGroupError(undefined);
    setCreatingGroup(false);
    setGroupName('');
    setEditorOpen(true);
    setMenu(undefined);
  };

  const saveContact = async () => {
    if (!canMutate || mutationSubmitting.current) return;
    mutationSubmitting.current = true;
    setMutationBusy(true);
    setEditorError(undefined);
    try {
      const payload = {
        name: form.name,
        whatsappPhone: nominalAccess ? form.whatsappPhone || null : form.whatsappPhone,
        groupId: form.groupId || null
      };
      if (editing) await apiClient.contacts.update(event.id, editing.id, payload);
      else await apiClient.contacts.create(event.id, payload);
      setEditorOpen(false);
      setForm(blank);
      await refreshAfterMutation();
    } catch (reason) {
      setEditorError(contactError(reason));
    } finally {
      mutationSubmitting.current = false;
      setMutationBusy(false);
    }
  };

  const saveGroup = async () => {
    if (!canMutate || mutationSubmitting.current || !groupName.trim()) return;
    mutationSubmitting.current = true;
    setMutationBusy(true);
    setGroupError(undefined);
    try {
      const group = await apiClient.contacts.createGroup(event.id, { name: groupName });
      setGroups((current) => [...current.filter((item) => item.id !== group.id), group]);
      setField('groupId', group.id);
      setCreatingGroup(false);
      setGroupName('');
    } catch (reason) {
      setGroupError(contactError(reason));
    } finally {
      mutationSubmitting.current = false;
      setMutationBusy(false);
    }
  };

  const deleteContact = async () => {
    if (!deleting || !canMutate || mutationSubmitting.current) return;
    mutationSubmitting.current = true;
    setMutationBusy(true);
    setDeleteError(undefined);
    try {
      await apiClient.contacts.remove(event.id, deleting.id);
      setDeleting(undefined);
      await refreshAfterMutation();
    } catch (reason) {
      setDeleteError(contactError(reason));
    } finally {
      mutationSubmitting.current = false;
      setMutationBusy(false);
    }
  };

  const selectCsv = async (file: File) => {
    if (!canMutate || csvSubmitting.current || csvUncertain) return;
    const sequence = ++previewSequence.current;
    currentPreview.current = undefined;
    setPreview(undefined);
    setImportError(undefined);
    setImportResult(undefined);
    setFileName(file.name);
    setPreviewBusy(true);
    attempts.current.clear('csv');
    try {
      const value = await apiClient.contacts.preview(event.id, file);
      if (sequence !== previewSequence.current) return;
      currentPreview.current = value;
      setPreview(value);
    } catch (reason) {
      if (sequence === previewSequence.current) setImportError(contactError(reason));
    } finally {
      if (sequence === previewSequence.current) setPreviewBusy(false);
    }
  };

  const closeImport = () => {
    if (csvSubmitting.current || csvUncertain) return;
    previewSequence.current += 1;
    currentPreview.current = undefined;
    setPreview(undefined);
    setPreviewBusy(false);
    setImportOpen(false);
  };

  const commitPreview = async () => {
    const selected = currentPreview.current;
    if (
      !selected ||
      !canMutate ||
      csvSubmitting.current ||
      previewBusy ||
      selected.validRows === 0 ||
      selected.invalidRows > 0
    )
      return;
    csvSubmitting.current = true;
    setCsvBusy(true);
    setImportError(undefined);
    let attempt: Attempt | undefined;
    try {
      attempt = attempts.current.start('csv', selected.previewId);
      const result = await apiClient.contacts.commit(event.id, selected.previewId, attempt.key);
      attempts.current.clear('csv', attempt.key);
      setCsvUncertain(false);
      currentPreview.current = undefined;
      setPreview(undefined);
      setImportResult(result);
      await refreshAfterMutation();
    } catch (reason) {
      const uncertain =
        Boolean(attempt) &&
        (isUncertainFailure(reason) ||
          (reason instanceof ApiError && (reason.status >= 500 || reason.code === 'UNEXPECTED_API_RESPONSE')));
      setCsvUncertain(uncertain);
      if (attempt && !uncertain) attempts.current.clear('csv', attempt.key);
      setImportError(contactError(reason));
    } finally {
      csvSubmitting.current = false;
      setCsvBusy(false);
    }
  };

  return (
    <Stack
      data-testid="guest-management-panel"
      spacing={3}
      sx={{ maxWidth: layoutTokens.content.maxWidthDetail, width: '100%', mx: 'auto' }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box>
          <Typography component="h2" variant="h3">
            Invitados
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {contacts.length} {contacts.length === 1 ? 'contacto registrado' : 'contactos registrados'}
          </Typography>
        </Box>
        {canMutate ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openEditor()}>
            Agregar invitado
          </Button>
        ) : null}
      </Stack>

      {!canMutate ? (
        <Alert severity="info">La lista de invitados está disponible en modo de consulta para este evento.</Alert>
      ) : null}
      {error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => void refresh()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          alignItems: 'center',
          gridTemplateColumns: {
            xs: canMutate ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
            sm: groups.length
              ? `minmax(0, 1fr) minmax(180px, 240px)${canMutate ? ' auto' : ''}`
              : `minmax(0, 1fr)${canMutate ? ' auto' : ''}`
          }
        }}
      >
        <TextField
          size="small"
          label="Buscar invitado"
          value={search}
          onChange={(changeEvent) => setSearch(changeEvent.target.value)}
          sx={{ flex: 1, minWidth: 0 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }
          }}
        />
        {groups.length ? (
          <TextField
            select
            size="small"
            label="Filtrar por grupo"
            value={selectedGroup}
            onChange={(changeEvent) => setSelectedGroup(changeEvent.target.value)}
            sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, gridRow: { xs: 2, sm: 1 }, minWidth: 0 }}
          >
            <MenuItem value="">Todos los grupos</MenuItem>
            {groups.map((group) => (
              <MenuItem key={group.id} value={group.id}>
                {group.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        {canMutate ? (
          <Button
            startIcon={<UploadFileIcon />}
            onClick={() => setImportOpen(true)}
            sx={{
              gridColumn: { xs: 2, sm: 'auto' },
              gridRow: 1,
              px: { xs: 1.5, sm: 2 },
              '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inline-flex' } }
            }}
          >
            Importar lista
          </Button>
        ) : null}
      </Box>

      <Box aria-busy={loading}>
        {loading ? (
          <Typography role="status" variant="body2" color="text.secondary" sx={{ py: 1 }}>
            Cargando invitados…
          </Typography>
        ) : null}
        <List aria-label="Lista de invitados" disablePadding sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          {filteredContacts.map((contact) => (
            <ListItem
              key={contact.id}
              disableGutters
              sx={{ py: 1.5, gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', alignItems: 'center' }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {contact.name ?? 'Contacto anonimizado'}
                </Typography>
                <Stack direction="row" sx={{ mt: 0.25, color: 'text.secondary', flexWrap: 'wrap', columnGap: 1.5 }}>
                  <Typography variant="body2">{contact.whatsappPhone ?? 'Sin teléfono'}</Typography>
                  {contact.groupId && groupNames.has(contact.groupId) ? (
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {groupNames.get(contact.groupId)}
                    </Typography>
                  ) : null}
                </Stack>
              </Box>
              {canMutate ? (
                <IconButton
                  aria-label={`Opciones de ${contact.name ?? 'contacto anonimizado'}`}
                  aria-haspopup="menu"
                  aria-controls={menu?.contact.id === contact.id ? 'guest-actions' : undefined}
                  aria-expanded={menu?.contact.id === contact.id ? true : undefined}
                  onClick={(clickEvent) => setMenu({ anchor: clickEvent.currentTarget, contact })}
                  sx={{ width: 44, height: 44, flexShrink: 0 }}
                >
                  <MoreHorizIcon />
                </IconButton>
              ) : null}
            </ListItem>
          ))}
        </List>
        {contacts.length > 0 && filteredContacts.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 3 }}>
            No encontramos invitados con esa búsqueda o grupo.
          </Typography>
        ) : null}
        {!loading && !error && contacts.length === 0 ? (
          <Stack spacing={1} sx={{ py: 4, alignItems: 'flex-start' }}>
            <Typography color="text.secondary">Aún no hay invitados registrados.</Typography>
            {canMutate ? (
              <Button onClick={() => openEditor()} startIcon={<AddIcon />}>
                Agregar el primer invitado
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </Box>

      {nominalAccess ? (
        <Stack spacing={0.5}>
          <Typography variant="body2" color={remaining !== null && remaining < 0 ? 'error' : 'text.secondary'}>
            Espacios restantes para registrar invitados: {remaining ?? 'Capacidad pendiente'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Los derechos de acceso vigentes y la capacidad disponible para emitir credenciales se consultan en Ingresos
            y aforo.
          </Typography>
        </Stack>
      ) : (
        <Typography variant="body2" color={remaining !== null && remaining < 0 ? 'error' : 'text.secondary'}>
          Invitaciones: {invitations.length} · Personas contempladas: {authorized}
          {remaining === null ? '' : ` · Lugares disponibles: ${remaining}`}
        </Typography>
      )}

      <Menu
        id="guest-actions"
        anchorEl={menu?.anchor}
        open={canMutate && Boolean(menu)}
        onClose={() => setMenu(undefined)}
      >
        <MenuItem
          onClick={() => {
            if (menu) openEditor(menu.contact);
          }}
        >
          Editar
        </MenuItem>
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            setDeleting(menu?.contact);
            setDeleteError(undefined);
            setMenu(undefined);
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>

      <Dialog
        open={canMutate && editorOpen}
        onClose={() => {
          if (!mutationSubmitting.current) setEditorOpen(false);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="contact-editor-title"
        slotProps={{
          transition: {
            onEntered: () => {
              const input = nameInput.current;
              if (input?.closest('[role="dialog"]') === document.activeElement) input.focus();
            }
          }
        }}
      >
        <Box
          component="form"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            if (creatingGroup) void saveGroup();
            else void saveContact();
          }}
        >
          <DialogTitle id="contact-editor-title">{editing ? 'Editar invitado' : 'Agregar invitado'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              {editorError ? <Alert severity="error">{editorError}</Alert> : null}
              <TextField
                autoFocus
                inputRef={nameInput}
                required
                label="Nombre"
                value={form.name}
                disabled={mutationBusy}
                onChange={(changeEvent) => setField('name', changeEvent.target.value)}
              />
              <TextField
                required={!nominalAccess}
                label={nominalAccess ? 'Teléfono (opcional)' : 'Número de WhatsApp'}
                type="tel"
                value={form.whatsappPhone}
                disabled={mutationBusy}
                onChange={(changeEvent) => setField('whatsappPhone', changeEvent.target.value)}
              />
              <TextField
                select
                label="Grupo"
                value={form.groupId}
                disabled={mutationBusy || creatingGroup}
                onChange={(changeEvent) => setField('groupId', changeEvent.target.value)}
              >
                <MenuItem value="">Sin grupo</MenuItem>
                {groups.map((group) => (
                  <MenuItem key={group.id} value={group.id}>
                    {group.name}
                  </MenuItem>
                ))}
              </TextField>
              {creatingGroup ? (
                <Stack spacing={1}>
                  <TextField
                    autoFocus
                    required
                    label="Nuevo grupo"
                    value={groupName}
                    disabled={mutationBusy}
                    onChange={(changeEvent) => setGroupName(changeEvent.target.value)}
                  />
                  {groupError ? <Alert severity="error">{groupError}</Alert> : null}
                  <Stack direction="row" spacing={1}>
                    <Button disabled={mutationBusy || !groupName.trim()} onClick={() => void saveGroup()}>
                      Guardar grupo
                    </Button>
                    <Button disabled={mutationBusy} onClick={() => setCreatingGroup(false)}>
                      Cancelar grupo
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setCreatingGroup(true);
                    setGroupError(undefined);
                  }}
                  disabled={mutationBusy}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Crear grupo
                </Button>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={mutationBusy} onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={mutationBusy || creatingGroup}>
              {mutationBusy ? (editing ? 'Guardando…' : 'Agregando…') : editing ? 'Guardar' : 'Agregar'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={canMutate && importOpen}
        onClose={closeImport}
        fullWidth
        maxWidth="sm"
        aria-labelledby="import-guests-title"
      >
        <DialogTitle id="import-guests-title">Importar invitados</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="subtitle2">1. Prepara tu lista</Typography>
              <Button
                disabled={templateBusy}
                onClick={() => {
                  setTemplateBusy(true);
                  setImportError(undefined);
                  void apiClient.contacts
                    .template(event.id)
                    .then((blob) => downloadBlob(blob, 'contactos.csv'))
                    .catch((reason) => setImportError(contactError(reason)))
                    .finally(() => setTemplateBusy(false));
                }}
              >
                Descargar plantilla
              </Button>
            </Box>
            <Stack spacing={1}>
              <Typography variant="subtitle2">2. Selecciona un archivo CSV</Typography>
              <Button component="label" variant="outlined" disabled={csvBusy || csvUncertain}>
                {fileName ? 'Cambiar archivo' : 'Seleccionar archivo'}
                <input
                  hidden
                  aria-label="Seleccionar archivo CSV"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={csvBusy || csvUncertain}
                  onChange={(changeEvent) => {
                    const file = changeEvent.target.files?.[0];
                    changeEvent.target.value = '';
                    if (file) void selectCsv(file);
                  }}
                />
              </Button>
              {fileName ? (
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {fileName}
                </Typography>
              ) : null}
            </Stack>
            {previewBusy ? (
              <Typography role="status" variant="body2">
                Revisando archivo…
              </Typography>
            ) : null}
            {importError ? <Alert severity="error">{importError}</Alert> : null}
            {csvUncertain ? (
              <Alert severity="warning">
                El resultado de la importación es incierto. Confirma el mismo intento antes de importar otro archivo o
                salir.
              </Alert>
            ) : null}
            {preview ? (
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">3. Revisa los datos</Typography>
                <Alert severity={preview.invalidRows ? 'warning' : 'success'}>
                  {preview.validRows} registros listos para importar · {preview.invalidRows} necesitan corrección
                </Alert>
                <Box component="ol" sx={{ m: 0, pl: 3, maxHeight: 280, overflowY: 'auto', overflowWrap: 'anywhere' }}>
                  {preview.rows.map((row) => (
                    <Box
                      component="li"
                      key={row.rowNumber}
                      sx={{ py: 1, typography: 'body2', borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      Fila {row.rowNumber}: {row.name ?? 'sin nombre'} · {row.normalizedPhone ?? 'sin teléfono'} ·{' '}
                      {row.group ?? 'sin grupo'}
                      {row.errors.length ? ` — ${row.errors.join('; ')}` : ' — válida'}
                    </Box>
                  ))}
                </Box>
              </Stack>
            ) : null}
            {importResult ? (
              <Alert severity="success">
                {importResult.createdContacts} contactos importados · {importResult.createdGroups} grupos creados
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button disabled={csvBusy || csvUncertain} onClick={closeImport}>
            Cerrar
          </Button>
          {!importResult ? (
            <Button
              variant="contained"
              disabled={csvBusy || previewBusy || !preview || preview.validRows === 0 || preview.invalidRows > 0}
              onClick={() => void commitPreview()}
            >
              {csvBusy ? 'Importando…' : 'Confirmar importación'}
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <Dialog
        open={canMutate && Boolean(deleting)}
        onClose={() => {
          if (!mutationSubmitting.current) setDeleting(undefined);
        }}
        aria-labelledby="delete-contact-title"
      >
        <DialogTitle id="delete-contact-title">Eliminar invitado</DialogTitle>
        <DialogContent>
          <Typography>
            Se eliminará {deleting?.name ?? 'este contacto'} junto con su invitación y asistentes asociados. Esta acción
            no se puede deshacer.
          </Typography>
          {deleteError ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button disabled={mutationBusy} onClick={() => setDeleting(undefined)}>
            Cancelar
          </Button>
          <Button color="error" disabled={mutationBusy} onClick={() => void deleteContact()}>
            {mutationBusy ? 'Eliminando…' : 'Confirmar eliminación'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={blocker.state === 'blocked'} aria-labelledby="pending-csv-title">
        <DialogTitle id="pending-csv-title">Hay una importación pendiente</DialogTitle>
        <DialogContent>
          Resuelve la importación con el mismo intento antes de salir para conservar su resultado.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Seguir trabajando</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function contactError(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (
    reason instanceof ApiError &&
    ['CONTACT_LIMIT_EXCEEDED', 'CONTACT_IMPORT_ROW_LIMIT_EXCEEDED'].includes(reason.code)
  )
    return 'El evento admite un máximo de 150 contactos. Revisa tu lista antes de continuar.';
  return errorMessage(reason);
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}
