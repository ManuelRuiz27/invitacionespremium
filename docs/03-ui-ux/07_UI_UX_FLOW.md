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
- operación del Evento, no solo diseño de Invitación.

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
5. Croquis/Mesas opcional
6. Revisión
7. Activar

### QR pase físico

1. Datos del Evento
2. Croquis/Mesas opcional
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
- dibujar Hotspots sobre imagen;
- elegir acción del Hotspot;
- preview mobile/tablet/desktop;
- indicador de diseño completo/incompleto;
- orden de páginas para Flipbook.

### Congelamiento

- editable solo en `draft`, `configured` o `ready_to_activate`;
- al activar, Flyer/Flipbook quedan congelados;
- en `active`, `event_day`, `closed`, `album_published`, `archived` o `cancelled` no mostrar acciones ordinarias de reemplazo/edición;
- el frontend debe explicar que la Invitación quedó fijada al activar;
- cualquier cambio de servicio posterior a activación queda sujeto a la decisión abierta documentada en `17_QA_OPEN_DECISIONS.md` y no debe implementarse todavía.

## Croquis

Debe tener:

- canvas central;
- herramientas de forma;
- panel lateral Mesa/Zona;
- lista de Mesas;
- validación visual de capacidad;
- botón bloquear/desbloquear;
- botón pantalla completa.

## Asignación de Mesas

Vistas:

- lista de Asistentes + Croquis;
- Grupos + Croquis.

Reglas visuales:

- capacidad usada/disponible;
- error antes de exceder capacidad;
- confirmado pendiente de Mesa visible;
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

No mostrar pestañas operativas separadas:

- Contactos/Invitados
- Invitación
- Confirmación de asistencia
- Scanner embebido
- Álbum
- Reportes
- Auditoría

La ausencia de pestañas separadas no elimina las acciones operativas confirmadas. El Resumen concentra cards y acciones contextuales.

#### Card Confirmación de asistencia

Mostrar:

- estado abierta/cerrada;
- confirmados, rechazados y pendientes;
- Asistentes nominales confirmados;
- capacidad disponible;
- alertas por límite/cupo;
- acción abrir/cerrar Confirmación según permiso;
- acción `Gestionar confirmaciones` para ajustes nominales que solo Planner/Admin puede realizar.

`Gestionar confirmaciones` abre drawer, modal o vista secundaria contextual; no crea una pestaña permanente ni reabre el editor de Invitación.

Permite:

- consultar Contacto/Invitación dentro del ownership;
- ajustar estado/número/nombres conforme a reglas;
- identificar confirmados pendientes de Mesa;
- auditar cambios.

No permite:

- reemplazar Flyer/Flipbook;
- modificar identidad del Contacto sin flujo autorizado;
- exceder límites/capacidad;
- exponer teléfonos a Staff.

#### Card Álbum

Solo para Flyer/Flipbook.

Durante `active` o `event_day` permite:

- acción `Preparar Álbum`;
- crear/configurar título, mensaje, colores y link externo;
- cargar/ordenar hasta 35 fotos;
- mantenerlo privado/no publicado.

No permite:

- publicar antes de `closed`;
- generar tokens públicos de Álbum;
- mostrar el Álbum a Invitaciones.

Esta card resuelve la creación previa al cierre sin agregar una pestaña Álbum durante el Evento activo.

#### Otras acciones del Resumen

- acceso a reportes bajo demanda;
- cerrar/cancelar Evento según permiso;
- estado financiero resumido solo para roles autorizados;
- alertas operativas;
- no mostrar auditoría global.

### `closed`

Mostrar:

- Resumen;
- Croquis/Mesas en lectura;
- Staff expirado en lectura;
- acción reabrir;
- gestión completa de Álbum si el servicio lo permite;
- acción publicar Álbum cuando esté válido;
- acceso a reportes desde Resumen;
- acción archivar.

No permitir check-in ni reactivar tokens automáticamente.

Si el Álbum ya fue preparado durante `active`/`event_day`, conservar configuración/fotos y habilitar publicación sin recarga.

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

- Resumen conservado;
- mensaje de cancelación configurado;
- finanzas/cargo histórico para roles autorizados;
- reportes o auditoría según permiso;
- sin Confirmación, QR, scanner ni Álbum público.

Un Álbum privado preparado se conserva como datos/archivos, pero no puede publicarse.

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
- Mesa;
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
- reintentos locales sin perder el contexto visual;
- respuestas tardías de otro token nunca sustituyen la vista vigente;
- al cambiar el token, el primer render es loading neutro y no conserva diseño, nombres, Hotspots, QR,
  notices, errores o diálogos del recurso anterior;
- `prefers-reduced-motion` elimina transiciones sin quitar teclado o swipe.

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

Un fallo de generación mantiene abierto el diálogo y ofrece `Reintentar` y `Cerrar`; el reintento
solicita exclusivamente el SVG vigente.

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
- no mostrar nombres/teléfonos de otros Asistentes;
- token inválido o expirado: mensaje claro sin revelar existencia de otros recursos;
- Invitación sin asistencia: `Álbum disponible solo para asistentes`;
- Evento archivado/despublicado: acceso no disponible;
- mostrar fecha de disponibilidad cuando sea útil;
- responsive y optimización de imágenes.
- carga progresiva con pool LRU de hasta ocho Object URLs;
- máximo de cuatro descargas simultáneas, priorizando preview seleccionada, fotos visibles y cercanas;
- `evicted` vuelve a placeholder neutro y puede recargarse al regresar al viewport; solo un fallo real
  muestra el error de contenido;
- reintento individual de foto y revocación total al abandonar la ruta.

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
- Asistentes confirmados sin Mesa;
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
# Implementación CODEX-121

El wizard operativo usa un stepper horizontal en escritorio y tabs desplazables en móvil. La URL
conserva el paso actual, el estado de guardado se anuncia sin depender del color y cada editor visual
ofrece una alternativa de campos. Las secuencias por servicio, creación diferida y estados de solo
lectura están normados en `../04-tecnico/EVENT_WIZARD_CONTRACT.md`.

`PHYSICAL_QR` muestra únicamente Datos, Croquis, Pases y Revisión. Flyer y Flipbook disponen de previews
privados, canvas de Hotspots y panel numérico; Croquis ofrece canvas más inspector de Mesa/Zona. Los cambios
de zona horaria, eliminación de Contactos y activación usan confirmaciones accesibles. Revisión recarga el
estado autoritativo y solo habilita Activar cuando la API devuelve `READY_TO_ACTIVATE`.

# Implementación CODEX-122

`/invitacion/:invitationToken` y `/album/:albumToken` son experiencias públicas visuales, mobile-first y
sin shell operativo. La Invitación usa el diseño publicado como plano dominante; los Hotspots conservan
coordenadas relativas, foco visible y acciones HTTPS seguras. Flipbook admite botones, flechas y swipe.

Confirmación presenta el principal inmutable y acompañantes nominales editables en diálogo con foco
contenido. QR aparece solo después de confirmar, se solicita bajo demanda y ofrece pantalla completa. El
Álbum usa tema validado, grid progresivo y preview con teclado/swipe. Cancelación, cierre, restricción y
no disponibilidad usan mensajes públicos no enumerantes. Detalle normativo en
`../04-tecnico/PUBLIC_CLIENT_CONTRACT.md`.

# Implementacion CODEX-130A

La app Admin usa una composicion desktop/tablet de alta densidad controlada: navegacion azul petroleo,
superficies claras y acento dorado reservado. En movil el drawer es temporal. El header comunica la
identidad Platform Admin, sesion verificada y logout; no muestra `clientId` ni enlaces de Cliente.

El flujo actual contiene Resumen, Clientes y Eventos. Clientes concentra cuenta, usuarios y finanzas;
las mutaciones sensibles usan dialogos accesibles sin `window.confirm`. Eventos es una proyeccion global
de solo lectura con restauracion explicita. Loading, vacio, error/retry, acceso denegado e
indisponibilidad de sesion son estados distintos. El contrato completo vive en
`../04-tecnico/ADMIN_APP_CONTRACT.md`.

# Implementacion CODEX-130B

La navegacion protegida agrega Catalogo y Reportes. Catalogo separa Servicios referenciados, historia
completa de precios y promociones de elegibilidad. Como no existe `GET /admin/services`, nunca presenta
la proyeccion derivada como coleccion completa. Los precios muestran intervalos `[inicio, fin)` y solo
admiten crear una fila o cerrar su vigencia; las promociones explican permanentemente que no calculan
descuentos ni bonos.

Los Servicios conocidos combinan referencias de precios y respuestas de creacion/actualizacion mientras
la pagina permanece montada. Cambiar entre pestanas conserva la coleccion y habilita el primer Precio o
Promocion de un Servicio nuevo; un reload pierde los que todavia no tienen Precio. Un estado no expuesto
por una referencia exige seleccion explicita. Los campos `datetime-local` muestran componentes locales,
incluidos segundos, y envian de vuelta el mismo instante UTC. Promociones proyecta nombres de Cliente y
Servicio cuando existen y deja UUID solo como referencia secundaria.

Reportes separa metadata global de cortes diarios y mensuales autoritativos. La vista por Evento tiene
un boundary ligado a `eventId`; no conserva contenido anterior al navegar. Platform Admin no genera,
carga ni descarga PDF y no recibe datasets o datos nominales.

Las mutaciones no idempotentes de Servicios, precios y promociones comparten una maquina de estados.
Durante `submitting` y tras un resultado `uncertain`, Confirmar permanece deshabilitado. Red, `429` y
`5xx` muestran `Actualizar informacion`; esa accion consulta la coleccion autoritativa y no repite el
POST/PATCH. Una coincidencia unica confirma el cambio, la ausencia verificable habilita un nuevo intento
explicito y una respuesta ambigua o no disponible conserva el bloqueo. La resolucion de Clientes en
promociones muestra por separado carga, nombre resuelto, referencia no resuelta y error con retry, sin
retirar las filas ya obtenidas del Catalogo.
