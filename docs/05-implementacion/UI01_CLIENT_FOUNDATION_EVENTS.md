# UI-01 — Visual foundation, Client shell y Eventos

Estado: **READY FOR CODE**  
Prioridad: **P0 del refactor visual Client**  
Prerequisito: documentación de `21_CLIENT_UI_REFACTOR_ROADMAP.md` mergeada.  
Fuente visual superior: `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`.

## 1. Objetivo

Corregir la primera impresión de `apps/client` para que deje de sentirse como un dashboard SaaS genérico.

Este ticket cubre:

- visual foundation mínima;
- `ClientShell` / navegación;
- `/eventos`;
- lista/filtros de Eventos;
- componentes shared estrictamente necesarios.

No cubre Wizard, Invitación, Croquis, workspace activo, Finanzas completa ni Scanner.

## 2. Lectura obligatoria

Codex debe leer, en orden:

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`
4. `docs/03-ui-ux/07_UI_UX_FLOW.md`
5. `docs/04-tecnico/CLIENT_APP_CONTRACT.md`
6. `docs/01-producto/03_ROLES_PERMISOS_ACCESO.md`
7. `docs/01-producto/ACCESS_MATRIX.md`
8. `docs/05-implementacion/14_CODEX_RULES.md`
9. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`
10. este ticket.

Si encuentra contradicción de composición/card/table/sidebar, prevalece `CLIENT_UI_VISUAL_SYSTEM.md`. Si la contradicción es de dominio, permisos, API o seguridad, no la resuelve visualmente.

## 3. Software archaeology obligatorio

Antes de editar, inspeccionar como mínimo:

- `packages/ui/src/theme.ts`
- `packages/ui/src/ResponsiveAppShell.tsx`
- `packages/ui/src/PageHeader.tsx`
- `packages/ui/src/MetricCard.tsx`
- `packages/ui/src/StatusChip.tsx`
- `packages/ui/src/States.tsx`
- `apps/client/src/layout/ClientShell.tsx`
- `apps/client/src/layout/ClientNavigation.tsx`
- `apps/client/src/layout/UserMenu.tsx`
- `apps/client/src/dashboard/DashboardPage.tsx`
- `apps/client/src/dashboard/EventSummaryCards.tsx`
- `apps/client/src/dashboard/EventsList.tsx`
- `apps/client/src/dashboard/EventCard.tsx`
- tests de dashboard/finance y shell relacionados.

Reportar qué se reutiliza, qué se adapta y qué queda intacto.

## 4. Invariantes

No cambiar:

- rutas;
- roles;
- permisos;
- queries API;
- shape de DTOs;
- estado del Evento;
- mappers de estado salvo bug independiente;
- acceso a Finanzas;
- comportamiento de sesión;
- Croquis;
- Admin app;
- Landing.

Planner de Organización debe seguir haciendo cero requests financieros.

## 5. Visual foundation

Ajustar tokens/componentes compartidos sólo si la mejora es realmente transversal.

Objetivos:

- superficies menos boxy;
- spacing consistente;
- tipografía con jerarquía clara;
- bordes/sombras más discretos;
- acción primaria fácilmente identificable;
- navegación compacta;
- contenido con mayor ancho útil.

No introducir una nueva librería UI.

No eliminar `MetricCard`, `PageHeader`, `StatusChip`, `EmptyState` o `ResponsiveAppShell` globalmente sólo porque este ticket deje de usarlos en `/eventos`.

## 6. Client shell

### Desktop/tablet

Refactorizar el shell para que navegación y marca sean secundarias.

Debe conservar:

- marca InvitacionesPremium;
- Eventos;
- Finanzas sólo para roles permitidos;
- UserMenu/logout;
- foco visible;
- `aria-current`;
- targets táctiles suficientes.

Cambios esperados:

- item activo menos parecido a card/botón grande;
- menor peso visual del sidebar;
- más superficie para `<Outlet />`;
- perfil/sesión compacto;
- sin fondos/bordes innecesarios.

### Mobile

Conservar patrón AppBar/Drawer si es funcional. Simplificar chrome sin perder acceso ni foco.

## 7. Dashboard `/eventos`

### Eliminar del primer nivel

`EventSummaryCards` no debe aparecer antes de la lista.

No mostrar por default:

- Total de eventos;
- En preparación;
- Activos;
- Finalizados;

como cuatro KPI cards.

El componente puede quedar sin uso si otras superficies lo requieren; eliminarlo sólo si el análisis demuestra que no tiene consumidores y tests lo permiten.

### Header

Objetivo:

```text
Eventos                                      + Nuevo evento
```

Eliminar descripción genérica que sólo repite la función de la pantalla.

### Lista operacional

Prioridad de cada Evento:

1. nombre;
2. fecha;
3. tipo cuando esté disponible;
4. estado natural;
5. acción principal.

`Capacidad` y `Última actualización` dejan de ser columnas principales obligatorias.

No mostrar IDs ni estados técnicos.

### Acción por estado

Conservar exactamente los destinos actuales:

- `DRAFT`/`CONFIGURED` → Continuar configuración;
- `READY_TO_ACTIVATE` → Activar evento/Revisión;
- estados operativos/terminales → Ver/Gestionar evento conforme al mapper existente.

Cambiar copy visible es válido si mantiene la misma intención y destino.

### Búsqueda y filtros

Conservar búsqueda por nombre y filtros útiles.

Se pueden presentar como controles compactos. No abrir nuevos requests: siguen siendo locales sobre `GET /events`.

### Desktop

Preferir lista/fila de alta legibilidad. Tabla ligera es válida si no parece reporte administrativo.

No hay requisito de mostrar cards en desktop.

### Mobile

Usar una fila/lista adaptada con fecha, estado y CTA. No forzar tabla horizontal.

No existe requisito de reutilizar `EventCard` si una nueva composición local es más clara.

## 8. Sección "Requieren atención"

Sólo implementar si puede derivarse con `GET /events` vigente y mappers ya existentes sin inventar semántica.

No agregar requests, backend, readiness paralelo ni heurísticas para llenar esa sección.

Si no hay un dato inequívoco, omitir la sección en UI-01.

## 9. Copy

Eliminar frases redundantes.

Ejemplo a retirar:

`Consulta el estado y los datos principales de tus Eventos autorizados.`

Los empty states sí deben explicar la siguiente acción:

- sin Eventos → crear Evento;
- búsqueda sin coincidencias → limpiar búsqueda/filtros.

No llamar al usuario “tenant”, “owner” ni usar enums.

## 10. Estados

Cubrir:

- loading;
- error recuperable;
- sin Eventos;
- filtros sin resultado;
- sesión expirada mediante infraestructura existente.

No introducir skeletons sólo por estética.

## 11. Responsive

QA mínimo:

- 1440×900;
- 1024×768;
- 768×1024;
- 390×844.

Verificar que la acción `Nuevo evento` y CTA por Evento no compitan ni produzcan scroll horizontal.

## 12. Accesibilidad

- un `h1` correcto;
- lista/tabla semántica;
- foco visible;
- filtros etiquetados;
- navegación por teclado;
- estado no dependiente sólo del color;
- targets >=44 px en controles táctiles principales.

## 13. Tests obligatorios

Actualizar/agregar tests para demostrar:

1. dashboard carga `GET /events` una sola vez según patrón actual;
2. ya no se renderiza el resumen KPI obligatorio;
3. CTA `Nuevo evento` conserva ruta;
4. `DRAFT`/`CONFIGURED` conserva destino Datos;
5. `READY_TO_ACTIVATE` conserva destino Revisión;
6. estados posteriores conservan destino workspace;
7. búsqueda funciona;
8. filtros funcionan;
9. estado técnico no aparece;
10. Planner Organización no recibe Finanzas en navegación;
11. roles financieros sí la reciben;
12. loading/error/empty siguen diferenciados;
13. mobile no requiere tabla horizontal.

No reescribir tests para aceptar pérdida de permisos o rutas.

## 14. QA visual

Reportar rutas y screenshots o evidencia reproducible para:

- Planner independiente con varios Eventos;
- Planner Organización;
- cero Eventos;
- búsqueda sin resultados;
- Evento en preparación;
- listo para activar;
- activo;
- mobile;
- tablet.

## 15. No-go

No tocar:

- `apps/client/src/wizard/floorplan/**`;
- `packages/floorplan/**`;
- internals de `SeatingWorkspace`;
- API/Prisma;
- Admin/Landing;
- wizard fuera de cambios mínimos necesarios para que compile un shared component.

## 16. Definition of Done

UI-01 termina cuando:

- `/eventos` ya no abre con scorecards;
- el shell es más silencioso;
- la lista permite identificar Evento/fecha/estado/acción con rapidez;
- búsqueda/filtros permanecen;
- roles/rutas/sesión no cambian;
- shared UI no rompe otras apps;
- Croquis no fue modificado;
- tests y QA pasan.
