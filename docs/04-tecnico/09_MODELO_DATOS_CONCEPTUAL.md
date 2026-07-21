# 09 — Modelo de datos conceptual

## Entidades conceptuales base

- Cliente
- Usuario
- Evento
- Contacto
- Invitación
- Asistente
- Grupo
- Servicio contratado
- Tipo social
- Flyer
- Flipbook
- Hotspot
- Croquis
- Mesa/Zona
- StaffToken
- CheckIn
- PaseFisicoQR
- Álbum
- FotoÁlbum
- Crédito/Ledger
- Línea de crédito
- Pago
- Promoción
- Comprobante interno
- Auditoría
- FileAsset

No agregar entidades de negocio distintas sin aprobación. Las relaciones técnicas necesarias deben preservar este modelo y el lenguaje definido.

## Cliente

Entidad base con tipo controlado:

- Planner
- Organización

Todo Evento, saldo, línea, movimiento financiero y archivo operativo pertenece a un Cliente.

## Planner

Es Cliente con:

- un usuario principal de tipo Planner independiente;
- saldo propio;
- Eventos propios;
- capacidad de comprar créditos;
- capacidad de activar Eventos.

Planner no crea usuarios internos permanentes en MVP.

## Organización

Es Cliente con:

- uno o varios usuarios internos;
- saldo propio;
- Eventos propios;
- posible línea de crédito.

No existen entidades separadas para salón, jardín, agencia o empresa.

## Usuario

Puede ser:

- Platform Admin, sin pertenecer a un Cliente operativo;
- Planner independiente, perteneciente a un Cliente tipo Planner;
- Admin de Organización, perteneciente a un Cliente tipo Organización;
- Planner de Organización, perteneciente a un Cliente tipo Organización.

Reglas:

- un usuario de Cliente pertenece a un solo Cliente;
- el rol debe ser compatible con el tipo de Cliente;
- Planner de Organización no cambia de `client_id` por datos enviados desde frontend;
- Platform Admin no impersona ni se asocia como usuario interno del Cliente.

## Evento

Pertenece a:

- Cliente;
- usuario creador.

Tiene al menos:

- servicio contratado;
- tipo social;
- estado técnico;
- fecha/hora;
- zona horaria;
- capacidad;
- configuración de Confirmación;
- flags de módulos opcionales;
- timestamps y borrado lógico.

Ownership:

- Planner independiente opera Eventos de su Cliente;
- Admin de Organización opera todos los Eventos de su Organización;
- Planner de Organización opera únicamente los que creó.

## Servicio contratado

Catálogo editable:

- Flipbook
- Flyer
- QR pase físico
- Demo

El Evento activado conserva snapshot del precio y descuento utilizados.

## Tipo social

Catálogo:

- Boda
- XV años
- Corporativo
- Cumpleaños
- Otro

## Contacto

Representa la persona principal que recibe WhatsApp y link de Invitación.

Tiene:

- nombre;
- teléfono WhatsApp;
- Grupo opcional;
- Invitación asociada;
- timestamps y borrado lógico.

Contacto no representa cada persona que puede ingresar.

## Invitación

Pertenece a:

- Evento;
- Contacto.

Tiene:

- token público de Invitación;
- QR de Invitación;
- uno o varios Asistentes;
- estado general de Confirmación;
- estado de cancelación específica;
- token de Álbum opcional y separado;
- expiración de acceso a Álbum;
- timestamps y borrado lógico.

Reglas:

- token de Invitación, QR y token de Álbum no son intercambiables;
- una Invitación cancelada conserva su link para mostrar el mensaje de cancelación;
- cancelación bloquea Confirmación y QR;
- token de Álbum solo se genera al publicar para Invitaciones elegibles;
- archivar, despublicar o expirar invalida el token de Álbum.

## Asistente

Pertenece a Invitación.

El Contacto principal siempre genera Asistente principal.

Plus/acompañantes son Asistentes adicionales.

Tiene conceptualmente:

- nombre nominal;
- estado individual de asistencia;
- mesa opcional;
- check-in válido opcional;
- indicador anonimizado cuando aplique.

## Grupo

Pertenece a Evento.

Contacto puede no tener Grupo.

Asistentes heredan Grupo del Contacto para clasificación, sin duplicar ownership.

## Confirmación

La Invitación tiene estado general de Confirmación.

Cada Asistente tiene estado individual nominal.

La implementación puede usar campos o una estructura relacional, pero debe permitir:

- confirmar/rechazar Invitación;
- modificar lista nominal mientras esté abierta;
- identificar Asistentes confirmados;
- conservar historial/auditoría de cambios.

No mezclar Confirmación con estado del Evento.

## QR de Invitación

Pertenece a Invitación.

Contiene token opaco o URL controlada; no contiene teléfono ni nombre en texto.

Solo es operativo con Evento `active` o `event_day` e Invitación confirmada.

## Check-in

Para Evento con Invitación pertenece a Asistente.

Reglas:

- un Asistente solo puede tener un check-in válido simultáneo;
- reversión conserva registro y auditoría;
- actor puede ser StaffToken para entrada o usuario autorizado para reversión;
- no pertenece a Invitación como unidad de acceso.

## Croquis

Pertenece a Evento.

Tiene un FileAsset de imagen activo y shapes relacionados.

## Mesa/Zona

Pertenece a Croquis.

Puede ser:

- mesa asignable con capacidad mayor a cero;
- zona decorativa con capacidad cero.

## Asignación de mesa

Pertenece a Asistente.

Debe permitir cambio auditado, incluso posterior a check-in, conforme a permisos.

## StaffToken

Pertenece a Evento.

Tiene:

- token secreto almacenado de forma segura;
- alias;
- creador;
- timestamps de creación/expiración;
- estado derivado de expiración.

Reglas:

- máximo tres activos por Evento;
- solo opera en `active` o `event_day`;
- cerrar/cancelar expira activos;
- reabrir no reactiva expirados.

## QR pase físico

Pertenece a Evento.

Puede tener mesa si existe.

Tiene:

- token QR único;
- número de pase;
- estado usado/no usado;
- timestamp y actor de uso.

Si no hay croquis/mesa, muestra:

- QR;
- número de pase;
- nombre del Evento/salón.

No tiene Contacto, Confirmación nominal ni Álbum.

## Álbum

Pertenece a Evento.

Tiene:

- título;
- agradecimiento/mensaje;
- colores/configuración visual;
- link externo opcional;
- fecha de publicación;
- fecha de expiración;
- estado publicado/no publicado derivado del Evento;
- máximo 35 fotos.

## Fotos

Pertenecen a Álbum.

Cada FotoÁlbum se relaciona con un FileAsset y conserva posición/orden.

## Acceso a Álbum

Se determina por Invitación con al menos un Asistente ingresado.

Al publicar:

- se genera token de Álbum distinto para cada Invitación elegible;
- el token resuelve la Invitación para verificar elegibilidad;
- no expone otros Contactos ni Asistentes;
- expira a los 30 días o antes por despublicación/archivado.

La elegibilidad de asistencia se conserva como dato operativo aun después de anonimizar nombres.

## Créditos

Saldo pertenece a Cliente.

Se compone de créditos comprados disponibles y se calcula desde ledger, con balance cache para lectura.

Créditos son enteros en MVP.

## Línea de crédito

Pertenece a Cliente.

Tiene:

- límite en créditos;
- usado en créditos;
- disponible en créditos;
- estado;
- vigencia opcional;
- notas administrativas.

No es saldo comprado.

## Movimiento financiero

Asociado a:

- Cliente;
- usuario actor si aplica;
- Evento si aplica;
- Pago si aplica;
- Promoción si aplica;
- Comprobante si aplica;
- movimiento relacionado/revertido si aplica.

Contiene:

- deltas enteros de créditos;
- monto MXN en centavos si aplica;
- valor unitario MXN histórico si aplica;
- tipo de movimiento;
- referencia de operación;
- idempotencia;
- fecha;
- metadata de asignaciones.

Un `CREDIT_LINE_USAGE` funciona como lote histórico de deuda. No requiere una entidad comercial adicional.

## Promoción

Puede aplicar a:

- Cliente específico;
- servicio contratado específico;
- compra de créditos;
- activación de Evento;
- rango de fechas.

Conserva regla de acumulación y snapshot del resultado aplicado.

## Pago

Pertenece a Cliente.

Puede relacionarse con uno o varios movimientos financieros de una misma operación.

Tiene:

- monto MXN en centavos;
- estado;
- proveedor/origen;
- referencia externa;
- idempotencia;
- timestamps de creación/aprobación;
- metadata.

Solo estado `approved` genera movimientos confirmados.

## Comprobante interno

Pertenece a Cliente y a una operación financiera.

Puede agrupar uno o varios movimientos financieros.

Tiene:

- folio consecutivo global;
- tipo de operación;
- fecha;
- totales en créditos/MXN;
- referencias relacionadas.

## Auditoría

Relaciona:

- usuario actor si existe;
- StaffToken actor si aplica;
- actor público por token sin guardar el secreto si aplica;
- Cliente afectado;
- Evento afectado si aplica;
- acción realizada;
- fecha/hora;
- before/after;
- metadata del cambio.

## FileAsset

Pertenece a:

- Cliente;
- Evento si aplica;
- recurso owner existente.

Separa:

- `owner_type`/`owner_id`, que identifican el recurso dueño;
- `file_type`, que identifica el contenido almacenado.

No existe archivo operativo sin ownership.

## Borrado lógico

Entidades importantes deben soportar borrado lógico:

- Cliente
- Evento
- Invitación
- Contacto
- Asistente
- Croquis
- Álbum
- FileAsset

No aplicar hard delete a ledger, auditoría, comprobantes ni pagos confirmados.

## Anonimización

Después de 30 días post-Evento se anonimizan:

- nombres de Contactos;
- teléfonos;
- nombres de Asistentes.

Se conservan:

- identificadores técnicos no públicos necesarios para relaciones;
- totales;
- Confirmaciones agregadas;
- asistencias/check-ins;
- elegibilidad de Álbum;
- ingresos;
- uso de créditos;
- auditoría sin datos personales innecesarios;
- reportes agregados.

### Reportes y datos personales

- reportes detallados con nombres solo están disponibles dentro de la ventana de 30 días post-Evento;
- no incluir teléfonos en reportes operativos;
- al ejecutar anonimización, los FileAssets de reportes detallados con nombres deben ocultarse o reemplazarse por versión anonimizada;
- historial de seis meses conserva metadata y reportes agregados/anónimos, no nombres ni teléfonos;
- un PDF no puede utilizarse para evadir la política de anonimización.