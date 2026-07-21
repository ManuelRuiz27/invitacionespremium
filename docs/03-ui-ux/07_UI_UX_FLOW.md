# 07 — UI/UX Flow

## Estilo general

Premium, elegante y sobrio.

Principios:

- claridad antes que densidad;
- pocos datos prioritarios por vista;
- estados y acciones en lenguaje natural;
- confirmación explícita en acciones irreversibles o sensibles;
- responsive desde tablet y desktop, con soporte móvil;
- accesibilidad básica: foco visible, labels, contraste y navegación por teclado cuando aplique.

## Paneles

Client/Admin:

- dashboard visual con pocos datos;
- scorecards;
- cards;
- tablas limpias cuando aplique;
- skeleton/loading;
- empty states;
- errores accionables;
- no mostrar datos fuera del permiso del rol.

## Landing

Repo: `invitacionespremium-landing`.

La landing debe vender:

- SaaS para Planners y Organizaciones;
- experiencia premium;
- control de acceso;
- operación del Evento, no solo diseño de invitación.

Secciones:

- Hero
- Problema
- Solución
- Servicios: Flipbook / Flyer / QR pase físico
- Demo visual mock
- Precios
- Para Planners
- Para Organizaciones
- Preguntas frecuentes
- CTA registro/login

Registro público únicamente para Planner independiente.

## Dashboard Cliente

Primer vistazo:

- Eventos próximos;
- Eventos activos;
- créditos disponibles si el rol puede verlos;
- deuda/línea si el rol puede verla;
- alertas visuales;
- botón crear Evento;
- demo.

### Visibilidad por rol

- Planner independiente: saldo, movimientos propios y deuda si existe.
- Admin de Organización: saldo, línea/deuda y todos los Eventos de la Organización.
- Planner de Organización: solo Eventos creados por él; no saldo, deuda ni reportes financieros.

Ocultar navegación no sustituye autorización backend.

## Lista de Eventos

Debe permitir alternar:

- cards;
- tabla.

Cada elemento muestra como mínimo:

- nombre;
- fecha;
- servicio contratado;
- estado visible;
- acción principal permitida;
- alerta operativa si aplica.

No mostrar estados técnicos.

## Wizard de Evento

- Stepper horizontal en desktop/tablet.
- Stepper vertical en mobile.
- Autosave + guardado manual.
- Si sale incompleto, guarda borrador automáticamente.
- Backend recalcula `configured` y `ready_to_activate`.
- Revisión final muestra costo, descuento, fuente de cobro y bloqueos antes de activar.

### Flipbook/Flyer

1. Datos del Evento
2. Contactos
3. Invitación
4. Confirmación de asistencia
5. Croquis/mesas opcional
6. Revisión
7. Activar

### QR pase físico

1. Datos del Evento
2. Croquis/mesas opcional
3. Generar pases QR
4. Revisión
5. Activar

## Carga de Contactos

Debe permitir:

- alta manual;
- CSV;
- descarga de formato CSV;
- edición inline;
- validación máximo 150;
- preview antes de importar;
- errores por fila antes de confirmar;
- bloqueo completo si el archivo excede 150.

No mostrar teléfono en vistas Staff.

## Editor Flyer/Flipbook

- canvas visual;
- panel lateral de propiedades;
- dibujar hotspots sobre imagen;
- elegir acción del hotspot;
- preview mobile/tablet/desktop;
- indicador de diseño completo/incompleto;
- orden de páginas para Flipbook.

### Congelamiento

- editable solo en `draft`, `configured` o `ready_to_activate`;
- al activar, Flyer/Flipbook quedan congelados;
- en `active`, `event_day`, `closed`, `album_published`, `archived` o `cancelled` no mostrar acciones de reemplazo/edición;
- el frontend debe explicar que la invitación quedó fijada al activar.

## Croquis

Debe tener:

- canvas central;
- herramientas de forma;
- panel lateral mesa/zona;
- lista de mesas;
- validación visual de capacidad;
- botón bloquear/desbloquear;
- botón pantalla completa.

## Asignación de mesas

Vistas:

- lista de Asistentes + croquis;
- Grupos + croquis.

Reglas visuales:

- capacidad usada/disponible;
- error antes de exceder capacidad;
- confirmado pendiente de mesa visible;
- cambio posterior a check-in marcado como acción auditada;
- zona decorativa no acepta Asistentes.

## StaffTokens

Mostrar:

- tokens activos y expirados;
- copiar link solo para activos;
- estado;
- alias Staff;
- fecha de creación;
- expiración al cierre/cancelación;
- máximo tres activos.

Reglas:

- tokens expirados no cuentan como activos;
- reabrir Evento no reactiva tokens expirados;
- no mostrar acción de revocación manual en MVP;
- crear tokens solo en `active` o `event_day`.

## Navegación por estado del Evento

### `active` / `event_day`

Pestañas visibles:

- Resumen
- Croquis/Mesas en modo lectura + botón editar autorizado
- Staff

No mostrar pestañas operativas:

- Contactos/Invitados
- Invitación
- Confirmación de asistencia
- Scanner embebido
- Álbum
- Reportes como pestaña separada
- Auditoría

El Resumen incluye acceso a reportes bajo demanda y controles de cierre/cancelación según permiso.

### `closed`

Mostrar:

- Resumen;
- Croquis/Mesas en lectura;
- Staff expirado en lectura;
- acción reabrir;
- gestión de Álbum si el servicio lo permite;
- acceso a reportes desde Resumen;
- acción archivar.

No permitir check-in ni reactivar tokens automáticamente.

### `album_published`

Mostrar:

- Resumen;
- Álbum: preview, estado, fecha de publicación/expiración y acción despublicar;
- reportes desde Resumen;
- acción archivar anticipadamente.

### `archived`

Vista solo lectura:

- Resumen;
- metadata de cierre/archivo;
- reportes agregados/autorizados;
- sin links públicos ni reapertura.

### `cancelled`

Vista Cliente:

- resumen conservado;
- mensaje de cancelación configurado;
- finanzas/cargo histórico;
- reportes o auditoría según permiso;
- sin Confirmación, QR, scanner ni Álbum público.

## Scanner

Microapp en pantalla única:

- escanear;
- resultado;
- registrar entrada.

Ruta:

- `/scanner/:staffToken`

Al abrir:

1. valida token;
2. valida Evento `active` o `event_day`;
3. abre cámara o búsqueda exacta;
4. conecta rooms Socket.IO permitidos.

Resultado muestra:

- nombre de Invitación/Contacto;
- Asistentes pendientes seleccionables;
- mesa;
- plano si existe;
- botón registrar entrada;
- error claro.

No muestra:

- teléfono;
- deuda;
- reportes;
- Asistentes ya ingresados como pendientes;
- datos de otro Evento;
- botón revertir.

Estados de error mínimos:

- token inválido/expirado;
- Evento cerrado;
- Evento cancelado;
- Evento no operativo;
- QR de otro Evento;
- QR inválido;
- Invitación sin pendientes;
- PaseFisicoQR ya usado;
- sin conexión: informar que internet es obligatorio.

## Invitación pública

Ruta:

- `/invitacion/:invitationToken`

Equilibrio:

- visual primero;
- acción clara;
- animación/experiencia visual;
- carga rápida y responsive.

### Comportamiento por estado

- `active` / `event_day`: muestra diseño y acciones permitidas.
- `closed`: muestra Evento finalizado; Confirmación y QR operativo quedan bloqueados.
- `album_published`: puede mostrar CTA al Álbum solo si existe token de Álbum elegible.
- `cancelled`: muestra únicamente `Invitación cancelada por el organizador` o mensaje público del Evento.
- `archived`: muestra acceso no disponible, sin diseño ni datos personales.
- Invitación cancelada específica: misma vista de cancelación, sin Confirmación ni QR.

El token de Invitación no sirve como token de Álbum.

## QR público

Debe tener:

- recuadro visual grande;
- leyenda: `El día del evento, muestra este QR en la entrada del salón.`;
- botón abrir QR en pantalla completa.

Solo visible cuando:

- Invitación confirmada;
- Evento `active` o `event_day`;
- Invitación y Evento no cancelados;
- acceso no archivado.

## Álbum público

Ruta:

- `/album/:albumToken`

Plantilla visual con:

- título;
- mensaje;
- grid/carrusel;
- botón externo.

Reglas de UX:

- token distinto al de Invitación;
- acceso solo para Invitación con al menos un Asistente ingresado;
- no mostrar nombres/teléfonos de otros asistentes;
- token inválido o expirado: mensaje claro sin revelar existencia de otros recursos;
- Invitación sin asistencia: `Álbum disponible solo para asistentes`;
- Evento archivado/despublicado: acceso no disponible;
- mostrar fecha de disponibilidad cuando sea útil;
- responsive y optimización de imágenes.

## Reportes PDF

Acceso Cliente:

- desde Resumen del Evento;
- no como módulo global separado.

Flujo visual:

1. elegir tipo de reporte permitido;
2. mostrar periodo/alcance;
3. solicitar snapshot al API;
4. generar PDF desde plantilla HTML;
5. subir mediante API;
6. mostrar estado: generando, listo o fallido;
7. descargar si sigue autorizado.

Privacidad:

- no incluir teléfonos;
- reportes detallados con nombres solo durante 30 días post-Evento;
- después mostrar versión agregada/anónima;
- historial de seis meses no conserva nombres en PDF descargable.

## Alertas visuales MVP

- saldo insuficiente;
- deuda activa;
- Evento listo para activar;
- Confirmación cerrada;
- Evento próximo;
- borrador vencido;
- StaffToken expirado;
- Asistentes confirmados sin mesa;
- Álbum próximo a expirar;
- reporte detallado próximo a anonimizarse.

Mostrar únicamente alertas que el rol puede entender y atender.

## Glosario UI de estados

Estados visibles:

- En preparación
- Listo para activar
- Activo
- Día del evento
- Cerrado
- Álbum publicado
- Archivado
- Cancelado

No mostrar términos técnicos como `draft`, `active`, `archived`.

`configured` permanece dentro de “En preparación” y no necesita etiqueta visible separada.