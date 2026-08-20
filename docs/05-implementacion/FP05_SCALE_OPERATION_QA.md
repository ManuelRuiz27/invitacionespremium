# FP-05 — QA de escala y operación de Croquis V2

Estado: **CONTRATO DE IMPLEMENTACIÓN / READY FOR CODE DESPUÉS DE FP-04**  
Prerequisito: FP-04 aprobado y cerrado.  
Fuente superior: `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`, `docs/03-diseno/FLOORPLAN_UX_TARGET.md` y `docs/05-implementacion/19_OPERATOR_LED_FLOORPLAN_ROADMAP.md`.

## 1. Objetivo

Certificar que Croquis V2 y Seating Workspace conservan comportamiento operable en cargas parecidas a un Evento real antes de pasar a `PILOT-01`.

FP-05 **no es un nuevo rediseño ni un bloque de features**. Su secuencia es:

```text
fixture reproducible
→ prueba de carga/operación
→ evidencia de problema real
→ optimización mínima si hace falta
→ regresión
```

No se autoriza optimizar por intuición ni sustituir contratos existentes por soluciones paralelas.

## 2. Baseline ya existente que debe reutilizarse

El repositorio ya contiene cobertura relevante que FP-05 debe preservar y aprovechar:

- `apps/api/test/floorplan.integration-spec.ts` prueba el read model de Seating con **1,800 asistentes elegibles**, páginas acotadas y búsquedas/filtros;
- el mismo integration spec ya prueba carreras de asignación individual/familia/grupo sin sobrecapacidad ni writes parciales;
- también prueba concurrencia entre reducción/eliminación de Mesas y Seating;
- `apps/client/src/workspace/ActiveEventWorkspacePage.test.tsx` cubre Seating Workspace, 409, uncertain retry, responsive y Physical QR;
- `packages/floorplan` contiene tests de geometry/renderers/Surface e interacción;
- Admin Builder contiene fixtures de 20+ shapes y recuperación segura.

FP-05 debe **extender estos puntos**, no duplicar otra infraestructura de testing.

## 3. Escala mínima obligatoria

Validar explícitamente:

### Croquis / renderer

- 50 Mesas;
- 100 Mesas;
- 200 Mesas.

En cada escala debe ser posible al menos:

- renderizar sin excepción;
- seleccionar una Mesa al inicio, zona media y final del dataset;
- conservar read-only en Planner;
- conservar edición en Admin cuando el Floorplan no está locked;
- mantener zoom/pan/fit sin alterar geometría persistible;
- mantener labels/capacidad/ocupación correctos.

No se requiere certificar 200 elementos con cada sticker distinto. El objetivo es densidad operacional del modelo actual.

### Seating

- un Floorplan de hasta 200 Mesas;
- una página contractual de 50 personas;
- siguiente página/cursor cuando aplique;
- búsqueda;
- filtro por grupo;
- selección múltiple;
- asignación/move/unassign en la carga anterior.

No cargar todos los asistentes en memoria para demostrar escala. El contrato de Seating sigue paginado.

### Backend read model

Preservar la prueba existente de 1,800 asistentes elegibles y su límite temporal actual. No relajarla para hacer verde FP-05.

## 4. Regla sobre thresholds de performance

No introducir nuevos thresholds arbitrarios de milisegundos en tests de DOM/React/Konva sólo para declarar performance.

Los gates principales para frontend son deterministas:

- render completa;
- interacción posible;
- call count correcto;
- ausencia de requests extra no autorizados;
- ausencia de bloqueo lógico o loops;
- datos correctos después de interacción.

Si se registra `performance.now()` para diagnóstico, el número puede reportarse pero no convertirse en gate nuevo sin baseline repetible y justificación.

El threshold ya existente del integration test de Seating 1,800 se conserva porque forma parte del baseline previo.

## 5. Builder Admin a escala

Ruta:

`/eventos/:eventId/preparar/croquis`

Con 50/100/200 Mesas verificar:

- `AdminFloorplanBuilderWorkspace` monta una sola vez el engine compartido;
- catálogo y canvas siguen utilizables;
- selección de una shape abre inspector correcto;
- un draft nuevo no dispara API antes de Save;
- Save ejecuta una sola mutación;
- duplicate ejecuta un solo create;
- lock convierte geometría en read-only;
- unlock restablece edición;
- summary/estado no crea requests por shape;
- no se introduce polling por elemento.

Si aparece un problema real, preferir optimización local y medible. No crear virtualización del canvas, otro renderer ni store global por anticipación.

## 6. Seating Workspace a escala

Ruta Planner:

`/eventos/:eventId?seccion=mesas`

Con Floorplan grande verificar:

- canvas mantiene selección read-only;
- summary de Mesas/capacidad/ocupación/disponibles sigue siendo correcto;
- seleccionar Mesa no solicita geometría mutable;
- Seating sigue pidiendo como máximo la página contractual solicitada;
- search/group/cursor no descargan dataset completo;
- selección múltiple sigue limitada por disponibilidad;
- family/group/move/unassign mantienen los intents actuales;
- uncertain retry conserva la misma idempotency key;
- 409 hace refetch sin replay inseguro;
- Physical QR sigue sin request nominal.

No introducir drag Persona→Mesa.

## 7. Dos sesiones / concurrencia

FP-05 debe aportar evidencia de dos actores operando sobre el mismo Evento.

### Backend real

Reutilizar/fortalecer las pruebas PostgreSQL actuales de carreras de Seating y capacidad.

La evidencia mínima debe demostrar:

- no sobrecapacidad;
- no partial writes;
- idempotency preservada;
- estado final autoritativo consistente.

No forzar un `FLOORPLAN_CONCURRENCY_CONFLICT` si el motor serializable resuelve legítimamente ambas transacciones. La prueba debe verificar invariantes, no un error artificial específico.

### Frontend

Mantener cobertura de una segunda sesión que provoca un estado obsoleto/409 y confirmar:

- no replay automático;
- Floorplan + Seating refetch;
- selección reconciliada;
- copy recuperable.

No añadir version token/ETag en FP-05.

## 8. Realtime y reconexión

El protocolo actual de `useWorkspaceRealtime` se conserva.

Probar de forma focalizada:

- `seating.updated` actualiza ocupación y provoca invalidación/refetch;
- operationId duplicado no se aplica dos veces;
- `connect` y `reconnect` fuerzan recuperación REST;
- `event.closed` / `event.cancelled` cambia a terminal/read-only, cancela Seating y desconecta socket;
- después de reconexión el estado autoritativo REST prevalece.

No crear segundo cliente realtime ni polling paralelo.

## 9. Mutaciones rápidas

Validar secuencias razonables de operación rápida sin double-submit:

- asignar selección;
- mover selección a otra Mesa;
- desasignar;
- seleccionar otra Mesa inmediatamente después de reconciliación;
- operación family/group cuando aplique.

El objetivo no es automatizar clicks a frecuencia irreal sino comprobar que los guards existentes bloquean doble submit y que cada acción autorizada genera el número correcto de requests.

## 10. Error de red alrededor de mutación confirmada

Preservar y extender los invariantes de FP-03/FP-04:

### Admin geometry

mutación confirmada
→ GET falla
→ no replay
→ `Actualizar plano`
→ GET solamente.

### Planner Seating

resultado de red incierto
→ refetch Seating
→ si intent reflejado, confirmar éxito
→ si no, conservar `uncertainIntent`
→ retry con la misma idempotency key.

No convertir fallos de red en éxito visual sin evidencia autoritativa.

## 11. Read-only / terminal

Validar:

- Floorplan locked en Admin;
- Evento CLOSED/ARCHIVED/CANCELLED donde corresponda en Planner;
- terminal realtime durante una operación;
- geometría consultable pero no mutable;
- Seating no inicia nuevas mutaciones cuando no es mutable.

No usar UI hiding como sustituto de backend auth.

## 12. Desktop / tablet

### Desktop

Validar Builder y Seating con los datasets grandes en un viewport representativo de escritorio.

### Tablet landscape

Validar al menos alrededor de 1024×768 o equivalente:

- Builder conserva canvas dominante y panel contextual usable;
- Seating usa Drawer lateral;
- touch targets siguen >=44px;
- selección/pinch/pan no dispara mutaciones accidentales.

Mobile Builder completo sigue fuera del alcance. Seating mobile conserva el bottom sheet existente y puede incluirse como regresión, pero FP-05 se concentra en desktop/tablet para Builder.

## 13. No regresión cruzada

Ejecutar regresiones relevantes de:

- Invitation distribution;
- RSVP/readiness donde sea razonable;
- Scanner/check-in;
- Staff access;
- Event lifecycle;
- Active Event workspace;
- API Client contracts.

FP-05 no debe modificar estos módulos salvo que una regresión introducida por Croquis sea demostrada.

Los 6 fallos históricos Client conocidos se reportan por separado mientras sigan idénticos.

## 14. Cambios de producción autorizados

Se permite cambiar código de producción **únicamente** cuando:

1. una prueba/fixture FP-05 reproduce el problema;
2. el problema afecta escala, seguridad operacional o estabilidad;
3. el fix es mínimo y mantiene contratos.

Ejemplos aceptables:

- eliminar una recomputación O(n²) demostrada;
- memoizar derivación costosa demostrada;
- evitar rerender accidental masivo;
- corregir dedupe/reconnect defectuoso;
- corregir double-submit reproducible.

No aceptables sin decisión separada:

- virtualización/canvas engine nuevo;
- nueva cache global;
- nuevo protocolo realtime;
- endpoint bulk nuevo;
- Web Worker;
- nuevo schema;
- Redis;
- offline;
- Seat/SeatAssignment.

Si alguno fuera necesario para pasar el piloto: `TECHNICAL DECISION REQUIRED`.

## 15. Evidencia que debe entregar FP-05

El resultado debe incluir una matriz con:

| Escenario | Escala | Superficie | Resultado | Evidencia |
| --- | ---: | --- | --- | --- |
| Builder | 50/100/200 Mesas | Admin | PASS/FAIL | test/fixture/pasos |
| Seating | 200 Mesas + 50 personas | Planner | PASS/FAIL | test/fixture/pasos |
| Seating read model | 1,800 asistentes | API/Postgres | PASS/FAIL | integration test |
| Concurrencia | 2 sesiones | API | PASS/FAIL | integration race |
| Realtime/reconnect | n/a | Client | PASS/FAIL | focused test |
| Red incierta | n/a | Admin/Planner | PASS/FAIL | focused test |
| Read-only | n/a | Admin/Planner | PASS/FAIL | focused test |
| Tablet landscape | escala representativa | Admin/Planner | PASS/FAIL | pasos reproducibles |

Screenshots son opcionales. Si no existen, indicar route, viewport, fixture y pasos exactos.

## 16. QA gates

Ejecutar targeted primero y después:

- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`;
- `git diff --check`;
- integración PostgreSQL de Floorplan/Seating;
- suites Scanner/check-in relevantes para detectar regresión cruzada.

No omitir integración PostgreSQL en FP-05: este bloque certifica concurrencia y read model real.

## 17. Fuera de alcance

- nuevos features del Builder;
- nuevos stickers;
- Planner Builder;
- Seat/SeatAssignment;
- drag Persona→Mesa;
- nuevo backend API;
- OpenAPI nuevo;
- Prisma/migrations salvo que un bug crítico previo obligue a elevar decisión;
- realtime nuevo;
- offline;
- nuevo sistema de performance monitoring;
- analytics de piloto;
- PILOT-01/PILOT-02.

## 18. Criterio de salida

FP-05 se considera completado cuando:

1. 50/100/200 Mesas están cubiertas de forma determinista en el engine/Builder;
2. Seating opera sobre Floorplan grande y página de 50 personas sin cambiar contratos;
3. el read model de 1,800 asistentes y las carreras PostgreSQL pasan;
4. reconnect/realtime/errores inciertos/read-only conservan recuperación segura;
5. no hay regresión nueva en Scanner/check-in/RSVP atribuible a Croquis;
6. cualquier optimización de producción está respaldada por una prueba que fallaba antes;
7. queda una matriz de evidencia suficiente para decidir entrada a `PILOT-01`.

FP-05 no declara por sí mismo que el producto completo esté listo para Evento real; habilita la evaluación end-to-end de `PILOT-01`.