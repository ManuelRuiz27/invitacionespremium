# 07 — UI/UX Flow

## Autoridad visual

La experiencia de `apps/client` y `apps/scanner` se rige visualmente por:

`docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`

Ese documento prevalece para composición, jerarquía, densidad, cards, wrappers, copy y progressive disclosure.

Este archivo conserva la secuencia funcional de las superficies. No redefine dominio, permisos, estados, API, readiness, pricing ni Croquis.

## Estilo general

Premium, elegante, sobrio y operacional.

Principios:

- task-first: priorizar la siguiente acción útil;
- content-first: el Evento y la tarea dominan sobre la navegación;
- claridad antes que densidad;
- pocos datos prioritarios por vista;
- lenguaje natural para planners;
- progressive disclosure para opciones secundarias;
- una acción primaria dominante por contexto;
- cards, Paper, Chip y Alert sólo cuando cumplen una función real;
- responsive por recomposición, no por compresión de desktop;
- confirmación explícita en acciones irreversibles o sensibles;
- foco visible, labels, contraste, teclado y targets táctiles adecuados.

## Regla de superficies

La UI no adopta por defecto:

- dashboards de scorecards;
- grids de cards;
- cards anidadas;
- wrappers `Paper` alrededor de cada sección;
- descripciones que repiten el título;
- columnas administrativas de baja prioridad;
- chips decorativos;
- paneles de propiedades permanentes sin selección.

La separación visual se resuelve primero con espacio, tipografía, jerarquía y divisores.

## Landing

La landing conserva su contrato comercial y visual especializado. Este refactor no la convierte en una extensión del shell Cliente.

Registro público únicamente para Planner independiente.

## Shell Cliente

Desktop/tablet usan navegación persistente compacta; mobile puede usar AppBar/Drawer temporal.

La navegación debe sentirse secundaria frente al contenido.

Reglas:

- marca discreta;
- selección de sección mediante tratamiento sutil;
- perfil/sesión no compite con la tarea;
- no crear navegación global duplicada;
- conservar rutas y permisos existentes;
- ocultar Finanzas a Planner de Organización sin iniciar requests financieros.

## Dashboard Cliente / Eventos

El primer vistazo responde:

- qué Eventos vienen próximamente;
- cuál requiere atención;
- qué acción corresponde a cada Evento.

No existe obligación de mostrar scorecards de Total/En preparación/Activos/Finalizados.

### Datos prioritarios por Evento

- nombre;
- fecha;
- tipo cuando ayude;
- estado natural;
- acción principal permitida;
- alerta concreta cuando exista una condición resoluble.

Capacidad, última actualización y otros metadatos no son columnas principales por defecto.

Búsqueda y filtros permanecen, pero pueden compactarse. Desktop puede usar filas/tablas ligeras; mobile usa lista adaptada. No existe requisito de alternar cards/tabla.

### Visibilidad por rol

- Planner independiente: Eventos propios y navegación financiera autorizada.
- Admin de Organización: Eventos de la Organización y navegación financiera autorizada.
- Planner de Organización: sólo Eventos creados por él y sin Finanzas.

Ocultar navegación no sustituye autorización backend.

## Wizard de Evento

El comportamiento funcional se rige por `../04-tecnico/EVENT_WIZARD_CONTRACT.md`.

Visualmente:

- progreso ligero y legible;
- no requiere `Paper` alrededor del progreso;
- no requiere `Paper` alrededor de cada paso;
- autosave es automático y discreto;
- `Guardando…` aparece mientras ocurre;
- `Guardado` puede permanecer como feedback secundario;
- `Sin cambios pendientes` no requiere presencia persistente;
- error de guardado sí es visible y accionable;
- navegación inferior conserva `Salir`, `Anterior` y `Continuar` según contrato;
- un footer sticky es válido cuando mejora continuidad sin ocultar contenido.

### Flipbook/Flyer

1. Datos del Evento
2. Invitados
3. Invitación
4. Confirmación
5. Mesas/Croquis cuando aplique
6. Revisión
7. Activación

### QR pase físico

1. Datos del Evento
2. Mesas/Croquis cuando aplique
3. Pases
4. Revisión
5. Activación

La secuencia técnica exacta permanece en el contrato del Wizard.

## Invitados / Contactos

Modelo mental visible: personas invitadas, no CRUD de registros.

Debe permitir:

- alta manual;
- edición;
- eliminación confirmada;
- búsqueda;
- Grupo cuando aplique;
- importación CSV;
- descarga de plantilla;
- preview antes de commit;
- errores por fila;
- límite contractual completo.

La importación se presenta mediante progressive disclosure:

```text
Importar invitados
1. Descargar plantilla
2. Seleccionar archivo
3. Revisar datos
4. Importar
```

Desktop puede usar una lista tabular limpia. Mobile usa filas/lista. No mostrar teléfono en vistas Staff.

## Confirmación de asistencia

La vista prioriza:

- confirmados;
- pendientes;
- no asistirán;
- acciones necesarias.

Los conteos pueden mostrarse inline y no requieren cards independientes.

`RSVP` permanece como término interno. La UI usa **Confirmación de asistencia** o **Confirmaciones** según contexto.

Abrir/cerrar Confirmación y ajustes nominales conservan reglas, permisos y contratos existentes.

## Editor Flyer/Flipbook

La pieza gráfica es la superficie principal.

Debe permitir:

- preview visual dominante;
- páginas compactas para Flipbook;
- alta/reemplazo/eliminación/reordenamiento según contrato;
- acciones sobre la imagen;
- selección, drag y resize directos;
- inspector contextual sólo durante creación/selección;
- acciones en lenguaje natural;
- indicador natural de qué falta para completar el diseño.

No mostrar como experiencia principal:

- `Hotspot`;
- coordenadas;
- dimensiones normalizadas;
- `priority`;
- IDs de página;
- enums técnicos.

Las reglas exactas de acciones, cardinalidad, pageId estable, move, reorder, delete y readiness se rigen por `EVENT_WIZARD_CONTRACT.md` e `INVITATION_DESIGN_CONTRACT.md`.

Flyer/Flipbook quedan congelados al activar salvo la excepción formal del workflow Flyer → Flipbook definido en `SERVICE_UPGRADE_FLOW.md`.

## Croquis

**Fuera del alcance de este refactor visual global.**

No usar este archivo para rediseñar Builder, Seating Workspace, Floorplan renderer, stickers o asignación por lugar exacto.

Fuentes especializadas:

- `../03-diseno/FLOORPLAN_UX_TARGET.md`;
- `../04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
- `../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md`;
- `../05-implementacion/FP06_DETAILED_SEATING.md`.

Si existe contradicción visual sobre Croquis, prevalecen esos documentos.

## StaffTokens

Mostrar sólo información y acciones autorizadas por el contrato Staff.

La composición debe priorizar:

- alias;
- estado natural;
- expiración cuando sea relevante;
- copiar link cuando esté permitido;
- crear acceso cuando esté permitido.

No usar una card separada por token si una lista limpia resuelve mejor el trabajo.

## Workspace operativo del Evento

Ruta canónica:

`/eventos/:eventId`

Debe sentirse como **centro de trabajo del Evento**.

### Header

Priorizar:

- nombre del Evento;
- fecha/lugar cuando estén disponibles;
- estado natural cuando aporta contexto;
- acción principal permitida.

No repetir el mismo estado en header, chip, card y Alert.

### Navegación local

Las áreas funcionales se mantienen conforme a `ACTIVE_EVENT_WORKSPACE_CONTRACT.md` y permisos vigentes.

La navegación local es discreta y nunca funciona como grid de launcher cards.

### Resumen

Mostrar hechos principales con jerarquía tipográfica y filas compactas.

Puede existir una sección **Por hacer** sólo cuando la condición es:

- autoritativa;
- accionable;
- comprensible para el rol;
- obtenible sin crear requests o backend únicamente decorativos.

No inventar engagement, progreso porcentual o métricas para llenar espacio.

### `active` / `event_day`

Conserva acciones operativas autorizadas.

Las capacidades de Confirmación, Álbum, Reportes, Staff, compartir Invitaciones y Mesas se presentan donde sus contratos las permiten, sin obligarlas a existir como cards permanentes.

### `closed`

Consulta operativa y acciones de lifecycle/Álbum/reportes autorizadas. No permitir check-in ni reactivar Staff automáticamente.

### `album_published`

Priorizar estado/publicación/expiración y acciones autorizadas del Álbum.

### `archived`

Vista de consulta, sin links públicos ni reapertura.

### `cancelled`

Vista de consulta y contexto de cancelación. Sin Confirmación, QR operativo, scanner ni Álbum público.

## Compartir Invitaciones

Nombre visible preferente: **Compartir invitaciones**.

`FLYER` y `FLIPBOOK` pueden mostrar:

- nombre del Contacto;
- Grupo cuando ayude;
- estado natural de respuesta;
- **WhatsApp** como acción primaria cuando esté permitido;
- **Copiar enlace**;
- **Abrir invitación** cuando corresponda.

Reglas:

- abrir WhatsApp no significa que la Invitación fue enviada;
- no mostrar ni persistir `sent`, `delivered` o `read`;
- no usar “delivery” o jerga de mensajería como copy principal;
- búsqueda y filtros son secundarios respecto de la lista;
- Invitación cancelada no ofrece acciones de compartir;
- estados terminales conservan consulta conforme al contrato pero retiran nuevos envíos.

## Finanzas

Finanzas conserva precisión y estructura.

Priorizar:

- créditos disponibles;
- deuda si existe;
- línea disponible/utilizada cuando aplique;
- movimientos;
- comprobantes.

No es obligatorio usar una card por cada cifra. Las listas/tablas financieras son válidas cuando mejoran trazabilidad.

Alertas financieras se reservan para deuda, línea suspendida/expirada o condición que requiere atención.

No se inventan umbrales de saldo bajo.

## Scanner

Microapp de una sola tarea.

Ruta:

`/scanner/:staffToken`

Jerarquía visual:

1. Evento/contexto mínimo;
2. escanear;
3. resultado;
4. selección permitida de Asistentes pendientes;
5. Mesa/lugar conforme al contrato especializado;
6. **Registrar entrada**;
7. éxito + **Escanear siguiente**.

Búsqueda exacta funciona como alternativa operativa.

No mostrar:

- teléfono;
- deuda;
- reportes;
- información de otro Evento;
- botón revertir;
- navegación global innecesaria.

Los estados de error siguen siendo semánticamente distintos: token inválido/expirado, Evento cerrado/cancelado/no operativo, QR inválido/de otro Evento, sin pendientes, pase usado y sin conexión.

Este refactor no redefine el contenido ni UX de Croquis dentro de Scanner.

## Invitación pública

Ruta:

`/invitacion/:invitationToken`

Equilibrio:

- visual primero;
- acción clara;
- carga rápida y responsive;
- diseño de Invitación dominante;
- Hotspots accesibles sin tecnicismos;
- reintentos locales sin perder contexto;
- latest-wins al cambiar token;
- loading neutro sin conservar metadata del recurso anterior;
- `prefers-reduced-motion` sin quitar teclado o swipe.

### Comportamiento por estado

- `active` / `event_day`: diseño y acciones permitidas;
- `closed`: Evento finalizado, sin Confirmación ni QR operativo;
- `album_published`: CTA de Álbum sólo para token elegible;
- `cancelled`: vista de cancelación;
- `archived`: acceso no disponible;
- Invitación cancelada específica: cancelación sin Confirmación/QR.

El token de Invitación no funciona como token de Álbum.

## QR público

Debe priorizar el QR y la instrucción natural para mostrarlo en la entrada.

Sólo es visible cuando el contrato autoritativo lo permite.

Un fallo de carga/generación conserva contexto y ofrece `Reintentar` y `Cerrar` según la superficie vigente.

## Álbum público

Ruta:

`/album/:albumToken`

La experiencia es visual y mobile-first:

- título;
- mensaje;
- grid/carrusel;
- preview;
- botón externo cuando exista.

Conserva elegibilidad, expiración, aislamiento de token, optimización de imágenes y privacidad definidos en el contrato especializado.

## Reportes PDF

Acceso Cliente desde el contexto del Evento, no como dashboard global adicional.

El flujo de generación/descarga, privacidad y vigencia nominal se mantiene conforme al contrato de Reportes.

## Alertas visuales

Mostrar únicamente condiciones que el rol puede comprender y atender.

Ejemplos válidos:

- saldo insuficiente;
- deuda activa;
- Evento listo para activar;
- Confirmación cerrada cuando afecta una tarea;
- Evento próximo con una acción pendiente;
- borrador vencido;
- StaffToken expirado cuando se necesita Staff;
- pendientes de acomodo conforme al contrato especializado;
- Álbum próximo a expirar;
- reporte nominal próximo a anonimizarse.

No convertir cada estado normal en Alert.

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

No mostrar directamente `draft`, `configured`, `active`, `archived` ni otros enums.

`configured` permanece dentro de **En preparación**.

## Implementaciones históricas

Los bloques históricos CODEX-120/121/122/124/130/132 documentan comportamiento ya implementado, pero cualquier requisito antiguo de **cards, scorecards, wrappers o composición** queda subordinado a `CLIENT_UI_VISUAL_SYSTEM.md`.

No usar esta subordinación para cambiar reglas de dominio, permisos, contratos API, seguridad o Croquis.
