# Upgrade de servicio: Flyer → Flipbook

## Objetivo

Definir la única transformación de servicio permitida después de activar un Evento en el MVP.

Este documento cierra `QA-OPEN-001` con la **opción B** aprobada por el usuario. Es el contrato especializado para cambio de servicio y prevalece sobre reglas generales de congelamiento cuando regula expresamente este upgrade.

## Alcance aprobado

### Antes de activar

Mientras el Evento esté en `draft`, `configured` o `ready_to_activate`:

- el Cliente puede cambiar libremente el servicio seleccionado dentro del wizard;
- no existe cargo por diferencia;
- no se usa el endpoint de upgrade post-activación;
- al activar se cobra únicamente el servicio final configurado.

### Después de activar

Solo se permite:

- servicio actual: `Flyer`;
- servicio destino: `Flipbook`;
- estado del Evento: `active`;
- fecha local actual anterior a la fecha local del Evento;
- mismo Cliente, Contactos, Invitaciones, Asistentes, Confirmaciones, QR y tokens públicos.

No se permite iniciar ni confirmar el upgrade en `event_day`, `closed`, `album_published`, `archived` o `cancelled`.

## Transformaciones prohibidas en MVP

- QR pase físico → Flyer;
- QR pase físico → Flipbook;
- Flipbook → Flyer;
- cualquier downgrade;
- cualquier cambio después de `event_day`;
- upgrade que requiera regenerar Contactos, Invitaciones, Asistentes o QR;
- cambio de servicio con devolución automática.

## Actores y ownership

Pueden iniciar, preparar, cancelar y confirmar el upgrade:

- Planner independiente sobre Evento propio;
- Admin de Organización sobre Evento de su Organización;
- Planner de Organización únicamente sobre Evento creado por él.

Platform Admin no ejecuta el flujo como si fuera Cliente y no impersona. Staff y Público no tienen acceso.

## Principio de continuidad

Durante la preparación:

- el Flyer activado permanece público e inmutable;
- el Flipbook nuevo permanece privado;
- el Evento continúa en `active`;
- no cambia la URL pública de la Invitación;
- no cambian tokens de Invitación ni QR;
- no se modifican Contactos, Invitaciones, Asistentes, Confirmaciones, Mesas o check-ins;
- no se cobra hasta confirmar el cambio atómico.

El upgrade no es una transición de estado del Evento.

## Persistencia mínima

No se crea una entidad comercial nueva.

El Evento puede guardar una configuración técnica de upgrade pendiente con al menos:

- `pending_service`: `FLIPBOOK`;
- `pending_upgrade_status`: `PREPARING` o `READY`;
- `pending_design_id` o referencia equivalente;
- `pending_upgrade_started_at`;
- `pending_upgrade_started_by`;
- `pending_upgrade_quote_credits`;
- `pending_upgrade_price_snapshot`;
- `pending_upgrade_expires_at`, igual al inicio de `event_day`.

La estructura exacta puede ser campos del Evento o una estructura técnica de persistencia dentro de `EventsModule`/`InvitationDesignModule`, pero no debe crear un módulo backend nuevo.

## Flujo API

### 1. Preparar upgrade

`POST /events/:eventId/change-service/prepare`

Body conceptual:

```json
{
  "targetService": "FLIPBOOK"
}
```

Validaciones:

- Evento `active`;
- servicio actual `FLYER`;
- fecha local anterior a `event_day`;
- ownership válido;
- no existe otro upgrade pendiente;
- Cliente no suspendido.

Efectos:

- crea configuración técnica pendiente;
- calcula cotización preliminar;
- habilita carga privada del Flipbook;
- no mueve créditos;
- no cambia servicio público.

### 2. Consultar upgrade pendiente

`GET /events/:eventId/change-service`

Devuelve únicamente al actor autorizado:

- estado de preparación;
- checklist del Flipbook;
- precio objetivo;
- costo ya reconocido del Flyer;
- diferencia estimada;
- saldo/línea disponible;
- bloqueos.

### 3. Configurar Flipbook privado

Los endpoints de diseño deben aceptar contexto de upgrade pendiente.

Reglas:

- entre 1 y 10 páginas JPG/PNG;
- hotspots válidos;
- assets privados;
- preview solo para usuario autorizado;
- no alterar el Flyer activo;
- no publicar URLs ni assets pendientes.

### 4. Cancelar preparación

`POST /events/:eventId/change-service/cancel`

Efectos:

- elimina o cierra la configuración pendiente;
- oculta o marca como eliminados lógicamente los assets pendientes conforme a `FILE_ASSET_POLICY.md`;
- conserva auditoría;
- no mueve créditos;
- Flyer continúa activo.

### 5. Confirmar upgrade

`POST /events/:eventId/change-service/commit`

Body conceptual:

```json
{
  "targetService": "FLIPBOOK",
  "idempotencyKey": "uuid"
}
```

Debe ejecutar en una sola transacción:

1. volver a validar estado, fecha local, ownership y Cliente activo;
2. validar que el Flipbook pendiente está completo;
3. recalcular la diferencia final;
4. validar saldo comprado/línea;
5. registrar ledger y comprobante;
6. cambiar el servicio contratado a `FLIPBOOK`;
7. activar el Flipbook pendiente como diseño público;
8. ocultar el Flyer anterior sin hard delete;
9. limpiar la configuración pendiente;
10. registrar auditoría completa.

Si falla cualquier paso, no se cobra ni cambia el diseño público.

## Precio y diferencia

La diferencia se calcula en créditos enteros:

```txt
costo_upgrade = max(0, precio_Flipbook_vigente_al_confirmar - costo_reconocido_del_Flyer)
```

### Precio Flipbook

Usar el precio vigente al momento de confirmar el upgrade para el tipo de Cliente correspondiente.

### Costo reconocido del Flyer

Usar el costo final en créditos efectivamente cobrado por el servicio Flyer en la activación, después de la promoción aplicada entonces.

### Promociones

- la promoción original no se reaplica;
- una promoción nueva solo aplica si su configuración declara expresamente que admite upgrades de servicio;
- si ninguna promoción admite upgrades, se usa el precio vigente sin promoción;
- nunca se genera diferencia negativa ni devolución por este flujo.

La cotización de preparación es informativa. El valor definitivo se fija al confirmar y queda guardado como snapshot.

## Ledger

No se agrega un enum financiero nuevo en el MVP.

La diferencia usa los tipos existentes:

- `EVENT_ACTIVATION_CHARGE` para la porción consumida de saldo comprado;
- `CREDIT_LINE_USAGE` para la porción financiada;
- `PROMOTION_DISCOUNT` solo si una promoción admite explícitamente upgrades.

Todos los movimientos deben incluir metadata:

```json
{
  "operationKind": "SERVICE_UPGRADE",
  "fromService": "FLYER",
  "toService": "FLIPBOOK",
  "originalActivationOperationId": "uuid",
  "pendingDesignId": "uuid"
}
```

Reglas:

- saldo comprado se consume primero;
- después se usa línea disponible;
- operación idempotente;
- comprobante interno propio del upgrade;
- no modificar ni reemplazar el cargo de activación original;
- no usar `EVENT_CREDIT_REFUND`;
- no generar ingreso MXN nuevo salvo que exista una compra de créditos separada y aprobada.

Para este workflow, `EVENT_ACTIVATION_CHARGE` representa un cargo adicional asociado al servicio de un Evento ya activado; la metadata `operationKind=SERVICE_UPGRADE` es obligatoria.

## FileAsset y diseño

Esta es la única excepción MVP al congelamiento general del diseño después de activar.

Durante `PREPARING` o `READY`:

- el Flyer activo no se modifica;
- las páginas Flipbook se almacenan como FileAssets privados del mismo Cliente y Evento;
- los assets pendientes no son accesibles por token público;
- no se reemplaza el puntero del diseño público.

Al confirmar:

- el nuevo Flipbook pasa a ser el diseño activo;
- el Flyer anterior se marca `HIDDEN` y se conserva para auditoría;
- hotspots del Flipbook pasan a activos;
- el cambio de referencias ocurre atómicamente con el cargo;
- no se regeneran tokens de Invitación o QR.

Al cancelar o expirar:

- assets pendientes quedan `HIDDEN` o `DELETED` lógico;
- no se toca el Flyer público;
- no existe hard delete inmediato.

## Expiración automática

Si el Evento llega a `event_day` con upgrade pendiente:

- el upgrade se marca expirado/cancelado técnicamente;
- no se cobra;
- el Flyer continúa como servicio y diseño activo;
- los assets pendientes se ocultan;
- se registra auditoría;
- no puede reanudarse después.

El proceso debe ser idempotente.

## UI/UX

En Evento `active`, el Resumen puede mostrar:

- CTA `Mejorar a Flipbook` solo si el servicio actual es Flyer y aún no es `event_day`;
- cotización estimada;
- estado de preparación;
- acceso al editor privado;
- preview privado;
- acciones cancelar y confirmar cambio.

Antes de confirmar, mostrar:

- costo Flyer reconocido;
- precio Flipbook vigente;
- promoción de upgrade si aplica;
- diferencia final;
- fuente de cobro: saldo/línea/mixto;
- advertencia de que no existe downgrade ni devolución.

No mostrar el CTA para QR pase físico, Flipbook, `event_day`, `closed`, `album_published`, `archived` o `cancelled`.

## Auditoría

Registrar al menos:

- inicio de preparación;
- cambios del diseño pendiente;
- cancelación/expiración;
- cotización final;
- ledger/comprobante relacionados;
- servicio antes/después;
- diseño antes/después;
- actor y timestamps.

## Errores de dominio

- `SERVICE_UPGRADE_NOT_ALLOWED`
- `SERVICE_UPGRADE_INVALID_SOURCE`
- `SERVICE_UPGRADE_INVALID_TARGET`
- `SERVICE_UPGRADE_EVENT_DAY_REACHED`
- `SERVICE_UPGRADE_ALREADY_PENDING`
- `SERVICE_UPGRADE_NOT_READY`
- `SERVICE_UPGRADE_PRICE_CHANGED`
- `SERVICE_UPGRADE_INSUFFICIENT_CREDITS`
- `SERVICE_UPGRADE_EXPIRED`
- `SERVICE_UPGRADE_DUPLICATE_OPERATION`

## Pruebas mínimas

- Flyer `active` antes de fecha permite preparar;
- otro servicio/estado rechaza;
- Planner de Organización no opera Evento ajeno;
- preparar no cobra ni cambia vista pública;
- Flipbook incompleto no confirma;
- diferencia usa precio vigente y costo Flyer reconocido;
- promoción no se reaplica salvo permiso explícito;
- saldo comprado se consume antes de línea;
- retry con misma idempotency key no cobra dos veces;
- commit cambia diseño y servicio atómicamente;
- fallo de storage/ledger no cambia diseño público;
- tokens de Invitación y QR se conservan;
- cancelar no cobra y mantiene Flyer;
- llegada a `event_day` expira preparación sin cobrar;
- no existe downgrade ni conversión desde QR pase físico.

## Tarea Codex

El cambio de servicio post-activación debe implementarse como una tarea independiente después de:

- EventsModule y máquina de estados;
- FinanceModule y ledger;
- InvitationDesignModule y FileAssets;
- Confirmación pública/QR;
- autorización/ownership.

No mezclar esta tarea con el vertical slice inicial.