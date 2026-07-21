# Enmiendas QA al backlog Codex

## Objetivo

Corregir y precisar tareas específicas de `15_BACKLOG_CODEX.md` después de la revisión QA documental, sin reemplazar ni renumerar el backlog completo.

Este documento no agrega alcance nuevo. Traduce las reglas ya consolidadas en los contratos especializados.

## Autoridad

Hasta que estas correcciones se integren directamente en `15_BACKLOG_CODEX.md`, esta enmienda prevalece sobre cualquier texto contradictorio del backlog.

Orden aplicable:

1. corrección explícita aprobada por el usuario;
2. contratos especializados;
3. esta enmienda;
4. `15_BACKLOG_CODEX.md`.

Una tarea Codex afectada debe citar tanto su entrada original del backlog como la enmienda correspondiente.

## Enmienda general — Definition of Ready

Ninguna tarea está lista si:

- contradice un contrato especializado;
- requiere reutilizar tokens entre propósitos;
- no define estado del Evento permitido;
- no define ownership;
- afecta finanzas sin unidad, snapshot e idempotencia;
- afecta archivos sin owner/file type y ciclo de vida;
- afecta datos personales sin política de anonimización.

## CODEX-010 — Base API y PostgreSQL

Agregar al alcance:

- timestamps técnicos UTC;
- zona horaria IANA en Evento;
- soporte para procesos programados idempotentes dentro de módulos existentes;
- estrategia de concurrencia PostgreSQL para invariantes críticos;
- `operationId`/correlation en logs sin datos sensibles.

Criterios adicionales:

- no asumir zona horaria del servidor;
- health check cubre API y DB;
- logs excluyen tokens, teléfonos y secretos.

## CODEX-011 — Auditoría y soft delete

Agregar:

- actor `USER`, `STAFF_TOKEN`, `PUBLIC_TOKEN` o `SYSTEM` sin guardar secretos;
- recursos restaurados conservan estado previo, pero no reactivan tokens expirados;
- ledger/pagos/comprobantes confirmados no usan soft delete como corrección.

## CODEX-021 — Clientes y usuarios

Precisar:

- Planner independiente es Cliente tipo Planner con un usuario principal;
- Platform Admin no pertenece a Cliente operativo;
- usuario de Cliente pertenece a un único Cliente;
- rol debe ser compatible con tipo de Cliente;
- Platform Admin consulta por rutas `/admin/**` y no impersona.

## CODEX-030 — Servicios, precios y promociones

Agregar:

- activación conserva snapshot de costo base, descuento, costo final y promoción;
- cambios de precio no modifican Eventos activados ni deuda histórica;
- créditos son enteros.

## CODEX-031 — Ledger, balance y deuda

Reemplazar cualquier modelado agregado ambiguo por las reglas de `LEDGER_TYPES.md`:

- `CREDIT_LINE_USAGE` es lote histórico de deuda;
- guardar `credit_unit_value_mxn_cents_snapshot`;
- deuda se expresa en créditos y equivalente MXN histórico;
- `DEBT_PAYMENT` asigna Pago aprobado a lotes específicos;
- compra pagada manual usa `CREDIT_PURCHASE`;
- asignación gratuita usa `MANUAL_CREDIT_GRANT`;
- refund comercial y reversal contable son distintos;
- balance cache es reconstruible desde ledger;
- idempotencia obligatoria.

Pruebas adicionales:

- cambio del valor del crédito no modifica deuda previa;
- pago de deuda no aumenta saldo comprado;
- porción financiada ya pagada y después devuelta vuelve como créditos internos;
- operación repetida no duplica movimientos.

## CODEX-040 — Modelo y CRUD de Evento

Agregar:

- zona horaria IANA;
- estados exactos de `EVENT_STATE_MACHINE.md`;
- `configured` y `ready_to_activate` calculados por backend;
- ownership exacto de `ACCESS_MATRIX.md`;
- proceso de borrador vencido idempotente.

## CODEX-041 — Activación transaccional

Agregar:

- ledger, comprobante, snapshots y cambio a `active` dentro de una sola transacción;
- pago mixto saldo/línea;
- valor histórico para porción financiada;
- Evento Demo no genera movimientos de consumo;
- diseño Flyer/Flipbook queda congelado al confirmar activación.

## CODEX-042 — Estados posteriores a activación

Agregar/corregir:

- `active` → `event_day` se evalúa con fecha local y zona horaria del Evento;
- cierre expira StaffTokens activos y bloquea QR/check-in;
- reapertura no reactiva tokens expirados;
- cancelación conserva vista pública de mensaje mediante token de Invitación;
- cancelación no devuelve créditos automáticamente;
- archivado es terminal y oculta Invitación/Álbum públicos;
- `album_published` expira a los 30 días y pasa a `archived`;
- no emitir un evento Socket.IO adicional para `event_day` sin aprobar contrato.

## CODEX-050 — Contactos e import CSV

Agregar:

- teléfono se normaliza y protege como dato personal;
- no incluir teléfono en reportes, Socket.IO, scanner ni logs;
- anonimización 30 días post-Evento;
- archivo con más de 150 se bloquea completo.

## CODEX-051 — Invitaciones y Asistentes

**Corrección obligatoria:** eliminar cualquier criterio que diga que la Invitación cancelada “deja de abrir”.

Comportamiento correcto:

- el link sigue resolviendo;
- muestra únicamente `Invitación cancelada por el organizador` o mensaje público del Evento;
- bloquea Confirmación, edición de Asistentes y QR;
- conserva datos/auditoría;
- token de Invitación, QR y Álbum son distintos.

Pruebas:

- cancelación específica muestra mensaje;
- token no expone otros Contactos;
- token de Invitación no abre Álbum.

## CODEX-060 — FileAssets y storage

Agregar:

- separar `owner_type` de `file_type`;
- `client_id` y `event_id` deben coincidir con owner;
- FileAsset `READY` es el único asociable;
- `HIDDEN`, `DELETED` y `FAILED` no se publican;
- frontend no decide `storage_key` ni sube directo;
- buckets privados/URL firmada futura;
- limpieza de bytes huérfanos controlada.

## CODEX-061 — Flyer, Flipbook y Hotspots

Agregar:

- editable solo en `draft`, `configured`, `ready_to_activate`;
- diseño y orden congelados al activar;
- no reemplazar assets después de activar;
- Hotspot es entidad separada;
- PDF subido por usuario se rechaza en MVP temprano.

## CODEX-070 — Invitación pública y Confirmación

Precisar por estado:

- `active`/`event_day`: interacción permitida según Confirmación abierta;
- `closed`: vista de Evento finalizado, sin Confirmación ni QR operativo;
- `album_published`: puede mostrar CTA a Álbum con token separado;
- `cancelled`: solo mensaje de cancelación;
- `archived`: acceso no disponible.

Agregar:

- acciones públicas usan actor `PUBLIC_TOKEN` en auditoría/Socket.IO sin guardar secreto;
- token reenviado mantiene identidad del Contacto;
- aumento respeta límite y capacidad.

## CODEX-071 — QR SVG

Agregar:

- token QR separado del token de Invitación;
- QR solo operativo en `active`/`event_day`;
- cierre/cancelación/archivado bloquean operación;
- no incluir nombre/teléfono directamente;
- protección contra uso de QR de otro Evento.

## CODEX-080 — StaffTokens

Reemplazar “máximo 3 tokens” por:

- máximo 3 **StaffTokens activos** por Evento;
- solo se crean en `active` o `event_day`;
- tokens expirados no cuentan como activos;
- cerrar/cancelar expira tokens activos;
- reabrir no reactiva expirados;
- no existe revocación manual MVP;
- almacenar token de forma segura y excluirlo de logs/socket.

## CODEX-081 — Scanner y check-in

Agregar:

- todos los endpoints requieren Evento `active` o `event_day`;
- Staff no entra a room `dashboard`;
- check-in activo único por Asistente con protección concurrente;
- QR de otro Evento se rechaza;
- sin conexión se informa que internet es obligatorio;
- cerrar/cancelar invalida operación y conexión;
- reversión solo usuario autorizado.

## CODEX-082 — Tiempo real

Aplicar exclusivamente `REALTIME_PAYLOADS.md`:

- `actorType` admite `PUBLIC_TOKEN`;
- `seating.updated` usa `changes[]` y `affectedTables[]`;
- no enviar nombres, teléfonos, finanzas, tokens ni URLs firmadas;
- reconexión revalida estado y permisos;
- pérdida de evento se recupera por REST;
- cierre/cancelación se emite después de persistir y expirar accesos.

## CODEX-090 — Croquis y Mesas

Agregar:

- capacidad 0 solo zona decorativa;
- un Croquis activo por Evento;
- coordenadas relativas;
- Staff recibe plano mínimo sin datos personales;
- cambio posterior a check-in auditado;
- FileAsset conforme a `FILE_ASSET_POLICY.md`.

## CODEX-100 — PaseFisicoQR

Agregar:

- protección concurrente contra segundo uso;
- token/QR distinto de Invitación;
- scanner solo en Evento operativo;
- sin Contacto, Confirmación nominal, WhatsApp ni Álbum.

## CODEX-110 — Álbum

Precisar:

- se crea antes del cierre y se publica después del cierre;
- token de Álbum separado por Invitación elegible;
- elegibilidad: al menos un Asistente ingresado;
- Invitación no elegible recibe mensaje restringido;
- solo funciona con Evento `album_published`;
- despublicar expira tokens y vuelve a `closed`;
- archivado anticipado oculta inmediatamente;
- a los 30 días de publicación, Evento pasa a `archived` y tokens expiran;
- no exponer otras Invitaciones/Asistentes.

## CODEX-111 — Reportes PDF

Reemplazar cualquier flujo ambiguo por:

1. frontend solicita reporte al API;
2. API valida y crea `report_id` + dataset/snapshot autorizado;
3. frontend renderiza HTML y exporta PDF;
4. frontend sube PDF al API asociado al `report_id`;
5. API valida y guarda FileAsset;
6. descarga posterior vuelve a autorizar.

Reglas:

- no aceptar PDF sin `report_id`;
- no incluir teléfonos;
- reportes detallados con nombres solo 30 días post-Evento;
- anonimización oculta/reemplaza detalle;
- historial de seis meses conserva metadata/agregados anónimos;
- Planner accede desde Resumen del Evento;
- Platform Admin usa rutas `/admin/reports/**`;
- no CSV/Excel MVP.

## CODEX-120 — Shell y dashboard Cliente

Agregar:

- Planner de Organización no ve saldo, deuda ni navegación financiera;
- reportes no tienen módulo/ruta global para Planner;
- alertas dependen de rol y estado;
- backend vuelve a autorizar todo.

## CODEX-121 — Wizard

Agregar:

- backend calcula readiness;
- revisión muestra costo, descuento y fuente de cobro;
- activación congela diseño;
- errores de dominio se traducen sin duplicar reglas críticas.

## CODEX-122 — Invitación y Álbum públicos

Rutas obligatorias:

- `/invitacion/:invitationToken`;
- `/album/:albumToken`.

No reutilizar token.

Comportamientos obligatorios:

- cancelado muestra mensaje;
- cerrado bloquea QR/Confirmación;
- archived oculta contenido;
- Álbum valida elegibilidad y expiración;
- no filtrar datos de otras Invitaciones.

## CODEX-130 — Platform Admin

Agregar:

- Eventos por `/admin/events/**`;
- reportes por `/admin/reports/**`;
- no impersonación;
- acciones financieras sensibles explícitas/auditadas;
- reportes administrativos respetan anonimización.

## CODEX-131 — Scanner frontend

Agregar:

- ruta `/scanner/:staffToken`;
- validación `active`/`event_day`;
- no teléfonos/nombres fuera del resultado mínimo autorizado;
- no room `dashboard`;
- manejo de token expirado, cerrado, cancelado, QR ajeno y pase usado;
- internet obligatorio.

## CODEX-140 — Staging

Agregar pruebas de:

- jobs idempotentes: `event_day`, borrador vencido, expiración de Álbum, anonimización;
- deuda histórica ante cambio de valor de crédito;
- tres StaffTokens activos + expirados;
- cierre/reapertura sin reactivar tokens;
- cancelación pública;
- token separado de Álbum;
- reportes detallados/anonimizados;
- check-in y PaseFisicoQR concurrentes;
- rooms Socket.IO cruzados;
- backups y restauración.

## CODEX-141 — Carga y seguridad

Agregar:

- rate limiting en auth, endpoints públicos, scanner y uploads;
- no secretos/tokens/teléfonos en logs;
- FileAssets entre Clientes rechazados;
- Platform Admin sin contexto de Cliente;
- idempotencia ante retries;
- expiración y reconexión Socket.IO.

## Actualización futura del backlog

Antes de declarar la documentación `v1.0 lista para Codex`, puede consolidarse esta enmienda directamente dentro de `15_BACKLOG_CODEX.md`.

Hasta esa consolidación, no eliminar este archivo ni omitirlo en las instrucciones a Codex.