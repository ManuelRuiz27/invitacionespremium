# 01 — Glosario y modelo conceptual

## Nombre del sistema

**InvitacionesPremium bt Soft-Monky**

## Principio rector

Usar este glosario como lenguaje obligatorio en documentación, código, UI y contratos API. No introducir sinónimos técnicos que generen ambigüedad.

## Cliente

Entidad comercial general administrada por Platform Admin.

Tipos permitidos:

- **Planner**
- **Organización**

Todo Evento, saldo, línea, movimiento financiero y recurso operativo pertenece a un Cliente.

## Planner independiente

Cliente que se registra desde la landing, compra créditos propios y gestiona sus propios Eventos.

En UI puede usarse “Planner”. En reglas técnicas usar “Planner independiente” cuando sea necesario distinguirlo del Planner de Organización.

## Organización

Cliente creado por Platform Admin. Puede representar agencia, salón, jardín, empresa u otro cliente comercial.

No existen entidades separadas para salón, jardín, agencia o empresa. Todas se modelan como Organización.

## Platform Admin

Usuario de plataforma que administra:

- Clientes;
- Organizaciones/usuarios iniciales;
- créditos manuales;
- línea/deuda/pagos;
- precios/promociones;
- lectura administrativa de Eventos;
- reportes generales;
- auditoría.

No pertenece a un Cliente operativo y no impersona Clientes.

## Usuario

Identidad autenticada permanente.

Puede ser:

- Platform Admin;
- Planner independiente;
- Admin de Organización;
- Planner de Organización.

Staff y Público por token no son Usuarios permanentes.

## Admin de Organización

Usuario interno de una Organización que:

- contrata/paga;
- compra créditos;
- ve saldo, deuda y línea;
- activa y opera Eventos de la Organización;
- puede crear Planner de Organización.

## Planner de Organización

Usuario interno que crea y opera únicamente los Eventos que le corresponden dentro de una Organización.

No:

- compra créditos;
- ve saldo/deuda;
- ve reportes financieros;
- opera Eventos creados por otro Planner de Organización.

## Staff por token

Acceso temporal sin login para un Evento específico.

Puede:

- escanear QR;
- buscar Invitación exacta;
- registrar check-in;
- ver plano/mesa si existe.

Restricciones:

- solo opera con Evento `active` o `event_day`;
- no ve teléfonos;
- no ve dashboard/asistencia global en tiempo real;
- no ve reportes finales;
- no revierte check-in;
- no registra extras anónimos;
- no accede a otro Evento.

## Evento

Unidad principal de trabajo que agrupa:

- datos/fecha/zona horaria;
- Cliente y usuario creador;
- servicio contratado;
- Contactos;
- Invitaciones;
- Confirmación de asistencia;
- Croquis/Mesas, si aplica;
- Staff;
- check-in;
- reportes;
- Álbum, si aplica;
- estados y auditoría.

## Servicio contratado

Servicio que define el tipo operativo/comercial del Evento.

Servicios MVP:

- Flipbook
- Flyer
- QR pase físico
- Demo

No usar “producto” en UI. Usar “servicio contratado”.

## Tipo social

Clasificación social del Evento:

- Boda
- XV años
- Corporativo
- Cumpleaños
- Otro

## Contacto

Persona principal que recibe el WhatsApp y el link único de la Invitación.

Campos conceptuales:

- nombre;
- teléfono WhatsApp;
- Grupo opcional;
- Invitación asociada.

No representa cada persona que ingresa.

## Invitación

Unidad enviada por link único a un Contacto principal.

Una Invitación puede contener uno o varios Asistentes nominales.

Tiene:

- token de Invitación;
- estado general de Confirmación;
- QR;
- Asistentes;
- cancelación específica opcional;
- token de Álbum opcional y separado.

## Invitado

No usar “Invitado” como entidad técnica principal.

En modelo técnico usar:

- Contacto
- Invitación
- Asistente

“Invitado” puede usarse solo como lenguaje natural de UI cuando no genere ambigüedad.

## Asistente

Persona nominal que puede:

- confirmar/estar incluida en Confirmación;
- tener Mesa asignada;
- registrar check-in individual.

Check-in pertenece a Asistente, no a Invitación.

## Plus / Acompañantes

- **Plus**: singular.
- **Acompañantes**: plural.

Son Asistentes adicionales dentro de la misma Invitación.

## Familiar nominal

Invitación con varios Asistentes cuyos nombres deben registrarse individualmente.

## Grupo

Etiqueta opcional para clasificar Contactos/Asistentes.

Ejemplos:

- Fam. Novio
- Fam. Novia
- Trabajo

## Confirmación de asistencia

Flujo público mediante el cual el Contacto:

- confirma o rechaza;
- registra Asistentes nominales;
- modifica la respuesta mientras esté abierta y dentro de límites.

“RSVP” se usa solo como término técnico interno. En UI usar **Confirmación de asistencia**.

No confundir su estado con el estado del Evento.

## Token

Secreto opaco/no adivinable que concede un acceso limitado.

Tipos separados:

- token de Invitación;
- token QR;
- token de Álbum;
- token Staff.

Regla: un token no puede utilizarse para otro propósito.

Cuando no sea necesario recuperar el secreto completo, almacenar hash o estrategia segura equivalente.

## Token de Invitación

Permite resolver una Invitación pública específica.

- No concede acceso a otras Invitaciones.
- No funciona como token de Álbum/Staff/QR.
- Si la Invitación o Evento fueron cancelados, conserva únicamente la vista pública de cancelación.
- Al archivar, deja de exponer contenido público.

## QR de Invitación

QR único asociado a una Invitación confirmada.

Al escanearlo permite registrar check-in individual de sus Asistentes pendientes.

- Solo opera con Evento `active` o `event_day`.
- No contiene nombre/teléfono directamente.
- Cancelación, cierre o archivado bloquea su operación conforme al estado.

## Token de Álbum

Token público distinto generado para una Invitación elegible cuando el Álbum se publica.

Requiere:

- al menos un Asistente ingresado en esa Invitación;
- Evento `album_published`;
- token no expirado.

Expira al despublicar, archivar o cumplir 30 días de publicación.

## StaffToken

Token temporal asociado a un Evento.

- máximo tres activos por Evento;
- expira al cerrar/cancelar;
- no se reactiva al reabrir;
- expirados no cuentan como activos;
- no existe revocación manual MVP.

## QR pase físico

QR individual usado como reemplazo de pase impreso, asociado a una Mesa si existe y bloqueado tras su primer uso.

No tiene Contacto, Confirmación nominal ni Álbum.

## Croquis

Imagen/plano del recinto sobre el que se dibujan Mesas, zonas y etiquetas.

## Mesa

Zona asignable dentro del Croquis con:

- nombre/número;
- forma;
- posición;
- capacidad mayor a cero.

## Zona decorativa

Área no asignable del Croquis, con capacidad 0, usada para señalar referencias como:

- pista;
- baños;
- entrada;
- barra.

## Hotspot

Área clicable sobre Flyer o Flipbook que ejecuta una acción:

- confirmar asistencia;
- abrir ubicación;
- abrir mesa de regalos;
- abrir link adicional;
- mostrar QR.

Hotspot es entidad separada; no se guarda únicamente dentro de JSON del diseño.

## Check-in

Registro de entrada de un Asistente o uso de PaseFisicoQR.

- individual;
- idempotente;
- un check-in válido por Asistente;
- reversible solo por usuario autorizado;
- reversión conserva auditoría.

## Crédito

Unidad interna entera usada para activar Eventos y calcular:

- saldo comprado;
- promociones;
- línea de crédito;
- deuda.

Valor inicial: $20 MXN. Operaciones históricas guardan snapshot de valor cuando corresponde.

## Saldo comprado

Créditos adquiridos mediante dinero real o devueltos/asignados conforme a reglas.

Se consumen antes que la línea de crédito.

No confundir con línea disponible.

## Línea de crédito

Créditos prestados autorizados por Platform Admin para que el Cliente active Eventos y genere deuda.

Campos conceptuales:

- límite;
- usado;
- disponible;
- estado;
- vigencia opcional.

## Deuda

Obligación originada por `CREDIT_LINE_USAGE`.

Se expresa en:

- créditos pendientes;
- equivalente MXN calculado con el valor histórico de cada lote.

Cambios futuros al valor del crédito no recalculan deuda existente.

## Ledger

Fuente de verdad financiera inmutable.

Todo cambio de saldo, línea, deuda o ingreso real se representa mediante movimiento permitido en `LEDGER_TYPES.md`.

Correcciones usan movimientos compensatorios; no se edita/elimina el movimiento original.

## Balance cache

Proyección optimizada para consulta rápida de:

- saldo comprado;
- línea usada/disponible;
- deuda pendiente.

Puede reconstruirse desde ledger y nunca sustituye su fuente de verdad.

## Pago

Registro de dinero real recibido o procesado.

Solo estado `approved` puede generar compra de créditos o pago de deuda confirmado.

Un Pago puede relacionarse con varios movimientos de una misma operación.

## Comprobante interno

Documento interno con folio consecutivo global que agrupa una operación y uno o varios movimientos financieros.

No es CFDI.

## Álbum

Vista post-Evento con hasta 35 fotos, mensaje y link externo opcional.

- solo Flyer/Flipbook;
- se crea antes del cierre y se publica después;
- visible mediante token de Álbum para Invitaciones elegibles;
- vigencia pública 30 días;
- al expirar, Evento se archiva.

## Reporte operativo

PDF bajo demanda generado desde plantilla HTML en frontend autorizado y almacenado vía API como FileAsset.

- no incluye teléfonos;
- detalle con nombres disponible máximo 30 días post-Evento;
- después solo versión agregada/anónima;
- historial de seis meses conserva metadata/agregados.

## FileAsset

Registro común para archivos almacenados.

Separa:

- `owner_type`/`owner_id`: recurso dueño;
- `file_type`: contenido lógico;
- metadata/storage/status.

Todo FileAsset pertenece a Cliente y, cuando aplica, a Evento.

## Borrado lógico

Ocultar el registro al usuario sin eliminar auditoría, finanzas ni datos necesarios para trazabilidad/restauración.

No equivale a estado del Evento.

## Anonimización

Proceso automático 30 días post-Evento que elimina o reemplaza nombres/teléfonos conservando métricas y relaciones técnicas necesarias.

No puede evadirse mediante PDFs, logs o FileAssets.

## Archivado

Estado final del Evento que:

- oculta links públicos de Invitación/Álbum;
- expira accesos vigentes;
- no permite reapertura;
- conserva datos y archivos según retención.

## Cancelado

Evento que:

- muestra mensaje público de cancelación mediante token de Invitación;
- bloquea Confirmación;
- bloquea QR/check-in;
- expira StaffTokens y tokens de Álbum;
- conserva datos/finanzas/auditoría.

No eliminar el token de Invitación necesario para mostrar el mensaje.