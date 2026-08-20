# PILOT-02 — Instrumentación operativa mínima del piloto

Estado: **Contrato técnico listo para implementación**  
Prerequisito: PILOT-01 aprobado y cerrado.  
Objetivo: registrar por Evento el esfuerzo operativo real del modelo operator-led para decidir qué automatizar después del piloto, sin construir una plataforma de analytics.

## 1. Resultado esperado

Después de operar cada Evento piloto, el proveedor debe poder responder con datos simples:

- cuánto tiempo activo consumió la preparación total;
- cuánto correspondió a Invitación;
- cuánto correspondió a Croquis;
- cuántos invitados y Mesas tuvo el Evento;
- cuántas incidencias hubo y en qué área;
- cuánto soporte Planner fue necesario;
- cuántos cambios de último minuto ocurrieron;
- cuántos incidentes/reintentos operativos de check-in se registraron;
- cuánto trabajo manual repetitivo apareció.

El objetivo es producir evidencia para priorizar con:

`frecuencia × tiempo × riesgo/error × repetibilidad`

No convertir estos datos en métricas comerciales ni comprometer SLAs todavía.

## 2. Decisión de arquitectura

### Reutilizar `AuditLog`

No crear una nueva tabla de analytics/telemetría para PILOT-02.

`AuditLog` ya ofrece:

- `eventId`;
- `clientId`;
- actor real;
- `action`;
- `resourceType` / `resourceId`;
- `metadata` JSON sanitizado;
- `operationId`;
- `occurredAt`;
- consulta filtrable y ordenada.

Las observaciones del piloto son acciones explícitas del operador y pueden almacenarse como entradas append-only de auditoría.

Convención autorizada:

- `resourceType`: `PILOT_OPERATION`
- `resourceId`: `eventId`
- `action`: `PILOT_OBSERVATION_RECORDED`

No modificar el modelo Prisma de `AuditLog`.

No migration.

No tabla `AnalyticsEvent`, `Telemetry`, `PilotMetric` o equivalente.

## 3. Frontera de acceso

La instrumentación es **Provider/Admin only**.

No exponerla a Planner, Staff, invitado público ni Scanner.

Toda mutación debe:

1. autenticar actor interno real;
2. recibir `clientId + eventId` por ruta administrativa;
3. verificar que el Evento pertenece al Client;
4. registrar actor real en AuditLog;
5. no impersonar Planner;
6. no ampliar permisos de otras superficies.

Reutilizar el patrón de autorización operator-led vigente.

## 4. API mínima

Añadir únicamente endpoints administrativos event-scoped:

### POST

`/api/v1/admin/clients/{clientId}/events/{eventId}/pilot-observations`

Registra una observación.

### GET

`/api/v1/admin/clients/{clientId}/events/{eventId}/pilot-observations`

Devuelve:

- observaciones del Evento en orden descendente;
- resumen agregado mínimo;
- snapshot agregado actual de invitados/Mesas.

No endpoints Planner.

No update/delete: el journal es append-only durante piloto.

Si una captura humana fue equivocada, se registra una nueva observación correctiva; no se reescribe el histórico.

## 5. Contrato de observación

DTO de entrada conceptual:

```ts
{
  kind:
    | 'PREPARATION_TIME'
    | 'INCIDENT'
    | 'PLANNER_SUPPORT'
    | 'LAST_MINUTE_CHANGE'
    | 'MANUAL_WORK',
  area:
    | 'GENERAL'
    | 'INVITATION'
    | 'FLOORPLAN'
    | 'GUESTS'
    | 'RSVP'
    | 'SEATING'
    | 'STAFF'
    | 'CHECKIN'
    | 'CLOSE_REPORT',
  durationMinutes?: number,
  count?: number,
  note?: string
}
```

Los enums son contrato API/UI de PILOT-02; no son nuevas entidades persistentes.

Persistirlos dentro de `AuditLog.metadata`.

## 6. Validación

### durationMinutes

- entero positivo;
- máximo razonable por entrada: 1440;
- requerido para `PREPARATION_TIME`;
- requerido para `PLANNER_SUPPORT` y `MANUAL_WORK` cuando se pretende medir tiempo;
- opcional para incidencias/cambios cuando sólo se registra cantidad.

### count

- entero positivo;
- default lógico 1;
- usar para número de incidencias/cambios/reintentos agrupados;
- no usar como sustituto de invitados/Mesas.

### note

- opcional;
- máximo 500 caracteres;
- texto operativo breve;
- la UI debe indicar explícitamente: **No incluyas nombres, teléfonos ni datos personales de invitados.**

No almacenar teléfonos, tokens, QR, links privados, nombres de asistentes ni payloads sensibles dentro del journal.

La sanitización vigente de AuditLog permanece activa, pero no se usa como excusa para aceptar PII intencional.

## 7. Resumen agregado

El GET debe producir un resumen simple, no analytics avanzada.

Campos mínimos conceptuales:

```ts
{
  preparationMinutesTotal: number,
  invitationPreparationMinutes: number,
  floorplanPreparationMinutes: number,
  plannerSupportMinutes: number,
  plannerSupportEntries: number,
  incidents: number,
  checkinIncidents: number,
  lastMinuteChanges: number,
  manualWorkMinutes: number,
  manualWorkEntries: number,
  guestCount: number,
  tableCount: number
}
```

### Derivación

`preparationMinutesTotal`
= suma de `durationMinutes` donde `kind=PREPARATION_TIME`.

`invitationPreparationMinutes`
= `PREPARATION_TIME + INVITATION`.

`floorplanPreparationMinutes`
= `PREPARATION_TIME + FLOORPLAN`.

`plannerSupportMinutes`
= suma de duración de `PLANNER_SUPPORT`.

`plannerSupportEntries`
= suma/count de observaciones `PLANNER_SUPPORT`.

`incidents`
= suma de `count` para `INCIDENT`.

`checkinIncidents`
= suma de `count` para `INCIDENT + CHECKIN`.

`lastMinuteChanges`
= suma de `count` para `LAST_MINUTE_CHANGE`.

`manualWorkMinutes`
= suma de duración de `MANUAL_WORK`.

`manualWorkEntries`
= suma/count de observaciones `MANUAL_WORK`.

`guestCount`
= agregado de Contactos/Invitaciones/Asistentes según el contrato actual que mejor represente el volumen operativo. **No devolver registros ni PII.** Antes de implementar, usar una fuente ya existente y documentar exactamente cuál se eligió.

`tableCount`
= count de `FloorplanShape.kind === TABLE` del Evento.

No inventar `confirmedCount` ni métricas distintas a las aprobadas.

## 8. Semántica del tiempo

PILOT-02 mide **tiempo activo declarado por el operador**, no tiempo calendario entre timestamps del sistema.

Ejemplo válido:

- preparar Invitación tomó 35 minutos activos;
- Croquis tomó 50 minutos activos.

No calcular automáticamente “tiempo de preparación” como:

`activatedAt - createdAt`

porque incluye espera del cliente, días sin trabajo y tiempos ajenos al esfuerzo operativo.

No implementar cronómetro/start-stop en este ticket.

El operador registra el tiempo al terminar cada bloque.

## 9. UI Admin mínima

Añadir una superficie pequeña dentro del flujo de preparación administrativa.

Ruta recomendada:

`/eventos/:eventId/preparar/registro`

Etiqueta visible:

**Registro operativo**

La UI debe contener:

1. resumen compacto del Evento;
2. formulario `Registrar actividad`;
3. historial reciente append-only.

### Formulario

Lenguaje natural:

- Tipo de actividad
- Área
- Tiempo invertido (min)
- Cantidad
- Nota breve

No mostrar:

- `PILOT_OPERATION`;
- action strings;
- IDs;
- metadata JSON;
- actorType;
- detalles técnicos de AuditLog.

### Resumen

Mostrar como máximo los datos que ayudan a operar/mejorar:

- Preparación total
- Invitación
- Croquis
- Invitados
- Mesas
- Incidencias
- Soporte Planner
- Cambios de último minuto
- Trabajo manual

No crear dashboards, gráficas históricas multi-cliente ni rankings.

## 10. Progressive disclosure

La instrumentación no debe competir con Datos/Invitación/Croquis.

`Registro operativo` es secundaria y puede estar al final de la navegación de preparación.

No bloquear activation/readiness por no haber observaciones.

No convertir el journal en un paso obligatorio del Event state machine.

## 11. Incidencias automáticas vs manuales

PILOT-02 no debe duplicar la auditoría técnica que ya existe.

Eventos como activación, Seating, check-in y cierre siguen auditándose por sus módulos actuales.

El journal registra **impacto operacional observado**, por ejemplo:

- “Se requirió reintentar escaneo 3 veces por mala conectividad”;
- “Planner solicitó 20 minutos de apoyo para reasignar mesas”;
- “Cambio de croquis 2 horas antes del Evento”.

No generar automáticamente una observación por cada AuditLog técnico.

No duplicar eventos de sistema sólo para inflar métricas.

## 12. Check-in failures/retries

Registrar manualmente sólo cuando el comportamiento tuvo impacto operacional real.

Usar:

- `kind=INCIDENT`
- `area=CHECKIN`
- `count=N`
- `durationMinutes` si consumió tiempo relevante.

Los contadores internos de idempotencia/reintento del Scanner no cambian.

No tocar protocolo Scanner para instrumentación.

## 13. Soporte Planner

Registrar como:

- `kind=PLANNER_SUPPORT`
- área correspondiente;
- minutos activos;
- cantidad 1 salvo que se agrupen interacciones homogéneas.

No registrar conversación, teléfono, nombre del Planner ni contenido sensible.

El objetivo es medir esfuerzo, no construir CRM/ticketing.

## 14. Trabajo manual repetitivo

Registrar acciones repetitivas que podrían justificar automatización posterior.

Ejemplos:

- limpieza manual de lista;
- correcciones repetidas de nombres;
- cambios de Mesa uno por uno;
- reacomodo operativo;
- reenvíos manuales repetidos.

La nota describe la tarea de forma genérica.

No automatizarla dentro de PILOT-02.

## 15. Fuente de verdad y privacidad

`AuditLog` es la fuente persistida del journal.

No usar:

- localStorage;
- sessionStorage;
- archivos JSON locales como verdad de producción;
- hojas de cálculo embebidas;
- third-party analytics;
- logs del navegador.

No agregar cookies/tracking.

No recolectar comportamiento de invitados fuera de los flujos actuales.

## 16. Retención

PILOT-02 no define nueva política de retención.

Las observaciones siguen la política vigente de AuditLog mientras se evalúa el piloto.

Si negocio requiere borrado/retención específica para analytics después del piloto: `PRODUCT DECISION REQUIRED`.

## 17. API client

Actualizar OpenAPI/api-client sólo para los dos endpoints Admin autorizados.

Wrapper sugerido dentro de Admin event preparation/instrumentation, no Planner API.

El Client Planner no debe importar ni poder invocar estas operaciones.

## 18. Tests backend

Cubrir como mínimo:

1. PLATFORM_ADMIN registra observación válida;
2. actor real queda en AuditLog;
3. `clientId/eventId` correctos;
4. cross-client => 404/denial sin leakage según patrón vigente;
5. Event inexistente => not found;
6. enum inválido => 400;
7. duration inválida => 400;
8. note >500 => 400;
9. metadata persistida contiene sólo campos aprobados;
10. PII no se agrega automáticamente;
11. GET lista sólo observaciones del Event;
12. summary suma tiempos correctamente;
13. checkinIncidents deriva sólo `INCIDENT + CHECKIN`;
14. guestCount es agregado sin PII;
15. tableCount cuenta sólo TABLE;
16. no endpoint Planner equivalente.

## 19. Tests Admin

Cubrir:

1. route `preparar/registro`;
2. Event cargado antes de derivar clientId;
3. resumen natural;
4. formulario registra observación;
5. mutation lock evita double submit;
6. respuesta confirmada actualiza listado/resumen;
7. error recuperable no inventa éxito;
8. campos condicionales/validación;
9. aviso de no incluir datos personales;
10. historial natural sin JSON/IDs;
11. navegación secundaria no bloquea preparación;
12. cero llamadas Planner;
13. responsive desktop/tablet.

## 20. QA de piloto

Simular al menos un Evento con observaciones:

- 30 min Invitación;
- 45 min Croquis;
- 15 min soporte Planner en Seating;
- 2 cambios de último minuto;
- 1 incidente Check-in de 10 min;
- 20 min de trabajo manual repetitivo.

Validar el resumen exacto:

- preparación total: 75 min;
- Invitación: 30 min;
- Croquis: 45 min;
- soporte Planner: 15 min;
- cambios de último minuto: 2;
- incidencias: 1;
- incidencias Check-in: 1;
- trabajo manual: 20 min.

Guest/table counts deben provenir del Evento real/fixture, no del formulario manual.

## 21. No analytics platform

Fuera de alcance explícito:

- dashboards cross-client;
- series temporales;
- funnels;
- cohortes;
- BI;
- Segment/Mixpanel/GA/PostHog;
- warehouse;
- Redis;
- Kafka;
- event streaming;
- feature flags por métrica;
- automatizaciones basadas en métricas;
- recomendaciones automáticas;
- scoring de Planner;
- seguimiento individual de invitados.

## 22. Production change rule

PILOT-02 autoriza únicamente:

- endpoint Admin de journal;
- lectura/resumen del journal;
- api-client contractual;
- superficie Admin mínima;
- tests.

No modificar lógica de Invitación, Croquis, Seating, Scanner, RSVP, finanzas o lifecycle para instrumentar.

## 23. Gates

Ejecutar:

- tests backend focales de instrumentación/audit;
- Admin focal;
- Audit regression;
- Admin preparation regression;
- API Client generate/check si cambia OpenAPI;
- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`;
- `git diff --check`.

El fallo histórico de formato de `LandingEyebrow.tsx` puede seguir separado únicamente si continúa idéntico y fuera de scope.

PILOT-01 dejó Client completo verde; una regresión nueva no es aceptable.

## 24. Criterio de salida

PILOT-02 queda aprobado cuando:

1. un Provider puede registrar observaciones event-scoped sin impersonación;
2. no existe nueva tabla/migration de analytics;
3. los tiempos se registran como minutos activos, no elapsed calendar;
4. summary produce exactamente las métricas autorizadas;
5. guest/table counts son agregados autoritativos sin PII;
6. el journal es append-only;
7. no hay endpoint Planner;
8. la UI Admin es mínima y secundaria;
9. la instrumentación no altera el flujo operativo del Evento;
10. existe evidencia suficiente para comparar Eventos piloto después de operar varios casos.
