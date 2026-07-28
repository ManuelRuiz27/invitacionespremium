# Contrato de Contactos, grupos e importación CSV

## Alcance

`ContactsModule`, dentro de `apps/api`, administra los destinatarios principales de un Evento, sus grupos
opcionales y una importación CSV en dos fases. No crea Invitaciones, Acompañantes, tokens públicos, QR,
confirmaciones RSVP ni envíos por WhatsApp.

## Modelos

### Contact

- `id`: UUID;
- `eventId`: FK restrictiva a `Event`;
- `groupId`: UUID nullable;
- `name`: nombre visible, obligatorio hasta la anonimización;
- `whatsappPhoneNormalized`: teléfono E.164, obligatorio hasta la anonimización;
- `anonymizedAt`: instante nullable de anonimización;
- `createdAt`, `updatedAt` y `deletedAt`.

No existe unicidad por teléfono: dos Contactos pueden compartir un número. El borrado es lógico y un
Contacto eliminado deja de contar para el límite operativo.

### Group

- `id`: UUID;
- `eventId`: FK restrictiva a `Event`;
- `name`: nombre visible;
- `normalizedName`: nombre técnico para comparación;
- `createdAt` y `updatedAt`.

La identidad normalizada colapsa espacios, elimina espacios exteriores y compara en minúsculas. Es única
dentro de un Evento. La FK compuesta `(groupId, eventId)` impide asignar un Contacto a un grupo de otro
Evento. CODEX-050 no expone eliminación de grupos.

### ContactImportPreview

Es un artefacto técnico temporal con Evento, usuario creador, vencimiento, conteos, filas normalizadas,
resultado de commit e idempotencia. Nunca conserva el archivo ni teléfonos sin normalizar.

- pendiente: `normalizedRows` es un arreglo JSON cuya longitud coincide con `totalRows`; `committedAt`,
  `commitIdempotencyKey`, `resultSnapshot` y `piiPurgedAt` son `NULL`;
- confirmado: `committedAt`, `commitIdempotencyKey` y `resultSnapshot` existen, mientras
  `normalizedRows` es `NULL`;
- purgado: además de estar confirmado, `piiPurgedAt` identifica la fecha de redacción irreversible.

Un preview vencido y no confirmado se elimina en la limpieza programada. Un preview confirmado no se
elimina ni conserva las filas que sirvieron para crear Contactos.

## Ownership y estados

Las rutas operativas aceptan exclusivamente:

- `INDEPENDENT_PLANNER`: Eventos de su Cliente;
- `ORGANIZATION_ADMIN`: todos los Eventos de su Organización;
- `ORGANIZATION_PLANNER`: Eventos de su Organización creados por su propio usuario.

`PLATFORM_ADMIN` no usa estas rutas. Un Evento ajeno, eliminado o inexistente responde
`404 EVENT_NOT_FOUND`.

Las consultas operan sobre Eventos no eliminados. Crear, editar, borrar, previsualizar o confirmar solo se
permite en `DRAFT`, `CONFIGURED` y `READY_TO_ACTIVATE`; cualquier otro estado responde
`409 CONTACT_EVENT_NOT_MUTABLE`.

## Teléfonos

La entrada se interpreta mediante `libphonenumber-js` y la región configurada en
`PHONE_DEFAULT_REGION`, cuyo valor predeterminado es `MX`. Solo se persiste el resultado E.164. Un valor no
válido responde `CONTACT_PHONE_INVALID`; el valor original no aparece en errores, logs ni auditoría.

PostgreSQL exige el formato `+` seguido por entre 8 y 15 dígitos significativos. La aplicación nunca usa el
teléfono como llave de identidad ni impone unicidad.

## Límite y concurrencia

Un Evento admite como máximo 150 Contactos activos (`deletedAt IS NULL`).

- el alta manual bloquea la fila del Evento y cuenta nuevamente;
- el preview rechaza archivos con más de 150 filas útiles;
- el commit vuelve a contar contra el estado definitivo;
- las mutaciones críticas usan transacciones PostgreSQL `Serializable`, bloqueo `FOR UPDATE` del Evento y
  reintentos de serialización.

Por ello, altas manuales, imports y solicitudes concurrentes no pueden confirmar el Contacto 151.

## Importación CSV

### Plantilla

`GET /api/v1/events/:eventId/contacts/import-template` entrega UTF-8 `text/csv` con encabezado exacto:

```csv
name,whatsapp_phone,group
María Ejemplo,+525512345678,Familia
```

Los valores son ficticios.

### Preview

`POST /api/v1/events/:eventId/contacts/import/preview` recibe `multipart/form-data` con un campo `file`.
Acepta BOM UTF-8, ignora líneas completamente vacías y exige exactamente los encabezados
`name,whatsapp_phone,group`.

La respuesta contiene `previewId`, `expiresAt`, `totalRows`, `validRows`, `invalidRows` y cada fila con:

- número de fila;
- nombre limpio;
- teléfono normalizado;
- grupo y resolución `NONE`, `EXISTING` o `NEW`;
- códigos de error.

Entre los errores de fila están `CONTACT_NAME_REQUIRED`, `CONTACT_PHONE_REQUIRED`,
`CONTACT_PHONE_INVALID`, `CONTACT_NAME_TOO_LONG`, `CONTACT_GROUP_NAME_TOO_LONG` y
`CONTACT_CSV_COLUMN_COUNT_INVALID`. El preview no crea Contactos ni grupos definitivos. Su TTL se configura
con `CONTACT_IMPORT_PREVIEW_TTL_SECONDS` y por defecto es de 1,800 segundos.

### Commit

`POST /api/v1/events/:eventId/contacts/import/commit` exige `Idempotency-Key` y `previewId`.

El preview debe pertenecer al Evento autorizado, estar vigente, no contener filas inválidas y no haberse
confirmado con otra llave. En una sola transacción se vuelven a resolver o crear grupos, se crean todos los
Contactos, se registra auditoría, se guarda el resultado y se descarta `normalizedRows`.

- misma llave, Evento y preview antes de la retención de 30 días: devuelve exactamente el resultado
  confirmado;
- después de la retención, la misma llave devuelve el snapshot redactado; la privacidad prevalece sobre el
  replay byte a byte y no se crean Contactos, grupos ni auditorías adicionales;
- misma llave para otro Evento o preview: `409 CONTACT_IMPORT_IDEMPOTENCY_CONFLICT`;
- preview vencido: `409 CONTACT_IMPORT_PREVIEW_EXPIRED`;
- preview con errores: `409 CONTACT_IMPORT_HAS_INVALID_ROWS`;
- cualquier fallo revierte grupos, Contactos, auditoría y confirmación.

## Endpoints

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/v1/events/:eventId/contacts` | Contactos activos |
| `POST` | `/api/v1/events/:eventId/contacts` | Alta manual |
| `PATCH` | `/api/v1/events/:eventId/contacts/:contactId` | Edición |
| `DELETE` | `/api/v1/events/:eventId/contacts/:contactId` | Borrado lógico |
| `GET` | `/api/v1/events/:eventId/groups` | Grupos |
| `POST` | `/api/v1/events/:eventId/groups` | Alta de grupo |
| `PATCH` | `/api/v1/events/:eventId/groups/:groupId` | Edición de grupo |
| `GET` | `/api/v1/events/:eventId/contacts/import-template` | Plantilla CSV |
| `POST` | `/api/v1/events/:eventId/contacts/import/preview` | Validación temporal |
| `POST` | `/api/v1/events/:eventId/contacts/import/commit` | Confirmación idempotente |

## Auditoría y privacidad

Todas las mutaciones se auditan dentro de la misma transacción. Los snapshots de auditoría solo contienen
identificadores, conteos, estado técnico y timestamps; nunca incluyen nombres, teléfonos, contenido CSV ni
filas del preview.

Un proceso diario anonimiza Contactos y snapshots confirmados de Eventos cuya fecha ocurrió hace 30 días o
más, incluidos Contactos activos y eliminados:

- `name = NULL`;
- `whatsappPhoneNormalized = NULL`;
- `anonymizedAt` queda establecido;
- se conservan Evento, grupo, timestamps y métricas.

Cada `resultSnapshot.contacts[]` confirmado se redacta con `name = null`, `whatsappPhone = null` y
`anonymizedAt`; conserva identificadores, `eventId`, `groupId`, timestamps, conteos y datos técnicos. El
preview recibe `piiPurgedAt`. El proceso también detecta previews pendientes de purga aunque sus Contactos ya
hubieran sido anonimizados.

La operación es idempotente y emite una auditoría `SYSTEM` `CONTACTS_ANONYMIZED` por Evento y ejecución solo
si cambió algún Contacto o preview. Su `afterData` contiene exactamente `eventId`, `contactsAnonymized`,
`previewsRedacted`, `contactIds` y `previewIds`; no incluye PII, snapshots ni filas. En la misma limpieza se
eliminan previews vencidos no confirmados y se registra una auditoría técnica agregada, sin PII.

## Invariantes PostgreSQL

- UUID y FKs restrictivas a Evento y usuario;
- grupo único por `(event_id, normalized_name)`;
- FK compuesta para garantizar que Contacto y grupo pertenezcan al mismo Evento;
- nombre visible limpio y no vacío;
- teléfono E.164 cuando existe;
- Contacto no anonimizado con nombre y teléfono; anonimizado con ambos en `NULL`;
- conteos del preview entre 0 y 150;
- estado pendiente con filas JSON consistentes con `totalRows` y campos de confirmación y purga nulos;
- estado confirmado con commit, llave y resultado establecidos, y `normalizedRows = NULL`;
- `piiPurgedAt` solo en previews confirmados;
- llave de idempotencia de commit globalmente única.

Triggers PostgreSQL impiden modificar Evento, creador, llave o fecha de commit de un preview confirmado;
reintroducir filas o PII después de la redacción; eliminar un preview confirmado; y ejecutar `TRUNCATE` sobre
la tabla. El borrado de previews pendientes continúa permitido. La limpieza controlada de pruebas puede
desactivar triggers dentro de su transacción mediante `session_replication_role = replica`.

## Alcance diferido

Quedan para tareas posteriores Invitaciones, Acompañantes, `StaffToken`, tokens públicos, QR, RSVP,
WhatsApp y frontend. CODEX-050 tampoco envía mensajes ni convierte Contactos en Invitaciones.
