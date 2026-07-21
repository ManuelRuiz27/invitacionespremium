# 14 — Codex Rules

## Regla principal

Esta documentación es la fuente de verdad.

Codex no debe inventar entidades, roles, módulos, rutas, estados, permisos, eventos Socket.IO, tipos financieros ni reglas.

Si una tarea no puede implementarse sin tomar una decisión de producto no documentada, Codex debe detener esa parte, describir el hueco y solicitar corrección documental. No debe resolverlo por intuición.

Antes de iniciar cualquier tarea, Codex debe revisar `17_QA_OPEN_DECISIONS.md`. Una capacidad marcada `OPEN` queda bloqueada aunque aparezca en API, plan o backlog.

## Jerarquía documental

Cuando exista diferencia entre documentos, aplicar en este orden:

1. corrección explícita más reciente aprobada por el usuario;
2. contrato especializado del área;
3. documento base de producto/técnico;
4. `13_PLAN_IMPLEMENTACION.md`;
5. `16_BACKLOG_QA_AMENDMENTS.md`, únicamente para las tareas que corrige expresamente;
6. `15_BACKLOG_CODEX.md`.

El backlog organiza trabajo, pero no puede cambiar reglas de producto. La enmienda QA corrige temporalmente entradas concretas del backlog hasta su consolidación.

`17_QA_OPEN_DECISIONS.md` no agrega una regla alternativa: suspende la implementación del alcance afectado hasta que exista decisión explícita y se actualicen los contratos.

Contratos especializados:

- `EVENT_STATE_MACHINE.md` prevalece para estados/transiciones;
- `ACCESS_MATRIX.md` prevalece para permisos/ownership;
- `LEDGER_TYPES.md` prevalece para efectos financieros;
- `FILE_ASSET_POLICY.md` prevalece para archivos;
- `REALTIME_PAYLOADS.md` prevalece para Socket.IO;
- `10_SCHEMA_PRISMA_GUIDE.md` prevalece para restricciones de persistencia compatibles con el modelo conceptual.

Si dos contratos especializados se contradicen, no implementar hasta corregir documentación.

## Prohibiciones generales

No crear:

- roles no definidos;
- entidades de negocio no definidas;
- módulos fuera del mapa;
- repos adicionales;
- pantallas fuera del flujo;
- archivos sin responsabilidad clara;
- flujos alternos no aprobados;
- microservicios no aprobados;
- app móvil nativa;
- impersonación;
- modo offline MVP;
- WhatsApp API MVP;
- export CSV/Excel de reportes MVP;
- conversión PDF a imagen en MVP temprano;
- implementación parcial o completa de una decisión marcada `OPEN`.

## Reglas duras de dominio

1. No mezclar Contacto y Asistente.
2. No usar `Invitado` como entidad técnica.
3. Contacto recibe link/WhatsApp; Asistente es nominal y recibe check-in.
4. No hacer check-in por Invitación.
5. Check-in se registra por Asistente.
6. QR pertenece a Invitación.
7. PaseFisicoQR tiene uso individual y único.
8. Invitación, QR, Álbum y Staff usan tokens distintos y no intercambiables.
9. Invitación cancelada conserva vista pública de cancelación.
10. Cancelación bloquea Confirmación, QR, Álbum y check-in según contrato.
11. Archivado oculta links públicos y no permite reapertura.
12. Flyer/Flipbook quedan congelados al activar.
13. No editar/reemplazar diseño en `active`, `event_day`, `closed`, `album_published`, `archived` o `cancelled`.
14. No implementar transición fuera de `EVENT_STATE_MACHINE.md`.
15. Evaluar fechas con zona horaria del Evento, no del servidor.
16. Mientras QA-OPEN-001 siga abierto, no implementar `POST /events/:eventId/change-service` ni cambio post-activación de servicio.
17. Antes de activar, cambiar selección de servicio forma parte del wizard y se cobra únicamente el servicio final.

## Reglas duras de acceso

1. Solo Planner independiente se registra públicamente.
2. Solo Platform Admin crea Organización.
3. Solo Platform Admin asigna créditos manualmente o línea de crédito.
4. Platform Admin no usa endpoints de Cliente como impersonación.
5. Planner independiente opera su Cliente.
6. Admin de Organización opera recursos de su Organización.
7. Planner de Organización opera únicamente Eventos que creó.
8. Planner de Organización no compra créditos ni ve saldo/deuda.
9. Staff opera solo el Evento de su token.
10. Staff solo opera con Evento `active` o `event_day`.
11. Máximo tres StaffTokens activos por Evento.
12. Cerrar/cancelar expira StaffTokens activos.
13. Reabrir no reactiva tokens expirados.
14. Staff no ve teléfonos.
15. Staff no registra extra anónimo.
16. Staff no revierte check-in.
17. Staff no ve reportes finales ni dashboard global.
18. Público no accede a otros Contactos/Invitaciones.
19. No conceder acceso fuera de `ACCESS_MATRIX.md`.

## Reglas duras financieras

1. No activar Evento sin saldo comprado o línea disponible.
2. Activación, ledger, comprobante y cambio de estado son una transacción.
3. No modificar saldo/deuda fuera del ledger.
4. Ledger es fuente de verdad; balance cache es derivado.
5. Ledger confirmado es inmutable.
6. Correcciones usan movimientos compensatorios.
7. No borrar datos financieros, pagos aprobados, comprobantes ni auditoría.
8. Créditos son enteros; MXN se almacena en centavos.
9. `CREDIT_LINE_USAGE` guarda valor unitario MXN histórico.
10. Cambiar valor futuro del crédito no recalcula deuda histórica.
11. Solo Pago `approved` genera compra/pago de deuda confirmado.
12. Compra pagada externa usa `CREDIT_PURCHASE`, no `MANUAL_CREDIT_GRANT`.
13. `MANUAL_CREDIT_GRANT` requiere motivo y no registra ingreso.
14. Pago de deuda no aumenta saldo comprado.
15. Refund comercial usa `EVENT_CREDIT_REFUND`; error contable usa `LEDGER_REVERSAL`.
16. No crear tipos de movimiento fuera de `LEDGER_TYPES.md`.
17. Toda operación crítica requiere idempotencia.
18. No crear cargos, diferencias o devoluciones para cambio de servicio mientras QA-OPEN-001 esté abierto.

## Reglas duras de archivos y reportes

1. Todos los archivos pasan por API.
2. Frontend nunca guarda directo en storage ni decide `storage_key`.
3. No usar bucket público general.
4. Separar `owner_type` de `file_type`.
5. No reutilizar FileAsset entre Clientes/Eventos.
6. Solo FileAsset `READY` puede asociarse.
7. `HIDDEN`, `DELETED` o `FAILED` no se publican.
8. Archivar/cancelar no hace hard delete.
9. No aceptar PDF de usuario para Flyer/Flipbook/Croquis en MVP temprano.
10. QR SVG se genera en backend.
11. Reporte PDF se renderiza en frontend autorizado, pero se registra y almacena vía API.
12. No aceptar PDF de reporte sin `report_id` autorizado.
13. Reportes no incluyen teléfonos.
14. Reportes detallados con nombres dejan de estar disponibles 30 días post-Evento.
15. Historial de seis meses conserva reportes agregados/anónimos.
16. No publicar ni eliminar archivos fuera de `FILE_ASSET_POLICY.md`.
17. No crear assets/migraciones de servicio post-activación mientras QA-OPEN-001 esté abierto.

## Reglas duras de tiempo real

1. Socket.IO no sustituye REST/base de datos.
2. Mutación se persiste antes de emitir.
3. No emitir eventos adicionales fuera de `REALTIME_PAYLOADS.md`.
4. No enviar teléfonos, nombres, finanzas, tokens o URLs firmadas.
5. Staff no entra al room `dashboard`.
6. Staff solo entra a `scanner`/`floorplan` del mismo Evento.
7. Confirmación pública usa `actorType=PUBLIC_TOKEN` sin exponer token.
8. Consumidores deduplican con `operationId`.
9. Reconexión revalida identidad, ownership, token y estado.
10. Pérdida de evento se recupera por snapshot REST.

## Privacidad

1. Anonimizar nombres de Contactos/Asistentes y teléfonos 30 días post-Evento.
2. Conservar métricas, check-ins y elegibilidad de Álbum sin datos personales innecesarios.
3. No guardar teléfonos en Socket.IO, reportes PDF ni logs.
4. No usar PDFs/FileAssets para evadir anonimización.
5. Tokens públicos se almacenan de forma segura y nunca se registran completos.
6. Datos reales de producción no se copian a desarrollo sin anonimización.

## Procesos automáticos

Implementar dentro de módulos existentes, sin crear módulo nuevo solo para jobs:

- borrador vencido → borrado lógico;
- `active` → `event_day` por zona horaria;
- expiración/archivo de Álbum;
- expiración de tokens;
- anonimización;
- ocultamiento/reemplazo de reportes detallados;
- limpieza de bytes huérfanos;
- backups según infraestructura.

Deben ser idempotentes, auditables cuando cambian negocio y seguros ante ejecución duplicada.

## Contratos especializados obligatorios

Cuando una tarea afecte el área indicada, Codex debe leer y citar en su PR el documento correspondiente:

| Área | Documento obligatorio |
|---|---|
| Estados y ciclo del Evento | `docs/02-flujos-reglas/EVENT_STATE_MACHINE.md` |
| Roles, permisos y ownership | `docs/01-producto/ACCESS_MATRIX.md` |
| Créditos, deuda, pagos y activación | `docs/02-flujos-reglas/LEDGER_TYPES.md` |
| Archivos, imágenes, QR y reportes | `docs/04-tecnico/FILE_ASSET_POLICY.md` |
| Socket.IO | `docs/04-tecnico/REALTIME_PAYLOADS.md` |
| Modelo/persistencia | `docs/04-tecnico/09_MODELO_DATOS_CONCEPTUAL.md` y `10_SCHEMA_PRISMA_GUIDE.md` |
| API | `docs/04-tecnico/11_API_CONTRACTS.md` |
| Orden de implementación | `docs/05-implementacion/15_BACKLOG_CODEX.md` |
| Correcciones al backlog | `docs/05-implementacion/16_BACKLOG_QA_AMENDMENTS.md` |
| Bloqueos abiertos | `docs/05-implementacion/17_QA_OPEN_DECISIONS.md` |

Toda tarea debe verificar si su ID aparece en `16_BACKLOG_QA_AMENDMENTS.md` y si su alcance está bloqueado en `17_QA_OPEN_DECISIONS.md`.

## Naming obligatorio

Usar:

- Cliente
- Planner independiente
- Organización
- Admin de Organización
- Planner de Organización
- Platform Admin
- Staff por token / StaffToken en técnico
- Contacto
- Invitación
- Asistente
- Servicio contratado
- Tipo social
- Crédito
- Línea de crédito
- Evento
- Álbum
- FileAsset

No usar `Invitado` como entidad técnica.

## Repos autorizados

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

## Módulos backend autorizados

- AuthModule
- ClientsModule
- ClientUsersModule
- ServicesPricingModule
- FinanceModule
- EventsModule
- ContactsModule
- InvitationsModule
- InvitationDesignModule
- PublicRsvpModule
- FloorplanModule
- StaffAccessModule
- ScannerModule
- PhysicalPassesModule
- AlbumsModule
- ReportsModule
- AuditModule
- FileAssetsModule
- RealtimeModule
- DemoModule

## Validaciones obligatorias

- máximo 150 Contactos/Invitaciones por Evento;
- máximo 3 StaffTokens activos;
- no exceder capacidad de Mesa;
- no exceder capacidad de Evento;
- QR no visible antes de confirmar;
- Invitación rechazada sin QR;
- Invitación cancelada solo muestra cancelación;
- PaseFisicoQR usado una sola vez;
- check-in activo único por Asistente;
- StaffToken válido y Evento operativo;
- token de Álbum separado, elegible y vigente;
- idempotencia financiera;
- ownership en backend;
- anonimización y ventana de reportes.

## Flujo de trabajo Codex

1. Ejecutar una tarea pequeña del backlog por rama/PR.
2. Leer documentos obligatorios antes de editar.
3. Buscar el ID de tarea en `16_BACKLOG_QA_AMENDMENTS.md` y aplicar la corrección si existe.
4. Buscar el alcance en `17_QA_OPEN_DECISIONS.md`; detenerse si está `OPEN`.
5. Declarar alcance y fuera de alcance.
6. Identificar entidades, módulos, endpoints y reglas afectadas.
7. Implementar pruebas junto con cambio.
8. Actualizar OpenAPI si cambia API.
9. Crear migración si cambia schema.
10. Actualizar `.env.example` si agrega configuración.
11. No dejar TODO crítico o mock oculto.
12. Documentar decisiones técnicas locales sin cambiar producto.

No solicitar ni ejecutar “implementa todo InvitacionesPremium”.

## Criterio de aceptación para cambios

Todo cambio debe poder responder:

1. ¿Qué requerimiento lo respalda?
2. ¿En qué documento está?
3. ¿Qué contrato especializado prevalece?
4. ¿Qué módulo lo contiene?
5. ¿Qué entidad afecta?
6. ¿Qué regla valida?
7. ¿Qué tarea de `15_BACKLOG_CODEX.md` ejecuta?
8. ¿Existe enmienda en `16_BACKLOG_QA_AMENDMENTS.md`?
9. ¿Existe decisión `OPEN` relacionada?
10. ¿Qué pruebas demuestran aceptación?
11. ¿Cambió OpenAPI, Prisma, variables o migraciones?
12. ¿Introdujo una decisión no documentada?

Si existe una decisión `OPEN` relacionada o la respuesta a la última pregunta es sí, el cambio no está listo.