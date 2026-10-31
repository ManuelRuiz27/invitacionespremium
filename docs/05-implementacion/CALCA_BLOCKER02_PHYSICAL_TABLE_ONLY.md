# CALCA-BLOCKER-02 — PHYSICAL_QR conserva TABLE

**Resultado: PASS del ticket PHYSICAL_QR.** No constituye aprobación del piloto global.

Base: `main`, `9d768d93ec0b0a96e92edc0a12790346c288e547`. Alcance limitado al P1 PHYSICAL_QR del [informe CALCA-06](./CALCA06_TRACE_MODE_CERTIFICATION.md), sin ejecutar ni reescribir aquella certificación.

## Causa y política autoritativa

El cambio de modo sólo rechazaba `accessMode=ANONYMOUS`. Los escritores de Seats confiaban en que `seatingMode=SEAT` fuera suficiente, por lo que un PHYSICAL_QR legacy podía entrar y persistir lugares.

Una guarda privada compartida consulta `Event.serviceId → Service.code` dentro de la transacción existente. Rechaza PHYSICAL_QR y conserva el rechazo ANONYMOUS con 409 `PHYSICAL_PASS_TABLE_INVALID`. No utiliza precios, perfil comercial, `isActive` o snapshot de activación como capability. No introduce una allowlist que restrinja otros servicios.

| Entrada                                   | Enforcement                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cambiar a SEAT, incluso si ya figura SEAT | Guarda antes del no-op de modo                                                                          |
| Crear/duplicar Seat                       | Guarda antes de persistir                                                                               |
| Editar/mover/bloquear/desbloquear Seat    | Guarda antes de persistir                                                                               |
| Lote y renumeración                       | Guarda antes de modificar filas o etiquetas temporales                                                  |
| Borrar Seat                               | Misma política: datos heredados quedan congelados, no se borran automáticamente                         |
| `assign-seats`                            | Rechaza nuevas asignaciones exactas; replay de un snapshot ya confirmado no ejecuta una escritura nueva |

Ownership, lock, lifecycle, transacciones serializables, auditoría e idempotencia conservan su infraestructura. La guarda no habilita cambios de modo fuera de preparación ni salta locks/check-in. TABLE sigue permitido por la operación existente. Un retorno explícito SEAT→TABLE conserva filas/UUID/etiquetas de Seats y aplica la limpieza de precisión de Assistant que ya ejecuta el trigger vigente. No hay migración ni backfill.

FLYER, FLIPBOOK, DEMO y ACCESS_CONTROL NOMINAL conservan el flujo exacto existente. ACCESS_CONTROL ANONYMOUS sigue TABLE-only. No cambian schema, endpoints, DTOs, SDK, roles, readiness o reglas comerciales.

## Admin

La UI refleja la política con los campos existentes de AdminEvent. PHYSICAL_QR ofrece únicamente «Por mesa»; Calca sigue construyendo Mesas con capacidad manual. No se ofrece «Trazar lugares», ni controles manuales/de corrección de Seats; los handlers también descartan esas intenciones si llega estado antiguo.

Un layout PHYSICAL_QR heredado en SEAT muestra una advertencia explícita y «Volver a Por mesa». No se cambia el modo al cargar. El botón reutiliza la confirmación y PATCH existentes; si el plano está bloqueado se requiere primero el unlock autorizado. No se presenta un select con un valor SEAT fuera de sus opciones ni se finge que los datos ya fueron convertidos.

Revisión React: política derivada de props, sin efectos de conversión automática, hooks/keys/handlers existentes conservados, controles con nombres accesibles y advertencia no modal. Se conserva MUI; no se rediseñan superficies.

## QA focalizado y PostgreSQL

```powershell
pnpm test:e2e:access-control -- --integration-only --integration-files=floorplan
pnpm --filter @invitaciones/admin exec vitest run src/events/admin-event-preparation.test.tsx
pnpm --filter @invitaciones/api test src/floorplan
pnpm exec turbo run lint typecheck build --filter=@invitaciones/api... --filter=@invitaciones/admin... --concurrency=1
```

- API/PostgreSQL real: **47/47 PASS**, ocho nuevos casos además de los 39 anteriores, incluido CALCA-BLOCKER-01. Se rechaza SEAT desde TABLE sin escribir Seats; el legado rechaza seis clases de escritura sin modificar filas/asignaciones/auditoría; el retorno TABLE conserva sus dos Seats. Se comprueban los cuatro servicios elegibles, ANONYMOUS, aislamiento, lock y lifecycle.
- Admin Floorplan: **149/149 PASS** iniciales, siete nuevos casos. Incluye 1440/1024, ausencia de POST Seat, recuperación explícita y servicios elegibles.
- Unidades API Floorplan: **58/58 PASS**.
- Lint/typecheck/build: **15/15 tareas PASS**, nueve cachés de contenido válidas. Las pruebas se ejecutaron realmente.

Los nuevos fixtures tuvieron primero errores de preparación (8/47 fallos de configuración inmutable; después 2/47 por agregado NOMINAL y snapshot terminal). Se corrigió exclusivamente el bootstrap: NOMINAL ACCESS_CONTROL usa su agregado individual PENDING, y el estado terminal parte de una transición de fixture válida. La ejecución final completa pasa 47/47. Para defensa se incluye PHYSICAL_QR con `accessMode=NOMINAL` heredado no canónico, sembrado sólo en la DB aislada; no se modifica el validador de configuración real. Las operaciones comprobadas ejecutan los triggers normales. No se cambian timeouts, workers o retries.

## Reproducción independiente del intento 9

Se reutilizan sólo helpers de fixture/gestos, el raster original y el patrón de recursos propios; no se ejecuta `certify.mjs` ni se escribe en `evidence/calca06`. [Guion](./evidence/calca-blocker02/reproduce.mjs), [runner](./evidence/calca-blocker02/run-reproduction.mjs).

**4/4 PASS**: layout TABLE y layout SEAT heredado, ambos en SELF_SERVICE / PHYSICAL_QR a 1440×900 y 1024×768. El intento histórico devolvía 200 al pedir SEAT y creaba un lugar; ahora devuelve 409 `PHYSICAL_PASS_TABLE_INVALID`, no ofrece SEAT ni «Trazar lugares» y registra cero POST de Seats desde UI. Calca crea una Mesa nueva por su operación vigente, con capacidad manual y cero Seats. En legado, el POST exacto directo también se rechaza; la confirmación TABLE conserva el Seat original.

| Captura nativa                       | 1440                                                                                       | 1024×768                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| TABLE / Mesa creada en Calca         | [captura](./evidence/calca-blocker02/attempts/reproduction/1440-table-only.png)            | [captura](./evidence/calca-blocker02/attempts/reproduction/1024-table-only.png)            |
| Legado SEAT sin herramientas exactas | [captura](./evidence/calca-blocker02/attempts/reproduction/1440-legacy-seat-readonly.png)  | [captura](./evidence/calca-blocker02/attempts/reproduction/1024-legacy-seat-readonly.png)  |
| Retorno explícito a TABLE            | [captura](./evidence/calca-blocker02/attempts/reproduction/1440-legacy-returned-table.png) | [captura](./evidence/calca-blocker02/attempts/reproduction/1024-legacy-returned-table.png) |

[Resultados y métricas DOM](./evidence/calca-blocker02/attempts/reproduction/results.json), [evidencia PostgreSQL](./evidence/calca-blocker02/db-guards.json), [registro de ejecuciones](./evidence/calca-blocker02/qa.json). Las capturas contienen sólo datos ficticios y el raster original; no son aceptación física de tablet ni un nuevo gate global de Calca.

## Publicación y límites

El [gate de guías](../guias-usuario/control-de-acceso/README.md) exige regenerar su publicación al cambiar el digest de API/Admin. Es publicación oficial de UX02, distinta de CALCA-06. Se conservan masks, contenido editorial, asserts y verificadores.

Publicación obligatoria PASS: un journey UX02 real, cinco tests de tooling, 39 PNG verificados y PDF de 14/21/2 páginas. ADMIN y SALON se regeneran con el contenido capturado; el PDF de usabilidad se restaura porque sólo diferían CreationDate/ModDate. Verificación final PASS. El hash de runtime coincide con la reproducción focalizada. Cero bases efímeras propias sobrantes; contenedores de desarrollo conservados. Los logs distinguen fallos iniciales de fixtures y ejecuciones verdes; no se afirma flakiness cero.

No se corrigen sincronización de capacidad TABLE→SEAT, hit targets densos de Planner, superposición de la lista de Mesas ni P2. La recomendación global de piloto continúa BLOCKED hasta atender los tres P1 restantes y recertificar por separado.
