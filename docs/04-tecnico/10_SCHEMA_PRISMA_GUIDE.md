# 10 — Schema Prisma Guide

## IDs

Usar UUID.

## Timestamps

Tablas importantes deben incluir:

- `created_at`
- `updated_at`
- `deleted_at`

## Borrado lógico

Aplicar por defecto a entidades principales.

## Enums

Modelar estados como enums controlados:

- `event_status`
- `invitation_status`
- `assistant_status`
- `payment_status`
- `credit_line_status`

## JSON metadata

Permitir JSON para:

- coordenadas de hotspot;
- theme settings;
- personalización de álbum;
- visual settings de evento;
- metadata de auditoría;
- configuración variable.

## Contacto y Asistente

Separar.

No mezclar en una misma tabla.

## Invitación

Entidad central que une:

- Evento;
- Contacto;
- QR;
- Asistentes;
- Confirmación.

## Check-in

Un Asistente solo puede tener un check-in válido.

Reversión:

- no eliminar;
- marcar como revertido;
- crear auditoría.

## QR pase físico

Un PaseFisicoQR solo puede usarse una vez.

## Finanzas

Usar:

- ledger como fuente de verdad;
- balance cache para consulta rápida.

## Comprobantes

Folio consecutivo global.

## Auditoría

Debe soportar:

- `before_data`;
- `after_data`;
- `metadata`.

## FileAsset

Usar entidad común para archivos:

- flyer;
- páginas flipbook;
- croquis;
- fotos álbum;
- reportes PDF.

Campos sugeridos:

- id;
- owner_type;
- owner_id;
- file_type;
- storage_key;
- original_name;
- mime_type;
- size_bytes;
- status;
- created_at;
- deleted_at.

## Hotspot

Entidad separada.

No guardar solo como JSON dentro de flyer/flipbook.

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

## Promociones

Campos conceptuales:

- cliente específico;
- servicio específico;
- aplica a compra de créditos;
- aplica a activación de evento;
- rango de fechas;
- permite acumulación;
- aplica a Organizaciones;
- estado activa/inactiva.

## Validaciones críticas

El límite de 150 contactos se valida en:

- frontend;
- backend.

Backend manda.

## Índices recomendados

- token público de invitación único.
- token QR único.
- token staff único.
- event_id en tablas operativas.
- client_id en eventos/finanzas.
- deleted_at para queries soft-delete.
- created_at en auditoría/ledger.
