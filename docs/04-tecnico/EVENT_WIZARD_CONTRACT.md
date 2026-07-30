# Contrato del Wizard de Evento

## Alcance

`CODEX-121` implementa en `apps/client` la creación, reanudación, configuración y activación de un
Evento usando exclusivamente contratos de la API. La API conserva autoridad sobre ownership, estados,
capacidad, readiness, cobro, saldo e idempotencia. El wizard no implementa la vista pública ni el álbum.

## Rutas y navegación

- `/eventos/nuevo` inicia una captura local y no crea un borrador vacío.
- `/eventos/:eventId/configuracion/:step` recupera el Evento y usa `:step` como fuente de verdad.
- pasos digitales: `datos`, `contactos`, `invitacion`, `confirmacion`, `croquis`, `revision`;
- pasos `PHYSICAL_QR`: `datos`, `contactos`, `croquis`, `pases`, `revision`.

Los servicios vienen de `GET /services`; `DEMO` no se ofrece. Solo `DRAFT`, `CONFIGURED` y
`READY_TO_ACTIVATE` son editables. Los estados posteriores son de solo lectura.

## Creación y guardado

La ruta nueva mantiene datos en memoria hasta un guardado significativo. Nombre, servicio, fecha o
capacidad habilitan la creación. Tras `POST /events`, la URL adopta el identificador retornado y los
guardados siguientes usan `PATCH /events/:eventId`.

El autosave espera 900 ms, consolida cambios, serializa escrituras, conserva el último snapshot ante
error y expone `pending`, `saving`, `saved` y `error`. `Guardar y continuar` y `Guardar y salir` vacían
la cola. `beforeunload` advierte mientras existe trabajo pendiente.

## Operaciones por etapa

| Etapa | Operaciones |
| --- | --- |
| Datos | Servicio vigente, nombre, tipo social, fecha, zona IANA, capacidad y URLs HTTPS |
| Contactos | CRUD, búsqueda, grupos, plantilla CSV, preview y commit idempotente |
| Invitación | archivos privados, flyer/flipbook, páginas, hotspots normalizados y readiness |
| Confirmación | `confirmationEnabled` mediante actualización del Evento |
| Croquis | activación opcional, imagen y shapes con enums del backend |
| Pases | generación idempotente, listado y recuperación tras resultado incierto |
| Revisión | readiness autoritativo, cobro vigente, balance autorizado y activación idempotente |

El hotspot dispone de campos numéricos para `x`, `y`, `width` y `height`, normalizados entre 0 y 1. Los
objetos privados se descargan como `Blob`; el cliente no construye URLs de storage.

## Idempotencia, conectividad y permisos

Las llaves de importación CSV, generación de pases y activación se crean una vez por Evento y operación
y se conservan durante la sesión. Después de un resultado de activación desconocido, el cliente consulta
el Evento: `ACTIVE` confirma éxito; otro estado conserva una acción reintentable.

Los tres roles Cliente pueden configurar Eventos autorizados. El detalle financiero solo se solicita
para Planner independiente y Admin de Organización. Planner de Organización ve el costo, pero no saldo,
movimientos ni comprobantes.

## Accesibilidad, SDK y pruebas

El stepper tiene alternativa desplazable en pantallas pequeñas, controles con nombre accesible, regiones
vivas, navegación por teclado, foco visible y alternativa numérica al editor visual.

`@invitaciones/api-client` soporta `GET`, `POST`, `PATCH`, `DELETE`, JSON, `FormData`, texto, `Blob`,
`ArrayBuffer`, `204`, `AbortSignal`, cookies e `Idempotency-Key`; no fija `Content-Type` para multipart.
Los tipos continúan generándose desde OpenAPI y `generate:check` detecta drift.

Las pruebas cubren transporte, binarios, multipart, errores, abortos, idempotencia, secuencias por
servicio, estados editables, creación diferida, autosave, reanudación por URL, permisos financieros y
reconciliación de activación.
