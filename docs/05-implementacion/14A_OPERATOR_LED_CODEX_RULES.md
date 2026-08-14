# 14A — Codex Rules: operator-led + Croquis V2

Estado: **Addendum obligatorio** a `14_CODEX_RULES.md` para tareas relacionadas con operator-led, Croquis V2, acceso administrativo de Eventos o referencias al repositorio legacy.

## 1. Repositorio canónico

La única fuente de verdad es:

`ManuelRuiz27/invitacionespremium`

El repositorio `ManuelRuiz27/Soft-Monkey_InvitacionesPremium` es **LEGACY / VISUAL REFERENCE ONLY**.

Antes de consultar legacy, leer `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`.

## 2. Regla de no-fusión

Prohibido:

- fusionar historiales Git de ambos repositorios;
- copiar módulos completos del legacy;
- portar backend, auth, dominio, schema, API o realtime legacy;
- reemplazar contratos actuales por comportamiento legacy;
- hacer una migración de stack sólo por paridad visual.

Toda tarea debe modificar exclusivamente el repo canónico salvo una acción documental expresamente solicitada sobre legacy.

## 3. Croquis V2

Antes de editar Croquis leer obligatoriamente:

1. `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
2. `docs/03-diseno/FLOORPLAN_UX_TARGET.md`;
3. `docs/01-producto/04_OPERATOR_LED_MVP.md`;
4. `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md` si cambia autorización o superficie administrativa;
5. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md` si se consulta legacy.

Reglas:

- Sticker es concepto UX, no entidad de negocio;
- preservar Konva/React Konva actual;
- preservar modelo normalizado/persistencia actual;
- preservar MUI/design tokens actuales;
- reutilizar/refactorizar componentes existentes antes de crear paralelos;
- `SeatingWorkspace` es la base de asignación Planner;
- Planner no muta geometría en el perfil operator-led;
- Provider Builder requiere la capability del ADR;
- la nueva asignación persistente por silla/asiento está `Not now`;
- no introducir `Seat`/`SeatAssignment` en tareas de Croquis V2 inicial.

## 4. Referencia visual legacy

Sólo cuando la tarea lo indique expresamente, pueden consultarse rutas legacy concretas, principalmente:

- `docs/floorplan-ux-redesign-roadmap.md`;
- componentes visuales del workspace identificados por la especificación/tarea.

Lo que se rescata:

- composición;
- jerarquía;
- espaciado/densidad;
- patrones de paneles;
- ergonomía;
- sensación visual.

Lo que no se rescata:

- Tailwind/shadcn/Radix como requisito;
- arquitectura;
- estado global;
- API;
- persistencia;
- reglas de negocio;
- permisos.

Traducir la intención visual al design system del repo canónico.

## 5. Operator-led access

Una tarea que requiera que el proveedor modifique un Evento debe aplicar `ADR_OPERATOR_LED_ACCESS.md`.

Prohibido implementar atajos como:

- `if (role === PLATFORM_ADMIN) allow` sobre endpoints Planner sin contrato;
- impersonación;
- cambiar `clientId` arbitrariamente desde frontend;
- service-account global sin actor auditable;
- bypass de ownership;
- bypass de estado;
- bypass de créditos/pricing/readiness;
- feature flag que desactive seguridad.

Las pruebas mínimas incluyen happy path, cross-tenant denial, estado incompatible y auditoría.

## 6. UI exposure no es autorización

Codex debe tratar por separado:

- qué componentes/rutas se muestran;
- qué acciones permite el backend.

Ocultar el Floorplan Builder a Planner no sustituye denegar la mutación correspondiente.

Mostrarlo en Admin tampoco autoriza la mutación hasta que exista el contrato backend.

## 7. Scope discipline

Para ahorrar desarrollo y tokens:

- no borrar features ya construidas sólo porque queden fuera del lanzamiento;
- congelar/ocultar cuando sea más barato y seguro;
- no refactorizar módulos no necesarios para la tarea;
- no “mejorar” contratos cercanos sin bug/requerimiento;
- no agregar analytics complejos si una medición simple cubre el piloto;
- no implementar futuros niveles de self-service por anticipación.

## 8. Flujo obligatorio para cada bloque

1. citar documentos autoritativos aplicables;
2. declarar archivos/módulos que pretende tocar;
3. declarar explícitamente fuera de alcance;
4. implementar el cambio mínimo;
5. ejecutar tests específicos;
6. ejecutar typecheck/lint/build relevantes;
7. revisar diff por cambios de producto no solicitados;
8. actualizar contrato/OpenAPI/migración sólo si realmente cambió;
9. entregar commit pequeño y auditable.

No ejecutar un único prompt del tipo “implementa todo Croquis V2”.

## 9. Gates

No avanzar si:

- la tarea contradice un contrato vigente;
- requiere un nuevo rol/entidad no aprobado;
- requiere cambiar negocio para resolver una preferencia visual;
- el acceso provider-led todavía no existe y la tarea depende de él en producción;
- el legacy y el repo canónico difieren en comportamiento contractual;
- una decisión QA aplicable sigue `OPEN`.

En estos casos, reportar el conflicto sin improvisar.