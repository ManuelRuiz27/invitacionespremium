# M02-B01-DT07 — Experiencia Provider, Organización y Scanner

Estado: **Implementación DT07; certificación de piloto DT09 pendiente.**
Implementación: **2026-10-22**. Validación final: **2026-10-23**. M01 sigue siendo la dirección de lanzamiento; este ticket explícito no activa M02 completo, licencias ni Finance.

## Superficies implementadas

- **Admin:** alta discriminada de Organización MANAGED con `ACCESS_CONTROL` y modalidad obligatoria, Planner válido y capacidad 1–150. M01 y el intake Self-Service conservan sus rutas. Preparación contextual Datos/Croquis/Accesos, sin diseño, RSVP, hotspots ni circuito comercial. Readiness autoritativo controla la activación Managed existente. Sólo Provider genera lotes ANONYMOUS; el resultado confirma rango y operación. Un resultado incierto conserva clave, cantidad y Mesa y bloquea navegación hasta resolverlo.
- **Client NOMINAL:** registro sin teléfono obligatorio, CSV con plantilla/preview/errores y commit idempotente; credenciales por UUID de Assistant, historial, emisión, SVG, revocación confirmada con motivo técnico y reemisión. La lista interna PENDING no expone RSVP ni derechos familiares. La composición PDF usa nombres sólo en la presentación. Acomodo TABLE/SEAT desde preparación sobre geometría de sólo lectura, sujeto a las respuestas del backend.
- **Client ANONYMOUS:** lista por folio y Mesa, historial UNUSED/USED/REVOKED, SVG y PDF de material distribuible y revocación de no usados. No hay generación Client, Contact/Invitation/Assistant, RSVP ni asignación nominal. Croquis conserva ocupación y geometría de consulta.
- **Staff:** panel existente en ACTIVE/EVENT_DAY, máximo tres accesos y enlace de entrega única; Organization Admin o Planner asignado, conforme a DT06A.
- **Scanner:** preserva scan/check-in familiar legacy y añade ingreso atómico NOMINAL y consumo ANONYMOUS. Lock síncrono contra frames consecutivos, cámara pausada durante solicitud/resultado/error, retry del mismo token/clave ante incertidumbre, siguiente escaneo explícito y detención por Staff expirado/Evento no operativo. Sin búsqueda de nombres B01. Resultados mínimos con nombre o folio y Mesa/Lugar cuando corresponda.

## Contratos y SDK

Tipos procedentes de OpenAPI, regenerados por las tareas oficiales. Wrappers:

| Cliente SDK | HTTP |
| --- | --- |
| `events.getAccessReadiness` | `GET /events/:eventId/access-readiness` |
| `adminEventPreparation.getAccessReadiness` | `GET /admin/clients/:clientId/events/:eventId/access-readiness` |
| `adminEventPreparation.generatePhysicalPasses` | `POST /admin/clients/:clientId/events/:eventId/physical-passes/generate` |
| `nominalAccessCredentials.list/issue/svg/revoke` | Rutas autenticadas DT03 existentes |
| `physicalPasses.revoke` | `POST /events/:eventId/physical-passes/:passId/revoke` |
| `scanner.scanNominalAccess` | `POST /scanner/:staffToken/nominal-access/scan` |

Se conserva el requester/ApiError, cookies `include` autenticadas y `omit` en Scanner. El validador de eventos acepta ACCESS_CONTROL sin ampliar el DTO de creación Self-Service.

La sesión pública añade exclusivamente `event.serviceCode` y `event.accessMode`; no entrega tenant, identidades adicionales ni secretos. El detalle autenticado del Evento ACCESS_CONTROL añade `hasAccessMaterial` opcional, derivado de `event_has_access_material()`, para congelar el selector de modalidad incluso con historial revocado y conteo vigente cero. La ausencia del campo bloquea conservadoramente el selector hasta una lectura de detalle; los snapshots/replays de activación no se alteran.

El listado NOMINAL de contactos añade `assistantId` opcional de sólo lectura, derivado del principal
interno vigente. Permite emitir por UUID sin depender del Croquis ni de nombres únicos. GuestManagement
y credenciales usan Contactos/Grupos; no llaman al listado legacy de Invitations, que conserva su
rechazo `INVITATION_INTERNAL_ONLY`. No se crean endpoints, agregados ni permisos adicionales.

## Permisos y operaciones pendientes

La UI selecciona superficies; API y PostgreSQL siguen autorizando actor, ownership, modalidad, estados, capacidad y material. Provider no usa rutas Client de emisión nominal/Staff; Organización no usa generación Provider; Staff sólo usa Scanner. No se cambian roles, entidades de dominio ni migraciones.

Las operaciones inciertas conservan intención y clave en memoria; no se guardan QR/Staff en localStorage, analytics ni logs. La navegación bloqueada evita perder una operación antes de su retry. Los archivos se componen bajo demanda sin FileAsset ni persistencia QR.

## QA reproducible

`pnpm test:e2e:access-control` crea una base PostgreSQL efímera y storage aislado, aplica las migraciones existentes y arranca API/Admin/Client/Scanner en 5300/5374/5373/5375. Falla si los puertos están ocupados y sólo termina sus propios procesos y elimina su base/storage. Usa los flujos reales Provider→Organización→activación→Staff; la cámara virtual recibe píxeles del SVG descargado y el CameraReader real decodifica el QR. No intercepta respuestas HTTP. Traza, vídeo y screenshots se desactivan para no grabar los secretos de Scanner.

`pnpm test:e2e:access-control -- --integration-only` ejecuta las regresiones API sobre una base nueva sin iniciar servidores ni usar los datos locales. La conexión PostgreSQL se toma del entorno únicamente para crear la base aislada; no se imprime.

La selección acotada de integración se reproduce con:
`pnpm test:e2e:access-control -- --integration-only '--integration-files=contacts,access-control-readiness'`.

Resultados finales locales:

| Comprobación | Resultado |
| --- | --- |
| Lint global | 8/8 tareas aprobadas |
| Typecheck global | 11/11 tareas aprobadas |
| Build global | 8/8 tareas aprobadas; avisos de chunks >500 kB |
| OpenAPI/SDK | Regeneración oficial, generate:check aprobado, 179 rutas verificadas contra 203 operaciones |
| Unitarias API / Admin / Scanner | 370 / 216 / 62 aprobadas |
| Client | 403/403 aprobadas en 27 archivos sobre la versión final; incluye las 13 pruebas B01 y las 3 de seating de preparación |
| SDK | 129 unitarias y 9 pruebas Node del verificador aprobadas |
| UI / Floorplan / Landing | 6 / 100 / 60 aprobadas |
| API integración completa | 412/412 aprobadas antes de la proyección aditiva de Assistant |
| Integración Contactos + readiness tras la proyección | 57/57 aprobadas; incluye UUID por Contact, nombres repetidos, rechazo de Invitations internas y permisos negativos |
| E2E DT07 | 2/2 aprobados: NOMINAL y ANONYMOUS, SVG/PDF, activación Provider, cámara real con fuente virtual, aislamiento y ausencia de rutas Finance/Invitations legacy/generación Client |

La prueba de foco del login de Client falló transitoriamente en la primera suite global y pasó al
repetirse sin modificar autenticación. Los primeros arranques de workers también tuvieron timeouts;
se utilizó un worker por suite y pool threads para estabilizar ejecución local.

Flipbook: la suite completa terminó **73/74**, con fallo Chromium en
`mobile boundaries and every real page N=10` (`e2e/flipbook-mobile.spec.ts:266`, expected visible page 6,
received 1). Su repetición aislada pasó **1/1** sin cambios de código. El caso histórico WebKit
`e2e/flipbook-mobile.spec.ts:630` pasó en esta ejecución; el antecedente rojo de DT06A sigue documentado.
No se modificó Flipbook ni se declara CI/workflow global verde a partir de estos resultados locales.

`format:check` global sigue fallando por artefactos locales ignorados bajo `var/qa`, incluido
`var/qa/binding/baseline.css` con codificación no parseable. El formato de todos los archivos
modificados está aprobado; esos artefactos no se agregan al commit.

## Límites

DT08 conserva métricas/totales de operación. DT09 conserva certificación integral del piloto, dispositivos reales, carga, contingencia y release. Este ticket no crea dashboards, reportes adicionales, WhatsApp API, envío automático, offline, licencias, pagos, white-label ni capacidades nuevas de Self-Service.
