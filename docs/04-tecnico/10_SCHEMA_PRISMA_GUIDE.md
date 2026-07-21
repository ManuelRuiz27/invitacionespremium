# 10 — Schema Prisma Guide

## IDs

Usar UUID.

## Timestamps

Tablas importantes deben incluir:

- `created_at`
- `updated_at`
- `deleted_at`

Usar nombres y estrategia consistentes en Prisma y PostgreSQL.

## Borrado lógico

Aplicar por defecto a entidades principales.

Las consultas operativas deben excluir `deleted_at` salvo acciones administrativas explícitas de Platform Admin.

## Enums

Modelar estados como enums controlados.

### `event_status`

- `draft`
- `configured`
- `ready_to_activate`
- `active`
- `event_day`
- `closed`
- `album_published`
- `archived`
- `cancelled`

### Otros enums mínimos

- `invitation_status`
- `assistant_status`
- `payment_status`
- `credit_line_status`
- `ledger_movement_type`
- `file_asset_status`
- `floorplan_shape_type`

Los valores exactos deben corresponder a los documentos especializados. No agregar estados por conveniencia del frontend.

## JSON metadata

Permitir JSON para:

- coordenadas de hotspot;
- theme settings;
- personalización de álbum;
- visual settings de Evento;
- metadata de auditoría;
- asignaciones detalladas de pagos/devoluciones;
- configuración variable que no requiera integridad relacional propia.

No usar JSON para ocultar entidades que requieren consultas, unicidad, ownership o relaciones.

## Contacto y Asistente

Separar.

No mezclar en una misma tabla.

- Contacto recibe WhatsApp/link.
- Asistente es nominal, confirma, puede tener mesa y recibe check-in individual.
- Contacto principal siempre genera Asistente principal.

## Invitación

Entidad central que une:

- Evento;
- Contacto;
- QR;
- Asistentes;
- Confirmación.

Campos conceptuales mínimos:

- `id`;
- `event_id`;
- `contact_id`;
- `public_token_hash` o estrategia equivalente segura;
- `status`;
- `qr_token_hash` o referencia QR;
- `album_access_token_hash` opcional;
- `album_access_expires_at` opcional;
- `created_at`;
- `updated_at`;
- `deleted_at`.

Reglas:

- token de Invitación, token QR y token de Álbum son distintos;
- una Invitación cancelada conserva capacidad de resolver su vista pública de cancelación;
- cancelar no elimina el token ni el registro;
- el token de Álbum solo existe cuando el álbum está publicado y la Invitación es elegible;
- al despublicar, archivar o expirar el álbum, el acceso de Álbum queda inválido;
- almacenar hashes de tokens cuando la recuperación del secreto completo no sea necesaria.

## Check-in

Un Asistente solo puede tener un check-in válido simultáneamente.

Reversión:

- no eliminar;
- marcar como revertido;
- registrar `reverted_at` y actor;
- crear auditoría.

La base de datos debe impedir dos check-ins activos para el mismo Asistente mediante constraint, índice parcial PostgreSQL o estrategia transaccional equivalente probada.

Campos conceptuales:

- `assistant_id`;
- `event_id`;
- `staff_token_id` o `actor_user_id`;
- `checked_in_at`;
- `reverted_at`;
- `reverted_by_user_id`;
- metadata operativa sin teléfonos.

## QR pase físico

Un PaseFisicoQR solo puede usarse una vez.

Debe existir protección de unicidad/idempotencia para impedir doble uso concurrente.

## StaffToken

Campos conceptuales:

- `event_id`;
- `token_hash`;
- `alias`;
- `created_by_user_id`;
- `expires_at`;
- `expired_at`;
- `created_at`.

Reglas:

- máximo tres tokens activos por Evento;
- tokens expirados no cuentan como activos;
- cerrar o cancelar expira los tokens activos;
- reabrir no reactiva tokens expirados;
- no existe revocación manual en MVP.

## Finanzas

Usar:

- ledger como fuente de verdad;
- balance cache para consulta rápida;
- créditos enteros;
- importes MXN en centavos enteros;
- snapshots históricos para valores y precios.

### LedgerEntry

Campos conceptuales mínimos:

- `id`;
- `client_id`;
- `event_id` opcional;
- `actor_user_id` opcional;
- `movement_type`;
- `purchased_credit_delta` entero;
- `credit_line_used_delta` entero;
- `debt_delta` entero;
- `cash_mxn_delta` entero en centavos;
- `credit_unit_value_mxn_cents_snapshot` opcional;
- `operation_reference`;
- `idempotency_key`;
- `related_ledger_entry_id` opcional;
- `reverses_ledger_entry_id` opcional;
- `payment_id` opcional;
- `promotion_id` opcional;
- `receipt_id` opcional;
- `due_at` opcional;
- `allocation_metadata` opcional;
- `metadata`;
- `created_at`.

Reglas:

- ledger confirmado es inmutable;
- no aplicar `updated_at` para modificar efectos financieros confirmados;
- correcciones mediante movimientos compensatorios;
- `idempotency_key` única por contexto de operación;
- `CREDIT_LINE_USAGE` funciona como referencia del lote histórico de deuda;
- pagos y devoluciones deben referenciar las porciones de ledger que liquidan o compensan;
- solo Pago `approved` genera movimiento financiero confirmado.

### Balance cache

Debe contener al menos:

- `purchased_credits_available`;
- `credit_line_limit`;
- `credit_line_used`;
- `credit_line_available`;
- `debt_credits_outstanding`;
- `debt_mxn_cents_outstanding`;
- `last_ledger_sequence` o versión equivalente;
- `updated_at`.

El cache debe reconstruirse desde ledger. No es fuente autónoma.

### Pago

Guardar:

- importe MXN en centavos;
- estado;
- proveedor/origen;
- referencia externa;
- idempotency key;
- fecha de aprobación;
- metadata;
- relación con movimientos generados.

## Comprobantes

Folio consecutivo global.

El folio debe protegerse contra concurrencia mediante secuencia PostgreSQL o mecanismo transaccional equivalente.

Un comprobante puede agrupar varios movimientos de una misma operación.

## Auditoría

Debe soportar:

- `before_data`;
- `after_data`;
- `metadata`;
- actor usuario o StaffToken;
- Evento/Cliente afectados;
- fecha/hora.

## FileAsset

Usar entidad común para archivos:

- flyer;
- páginas flipbook;
- croquis;
- fotos álbum;
- reportes PDF.

Campos sugeridos:

- `id`;
- `client_id`;
- `event_id` opcional;
- `owner_type`;
- `owner_id`;
- `file_type`;
- `storage_key`;
- `original_name`;
- `mime_type`;
- `size_bytes`;
- `checksum`;
- `status`;
- `created_at`;
- `deleted_at`.

Las relaciones y permisos deben obedecer `FILE_ASSET_POLICY.md`.

## Hotspot

Entidad separada.

No guardar solo como JSON dentro de Flyer/Flipbook.

Campos conceptuales:

- tipo;
- página/archivo;
- coordenadas relativas;
- acción;
- link destino;
- activo/inactivo.

## Croquis shapes

Mesas y zonas en misma entidad con tipo:

- `table`
- `decorative_zone`

Capacidad `0` solo corresponde a zona decorativa no asignable.

## Servicios contratados

Catálogo editable por Platform Admin:

- Flipbook
- Flyer
- QR pase físico
- Demo

## Precios

Precios con historial:

- válido desde;
- válido hasta;
- creado por;
- costo Planner;
- costo Organización.

Una activación guarda snapshot del precio utilizado. No sobrescribir historia.

## Promociones

Campos conceptuales:

- Cliente específico;
- servicio específico;
- aplica a compra de créditos;
- aplica a activación de Evento;
- rango de fechas;
- permite acumulación;
- aplica a Organizaciones;
- estado activa/inactiva.

## Validaciones críticas

El límite de 150 Contactos se valida en:

- frontend;
- backend.

Backend manda.

También validar en backend:

- máximo tres StaffTokens activos;
- capacidad de mesa;
- capacidad del Evento;
- unicidad de check-in activo;
- unicidad de uso de PaseFisicoQR;
- idempotencia financiera;
- transiciones de Evento;
- ownership de todos los recursos hijos.

## Índices y constraints recomendados

- token público de Invitación único.
- token QR único.
- token de Álbum único cuando exista.
- token Staff único.
- `idempotency_key` financiera única por contexto.
- `operation_reference` indexada.
- `event_id` en tablas operativas.
- `client_id` en Eventos, FileAssets y finanzas.
- `deleted_at` para queries soft-delete.
- `created_at` en auditoría y ledger.
- índice para lotes de deuda pendientes por `client_id`, `due_at`, `created_at`.
- constraint o índice que impida dos check-ins activos por Asistente.
- constraint o estrategia transaccional que impida segundo uso de PaseFisicoQR.