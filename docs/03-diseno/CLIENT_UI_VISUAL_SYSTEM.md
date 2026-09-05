# Sistema visual de Client — Task-first Planner UI

Estado: **FUENTE DE VERDAD VISUAL PARA `apps/client` Y `apps/scanner`**  
Ámbito: shell autenticado, dashboard de Eventos, wizard excepto Croquis, Invitación, Contactos, Confirmación, workspace operativo, distribución manual, Finanzas y Scanner.  
No cambia: dominio, roles, permisos, estados, API, OpenAPI, Prisma, readiness, pricing, Croquis ni contratos de seguridad.

## 1. Objetivo

La interfaz de InvitacionesPremium debe sentirse como una **herramienta de trabajo para planners**, no como un dashboard SaaS genérico.

La composición se organiza alrededor de:

```text
Evento
→ tarea actual
→ información necesaria
→ acción principal
→ contexto secundario bajo demanda
```

No se organiza alrededor de:

```text
Dashboard
→ KPIs
→ cards
→ formularios
→ estados técnicos
```

El resultado debe ser limpio, sobrio, premium, operativo y comprensible para planners y personal de organización sin conocimientos técnicos.

## 2. Precedencia visual

Para decisiones de presentación y composición de `apps/client` y `apps/scanner`, prevalece:

1. contratos de dominio/seguridad especializados aplicables;
2. este documento para **composición visual, jerarquía, densidad, copy y progressive disclosure**;
3. `docs/03-ui-ux/07_UI_UX_FLOW.md`;
4. contratos técnicos base (`CLIENT_APP_CONTRACT.md`, `EVENT_WIZARD_CONTRACT.md`, `ACTIVE_EVENT_WORKSPACE_CONTRACT.md`, Scanner, Finanzas, etc.);
5. implementación actual cuando no contradiga lo anterior.

Este documento sustituye únicamente requisitos de presentación antiguos que obliguen a usar **scorecards, cards, tabla/card dual, wrappers `Paper`, sidebars visualmente pesados, descripciones repetitivas o steppers encapsulados**.

No sustituye comportamiento, permisos, fetching, idempotencia, accesibilidad, reglas financieras, estados, readiness ni API.

## 3. Fuera de alcance explícito: Croquis

Croquis queda completamente fuera de este refactor visual global.

No modificar mediante tickets UI-01..UI-04:

- `apps/client/src/wizard/floorplan/**`;
- `apps/client/src/workspace/SeatingWorkspace.tsx` salvo integración estrictamente necesaria desde un shell padre y sin alterar su UX interna;
- `packages/floorplan/**`;
- `FLOORPLAN_UX_TARGET.md`;
- `FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
- `FLOORPLAN_DETAILED_SEATING_CONTRACT.md`;
- `FP06_DETAILED_SEATING.md`.

Croquis conserva su propio roadmap, contratos y decisiones visuales. Si una mejora general exige tocar internals de Croquis, se detiene esa parte y se eleva como trabajo separado.

## 4. Referencias de producto

Referencias externas pueden utilizarse sólo como benchmark de flujo, nunca como fuente de verdad ni para copiar diseño propietario.

### VOWS México

Patrones útiles:

- lenguaje natural para planners;
- WhatsApp como canal primario de distribución;
- RSVP presentado como tarea de invitados, no como configuración técnica;
- claridad de múltiples Eventos;
- reducción de fricción en listas y acomodo.

InvitacionesPremium conserva sus diferencias de producto: Flipbook/Flyer, acciones sobre la pieza gráfica, operación provider-led, QR/check-in y contratos propios.

### Regla

No reproducir branding, layout, assets, copy ni apariencia de terceros. Reinterpretar únicamente patrones de interacción compatibles con los contratos internos.

## 5. Principios obligatorios

1. **Task-first:** cada vista prioriza la siguiente acción útil del Planner.
2. **Content-first:** el contenido del Evento domina sobre chrome, navegación y contenedores.
3. **Progressive Disclosure:** detalles secundarios aparecen cuando se selecciona, edita o resuelve algo.
4. **Una acción primaria:** una pantalla no presenta varias acciones con el mismo peso visual salvo necesidad operacional real.
5. **Menos superficies artificiales:** no envolver cada bloque en Card/Paper.
6. **Copy funcional:** no repetir título, descripción y helper con la misma idea.
7. **Estados por excepción:** Alert/Chip se reservan para estado, riesgo o condición que el usuario necesita distinguir; no decoran contenido normal.
8. **Datos accionables antes que KPIs:** mostrar conteos cuando ayudan a decidir o actuar.
9. **No tecnicismos:** nunca exponer enums, DTOs, IDs, coordenadas, idempotencia, E.164, IANA o nombres de infraestructura como lenguaje primario.
10. **Responsive por recomposición:** mobile/tablet no son desktop comprimido.
11. **Accesibilidad preservada:** targets >=44 px cuando aplique, foco visible, teclado, labels, reduced motion y estados no dependientes sólo del color.

## 6. Patrones que dejan de ser default

No usar por defecto:

- `MetricCard` para cada cifra disponible;
- grids de cards como primera pantalla;
- `Paper` alrededor del header, progreso y contenido simultáneamente;
- Cards anidadas;
- subtítulos del tipo "Consulta el estado y los datos principales..." cuando no aportan una decisión;
- chips repetidos para estados normales ya comunicados por contexto;
- tablas con columnas de baja prioridad sólo porque el backend las entrega;
- paneles permanentes de propiedades cuando no existe selección;
- ayudas técnicas persistentes;
- botones secundarios competidores con el CTA principal.

Card, Paper, Chip, Alert y tabla siguen permitidos cuando existe una razón funcional concreta.

## 7. Gramática de composición

### Vista base

```text
Título                                      Acción principal
Contexto breve sólo si aporta decisión

──────────────────────────────────────────────────────────

Contenido principal

──────────────────────────────────────────────────────────
Acciones/contexto secundario cuando aplique
```

### Vista con selección

```text
Contenido principal                   Contexto de selección
                                      sólo mientras aplica
```

### Densidad

- separar por espacio, tipografía y divisores antes que por cajas;
- bordes sólo cuando delimitan interacción o grupos que realmente necesitan contención;
- sombras reservadas para overlays, drawers, menus, dialogs y elevación real;
- fondos neutros y pocos acentos;
- evitar superficies visuales que compitan con imágenes, Invitaciones o contenido operativo.

## 8. Shell autenticado

El shell debe ser silencioso.

### Desktop/tablet

- navegación lateral compacta y estable;
- marca discreta;
- selección mediante tipografía, indicador o fondo sutil, no botón/card grande;
- contenido ocupa la mayor superficie útil;
- perfil/sesión no compite con la tarea;
- no crear una segunda navegación global dentro de cada módulo.

### Mobile

- Drawer/AppBar actuales pueden mantenerse si cumplen accesibilidad;
- mostrar sólo acciones globales necesarias;
- no trasladar sidebar completo como bloque visual permanente.

### Rutas

No cambian por este refactor.

## 9. Dashboard / Eventos

La primera pregunta es **qué Evento requiere atención**, no cuántos Eventos existen en cada estado.

### Eliminar del primer nivel

- grid obligatorio de `MetricCard` con Total/En preparación/Activos/Finalizados;
- repetición `Eventos` + `Tus Eventos` sin función distinta;
- capacidad y última actualización como columnas principales;
- alternancia card/table como requisito de producto.

### Composición objetivo

```text
Eventos                                      + Nuevo evento

Próximos
──────────────────────────────────────────────────────────
Ana & Carlos        12 sep     En preparación   Continuar →
Valentina XV        18 sep     Listo             Revisar →
Andrea & Luis       26 sep     Activo            Gestionar →
```

Puede existir una sección **Requieren atención** únicamente con información autoritativa ya disponible y accionable. No crear un nuevo backend o request fan-out sólo para decorar el dashboard.

### Datos prioritarios por Evento

- nombre;
- fecha;
- tipo cuando ayude;
- estado natural;
- acción principal permitida;
- alerta concreta cuando existe una condición resoluble.

Búsqueda y filtros permanecen, pero pueden compactarse. Desktop puede usar filas/tablas ligeras si mejoran escaneo; mobile usa lista adaptada. No existe obligación de paridad visual card/table.

## 10. Wizard de Evento

El comportamiento, rutas y autosave siguen bajo `EVENT_WIZARD_CONTRACT.md`. Este documento sólo redefine su shell visual fuera de Croquis.

### Objetivo

El wizard debe parecer un flujo de preparación del Evento, no un formulario dentro de múltiples paneles.

### Composición

```text
← Eventos                                      Guardado

Ana & Carlos
Datos   Invitados   Invitación   Confirmación   Mesas   Revisión
───────────────────────────────────────────────────────────────

Contenido del paso

───────────────────────────────────────────────────────────────
Salir                                      Anterior   Continuar
```

### Reglas

- progreso ligero, sin `Paper` obligatorio;
- contenido del paso no requiere `Paper` envolvente por default;
- navegación inferior puede ser sticky cuando mejora continuidad sin tapar contenido;
- `Guardando…` aparece mientras ocurre;
- `Guardado` puede mostrarse discretamente después de éxito;
- `Sin cambios pendientes` no necesita presencia permanente;
- error de guardado sí debe ser visible y accionable;
- no eliminar confirmaciones necesarias para acciones destructivas o sensibles;
- no cambiar secuencia ni guards por razones visuales.

## 11. Contactos / Invitados

Modelo mental visible: **lista de personas invitadas**, no CRUD de registros.

### Default

```text
Invitados                                   + Agregar

Buscar                                      Importar lista
──────────────────────────────────────────────────────────
María Fernanda López
Familia López · WhatsApp                                  ⋯

Carlos Hernández
WhatsApp                                                  ⋯
```

### Reglas

- alta/edición/eliminación conservan contratos vigentes;
- desktop puede utilizar una lista tabular limpia para densidad, sin estética de DataGrid administrativo;
- WhatsApp, Grupo y estado se muestran sólo cuando aportan a la tarea;
- acciones secundarias se agrupan en menú/contexto cuando sea apropiado;
- importación CSV se presenta como un flujo progresivo, no como varios controles permanentes.

### Importar lista

Modelo recomendado:

```text
Importar invitados
1. Descargar plantilla
2. Seleccionar archivo
3. Revisar datos
4. Importar
```

Preview, errores por fila, límite contractual e idempotencia no cambian.

## 12. Confirmación de asistencia

La vista responde:

1. quién confirmó;
2. quién falta;
3. quién no asistirá;
4. qué requiere acción.

### Composición

Los conteos pueden mostrarse inline:

```text
48 confirmaron   12 pendientes   6 no asistirán
```

No requieren tres cards.

### Estructura

- Pendientes primero cuando existen;
- Confirmados;
- No asistirán;
- apertura/cierre de Confirmación como control contextual;
- gestión nominal conserva permisos y reglas existentes.

No convertir el término interno `RSVP` en lenguaje visible.

## 13. Editor de Invitación

La pieza gráfica es el contenido principal.

### Flipbook

- páginas como tira lateral/inferior compacta;
- página seleccionada domina el workspace;
- alta, reorder, replace y delete conservan contrato;
- las acciones se colocan y seleccionan directamente sobre la imagen;
- inspector sólo aparece durante selección/creación;
- acciones internas se nombran en lenguaje natural.

Modelo conceptual:

```text
[P1]
[P2]                ┌──────────────────────────────┐
[P3]                │                              │
                    │         INVITACIÓN           │
+ Agregar página    │                              │
                    └──────────────────────────────┘
```

### Acción seleccionada

Mostrar únicamente lo necesario, por ejemplo:

- nombre natural de la acción;
- mover/redimensionar mediante interacción directa;
- mover a otra página cuando aplique;
- enlace si es `Enlace adicional`;
- eliminar.

No mostrar coordenadas, priority, pageId ni enums.

### Flyer

Mismo principio: imagen dominante y acciones directamente ligadas a la pieza gráfica. No imitar un formulario de propiedades.

### Readiness

El backend sigue siendo autoridad. La UI traduce blockers a instrucciones naturales y no inventa una barra de progreso porcentual.

## 14. Workspace de Evento activo

La pantalla debe sentirse como **centro de trabajo del Evento**, no como dashboard de módulos.

### Header

Priorizar:

- nombre;
- fecha/lugar cuando esté disponible;
- estado natural sólo cuando aporta contexto;
- acción principal válida para el estado.

### Resumen

- hechos principales en líneas/filas compactas;
- evitar cards decorativas;
- un bloque **Por hacer** sólo con condiciones accionables disponibles de manera segura;
- no crear nuevas métricas, porcentajes ni requests únicamente para llenar el resumen.

### Navegación local

Las áreas funcionales existentes permanecen conforme a `ACTIVE_EVENT_WORKSPACE_CONTRACT.md`, pero la navegación local debe ser discreta. No convertir cada área en una card de launcher.

### Estados terminales

La vista conserva claridad y lectura histórica sin banners redundantes. Alertas sólo cuando explican una restricción o una acción disponible.

## 15. Distribución manual de Invitaciones

Modelo mental visible: **Compartir invitaciones**.

WhatsApp es la acción primaria cuando el contrato permite abrirlo.

Ejemplo:

```text
Compartir invitaciones

Buscar persona

María López
Familia López
[ WhatsApp ]   Copiar enlace
```

### Reglas

- no presentar `sent`, `delivered` o `read`;
- no afirmar que abrir WhatsApp equivale a envío;
- `Copiar enlace` y `Abrir invitación` permanecen según contrato;
- búsqueda/filtro pueden compactarse;
- estado de respuesta se expresa en lenguaje natural;
- no usar “distribución”, “delivery” o jerga técnica como título primario si `Compartir invitaciones` comunica mejor la tarea.

## 16. Finanzas

Finanzas conserva mayor estructura porque precisión y trazabilidad son prioritarias.

### Composición

Evitar una card por cifra cuando una jerarquía tipográfica es suficiente:

```text
Créditos disponibles                     84

Línea de crédito
Usados                                  20 / 100

Movimientos
────────────────────────────────────────────
Activación · Ana & Carlos              -30
Compra de créditos                     +50
```

### Reglas

- no ocultar deuda, línea suspendida/expirada ni información necesaria para comprender saldo;
- tablas/listas de movimientos y comprobantes son válidas;
- no cambiar cálculos ni contratos financieros;
- advertencias financieras sí pueden usar Alert cuando requieren atención.

## 17. Scanner

Scanner es una microapp de una sola tarea.

### Estado inicial

```text
Ana & Carlos

Escanear acceso

[cámara]

Buscar por nombre
```

### Resultado

Priorizar:

- identidad mínima permitida;
- asistentes pendientes;
- Mesa/lugar conforme al contrato especializado vigente;
- acción **Registrar entrada**.

### Éxito

Mostrar confirmación clara y CTA **Escanear siguiente**.

### Reglas

- sin navegación global innecesaria;
- sin cards decorativas;
- sin teléfono, deuda, reportes o información no autorizada;
- errores operativos diferenciados;
- cámara y CTA dominan la jerarquía visual.

Este documento no redefine el contenido de Croquis mostrado por Scanner.

## 18. Empty, loading y error states

- Loading: neutro y cercano al área afectada; no usar skeleton por obligación.
- Empty: explicar qué puede hacer el usuario a continuación cuando exista acción.
- Error recuperable: mensaje + `Reintentar`.
- Error técnico: no exponer código como mensaje principal.
- Alert persistente: sólo para condición que requiere atención o explica una restricción vigente.

No usar un EmptyState grande para una ausencia menor dentro de una lista si una línea de texto resuelve mejor.

## 19. Componentes y design system

Se conserva MUI y `@invitaciones/ui`.

No migrar a Tailwind, shadcn, Radix u otro stack por este refactor.

Los componentes compartidos pueden refactorizarse cuando:

- eliminan repetición real;
- preservan accesibilidad;
- no codifican reglas de dominio;
- permiten la nueva jerarquía sin forzar cards.

`MetricCard`, `PageHeader`, `ResponsiveAppShell`, `StatusChip`, `EmptyState`, etc. no se eliminan globalmente sólo por existir. Se dejan de usar donde contradicen la tarea.

## 20. Responsive

### Desktop

- máximo espacio útil para contenido;
- navegación silenciosa;
- listas densas cuando ayudan al escaneo;
- panel contextual sólo con selección.

### Tablet

- mismas tareas que desktop;
- drawers para contexto secundario cuando el ancho lo requiera;
- evitar columnas estrechas simultáneas.

### Mobile

- jerarquía lineal;
- acciones primarias sticky cuando sea útil;
- filtros/acciones secundarias bajo disclosure;
- listas antes que tablas horizontales;
- no comprimir sidebars o paneles desktop.

## 21. QA visual transversal

Cada ticket UI debe documentar al menos:

- ruta;
- rol;
- viewport;
- fixture/estado del Evento;
- acción principal visible;
- estado vacío;
- loading;
- error recuperable;
- teclado/foco;
- mobile/tablet cuando aplique.

No aceptar como terminado un refactor que sólo cambie CSS sin corregir jerarquía, copy y progressive disclosure.

## 22. No-go

Este contrato no autoriza:

- cambiar roles/permisos;
- cambiar rutas de API;
- añadir endpoints sólo para métricas decorativas;
- modificar estados o readiness;
- alterar Croquis;
- modificar pricing;
- inventar integración WhatsApp API;
- afirmar delivery/read de WhatsApp;
- crear nuevas entidades;
- cambiar librería UI completa;
- introducir drag/drop de personas fuera de contratos aprobados;
- ocultar controles necesarios por estética;
- degradar accesibilidad.

## 23. Definition of Done visual

La superficie está alineada cuando:

1. la tarea principal se identifica en menos de un vistazo;
2. existe como máximo una acción primaria dominante;
3. no hay cards o wrappers sin función clara;
4. copy redundante fue eliminado;
5. información secundaria aparece bajo contexto o disclosure;
6. estados técnicos no son visibles;
7. mobile/tablet recompone la interfaz;
8. permisos, contratos, fetching, errores e idempotencia siguen intactos;
9. Croquis no fue modificado por este roadmap;
10. tests y QA demuestran que la limpieza visual no perdió funcionalidad.
