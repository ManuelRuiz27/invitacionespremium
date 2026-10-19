# M02-B01 — Accesos QR nominales y anónimos para salones

Estado: **REQUERIMIENTOS FUNCIONALES APROBADOS — DISEÑO TÉCNICO PENDIENTE — NO AUTORIZA CÓDIGO**  
Fecha de decisión funcional: **2026-10-19**  
Modelo operativo: **M02 — Salón/jardín como Organización (MANAGED)**  
Responsable funcional: Product  
Documentos de desarrollo: [handoff técnico](../05-implementacion/M02_B01_TECHNICAL_HANDOFF.md) · [DT00 audit completado](../05-implementacion/M02_B01_DT00_RUNTIME_AUDIT.md) · [DT01 ADR recomendado, pendiente de ratificación](../05-implementacion/M02_B01_DT01_ACCESS_ARCHITECTURE_ADR.md)

## 1. Objetivo y precedencia

Habilitar eventos de salones/jardines dedicados a control de acceso y acomodo, sin exigir diseño Flyer/Flipbook ni RSVP público. Una misma Organización podrá tener eventos nominales y eventos anónimos; **cada evento tendrá una sola modalidad** durante B01.

Este documento **aprueba qué debe hacer el producto**, no una solución de persistencia, API, ServiceCode, endpoint, precio ni ticket ejecutable. No sustituye los contratos técnicos actuales: estos describen el runtime existente hasta la aprobación e implementación de contratos especializados nuevos. No modifica el objetivo de lanzamiento activo **M01 Managed**.

Leer antes de diseñar o implementar: [M02 base](./06B_MODELO_02_SALON_JARDIN_ORGANIZACION.md), [modelos M01–M05](./06_MODELOS_OPERATIVOS_DE_VENTA.md), [matriz de gaps](./06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md), [dirección M01](../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md) y [handoff](../05-implementacion/M02_B01_TECHNICAL_HANDOFF.md).

## 2. Términos y límites del producto

- **Evento nominal:** una credencial QR por **asistente individual** con nombre registrado; puede existir grupo/familia como agrupador, pero B01 no autoriza compartir un solo QR entre varios asistentes.
- **Evento anónimo:** pases numerados, uno por entrada, sin identidad personal; mesa opcional según Croquis.
- **Acceso/credencial vigente:** derecho a ingresar al evento, sujeto a pertenencia, estado, cancelación, validez y uso previo; no implica que exista una entidad nueva llamada «Access».
- **Check-in nominal:** registro de entrada individual; **uso anónimo:** registro de consumo de un pase. No se deben mezclar historiales ni crear identidades ficticias para pases.
- **Sin invitación digital:** no se requiere experiencia visual Flyer/Flipbook ni enlace público RSVP. **No implica** decisión aprobada de eliminar la entidad interna Invitation: se resolverá en diseño técnico.
- **M02 MANAGED:** InvitacionesPremium prepara técnicamente; Admin de Organización supervisa; Planner asignado administra invitados, distribución y acomodo; Staff temporal valida en recepción. Mantener ownership y reglas Provider/Planner.

Fuera de B01: ambos tipos en un mismo evento, QR familiar/grupal compartido, envío WhatsApp automatizado, edición técnica del Croquis por el salón, modo offline, suscripciones/checkout/ledger, white-label, cambios a M01 y aforos mayores a los certificados.

## 3. Flujo funcional aprobado

1. Provider da de alta Organización y prepara Evento, producto y Croquis cuando aplique.
2. Durante preparación se elige **NOMINAL** o **ANÓNIMO**, de forma explícita por Evento.
3. **Nominal:** operador autorizado registra/importa nombres, organiza grupos opcionales y acomoda asistentes; sistema emite un QR por asistente sin paso RSVP.
4. **Anónimo:** operador autorizado genera pases únicos numerados por lote y opcionalmente asociados a Mesa; sin Contact/Invitation/Assistant artificial.
5. Operador autorizado obtiene materiales para entrega o impresión sin diseñar invitación.
6. Staff del propio Evento escanea, visualiza sólo datos mínimos y registra entrada/uso.
7. Operadores consultan totales y pendientes; los resultados nominales identifican personas y los anónimos sólo folios/agregados.

## 4. Requerimientos aprobados

### M02-B01-RF01 — Modalidad única por Evento (P0)

- Selección explícita NOMINAL / ANÓNIMO durante preparación; la Organización puede tener diferentes eventos de cada modalidad.
- Sólo se muestran herramientas compatibles con la modalidad seleccionada.
- Una vez emitidas credenciales vigentes, no hay cambio directo de modalidad. Eventual migración exige cancelación, reevaluación de aforo e historial auditable, bajo diseño técnico posterior.
- No inferir modalidad desde CommercialChannel, ClientOperatingProfile ni precio.

**Aceptación:** dos eventos de un mismo salón pueden operar modalidades diferentes sin mezclar tokens, permisos ni capacidad; el intento de cambio incompatible falla sin mutaciones parciales.

### M02-B01-RF02 — Invitados nominales, manual/CSV (P0)

- Captura mínima propuesta: nombre requerido, grupo/familia opcional, teléfono **opcional**, mesa cuando hay Croquis.
- Alta, consulta, corrección en estados permitidos e importación CSV con preview, errores por fila y commit idempotente.
- Distinción por identificador, no por nombre o teléfono; nombres repetidos no colisionan.
- No exigir RSVP ni pantalla pública de Invitación para registrar o emitir accesos.
- El agrupamiento no convierte los QR individuales en un QR compartido.

**Aceptación:** un listado con nombres duplicados y sin teléfonos se importa sin forzar valores falsos; queda asociado al Evento autorizado y respeta límites existentes hasta su revisión.

### M02-B01-RF03 — QR nominal por asistente (P0)

- Un QR individual emitible/obtenible para cada asistente nominal vigente, independiente de Flyer/Flipbook/RSVP.
- El QR debe ser opaco y firmado; su payload no contiene nombre, teléfono ni Mesa.
- Su validación sólo se habilita durante estados operativos autorizados; la credencial debe poder dejar de ser válida al cancelarse/revocarse conforme al diseño posterior.
- La emisión/reintento no duplica credenciales activas ni entradas.

**Aceptación:** el Staff identifica exactamente un asistente y no puede validar QR de otra persona/evento, ni registrar dos entradas activas.

### M02-B01-RF04 — Pases QR anónimos (P0)

- Reutilizar el contrato actual PHYSICAL_QR: folio único, SVG bajo demanda, lotes idempotentes, mesa opcional y un uso.
- No crear Contact, Invitation, Assistant o CheckIn nominales por cada pase.
- No cambiar numeración histórica ni mutar registros utilizados.

**Aceptación:** dos operadores concurrentes no sobrepasan capacidad ni generan folios duplicados; replay conserva resultado.

### M02-B01-RF05 — Acomodo y capacidades de Mesa (P0)

- NOMINAL: asignar asistente a Mesa activa, con las políticas de seating vigentes; **el soporte de SEAT exacto no se amplía ni modifica en B01**.
- ANÓNIMO: asignar pase a Mesa activa únicamente en modo TABLE; sin Croquis la Mesa es nula.
- La ocupación de Mesa y la capacidad de Evento se verifican transaccionalmente; no sobreasignar.

**Aceptación:** el sistema rechaza creación/asignación que exceda cupo incluso ante solicitudes concurrentes.

### M02-B01-RF06 — Validación nominal en Scanner (P0)

- Scan autorizado por Staff temporal y restringido al Evento.
- Mostrar nombre, Mesa y, cuando el contrato vigente lo permita, lugar mínimo, además de condición para ingreso.
- Registrar exactamente una entrada activa por asistente, con idempotencia, historial, permisos y auditoría.
- QR adulterado, revocado, usado o de otro Evento no genera ingreso.

**Aceptación:** dos lectores concurrentes que validan el mismo asistente no producen dos ingresos.

### M02-B01-RF07 — Validación anónima en Scanner (P0)

- Reutilizar flujo PHYSICAL_PASS: folio, Mesa opcional, estado UNUSED/USED, primer uso único e idempotencia.
- Staff no obtiene datos nominales ni tokens ajenos.

**Aceptación:** primer uso válido; segundo rechazo o replay idempotente según solicitud; no duplica auditoría.

### M02-B01-RF08 — Obtención y distribución de accesos (P0)

- Operador autorizado puede obtener y entregar QR individual nominal, o pases numerados anónimos, para uso impreso o digital.
- No se exige diseño de invitación ni integración con WhatsApp.
- Respetar confidencialidad de tokens, aislamiento por Organización/Evento y archivos efímeros o descarga segura.
- Preservar SVG y composición imprimible del pase físico existente.

**Aceptación:** el material descargado corresponde al asistente/folio correcto y no expone otras credenciales ni información innecesaria.

### M02-B01-RF09 — Capacidad y concurrencia (P0)

- La cantidad de credenciales vigentes y asignaciones debe respetar cupos autorizados y los límites comerciales/técnicos aplicables.
- Altas, asignaciones, emisión, revocación y scan compiten de forma segura; fallos hacen rollback completo.
- No confundir 150 **Contactos** actuales con capacidad total certificada: el dominio Event permite otros valores, mientras pricing/intake y load testing siguen limitando escenarios admitidos.

**Aceptación:** no hay sobreventa ni doble ingreso bajo carrera, retry y fallos parciales.

### M02-B01-RF10 — Cancelación/revocación antes de uso (P0)

- Operador autorizado puede invalidar credencial nominal o pase anónimo **sin uso**, conservando folio/identificador histórico, actor y motivo técnico/auditoría mínimos.
- No reciclar tokens ni borrar historial para reemitir.
- Credencial utilizada no se elimina/revierte por este requisito; un procedimiento de corrección posterior requiere diseño específico.

**Aceptación:** credencial cancelada no puede utilizarse, y reemisión autorizada no revive la anterior.

### M02-B01-RF11 — Consulta operativa básica (P0)

- Por Evento: emitidos/vigentes, ingresados/usados, pendientes y ocupación por Mesa cuando haya Croquis.
- NOMINAL: detalle autorizado por persona; ANÓNIMO: detalle por folio y datos agregados, sin PII ficticia.
- No confundir panel operativo con reporte PDF o BI avanzado.

**Aceptación:** totales conciliados con registros transaccionales; no sumar simultáneamente pases y contactos ficticios.

### M02-B01-RF12 — Roles, privacidad y auditoría (P0)

- Conservar PLATFORM_ADMIN, ORGANIZATION_ADMIN, ORGANIZATION_PLANNER y Staff temporal.
- Provider opera por superficies Admin explícitas, nunca impersonación.
- Admin Organización ve sus Eventos; Planner Organización sólo los asignados; Staff sólo su Evento y datos mínimos.
- Token inválido/ajeno no debe filtrar identidad, folio o existencia de recursos.
- Auditoría sin QR, teléfonos ni PII, con reglas de retención/anonimización vigentes hasta cambio contractual explícito.

**Aceptación:** pruebas negativas cross-tenant, cross-event y por rol; no exposición de secretos o PII en logs.

## 5. Invariantes y escenarios límite de producto

- **No mezcla por Evento** en B01; una Organización sí puede contratar ambos tipos.
- Nombres duplicados, teléfono ausente, CSV duplicado, asistentes con igual apellido, folios ya usados y ediciones concurrentes deben tener resultados deterministas.
- Un evento puede no tener Croquis; si existe y las reglas vigentes requieren asiento/Mesa, Scanner no puede ignorarlas.
- Reemitir no debe revivir credencial cancelada ni habilitar doble ingreso.
- Operación tardía (invitado agregado/cambiado el día del evento) es una decisión técnica/operativa pendiente: la API de Contactos hoy sólo permite mutar en estados de preparación.
- Una caída de red impide prometer operación offline: plan de contingencia operativa y certificación quedan pendientes.
- Evitar doble conteo entre pase anónimo y asistente nominal; toda métrica debe tener fuente autoritativa por modalidad.

## 6. Gaps confirmados en contratos/runtime; NO soluciones aprobadas

| Gap | Estado actual comprobado | Implicación |
|---|---|---|
| Identidad nominal | QR_CONTRACT emite **un QR por Invitation confirmada**; Scanner registra CheckIn por Assistant | Se necesita QR individual sin RSVP y selección no ambigua |
| Alta nominal | Contacts exige teléfono E.164 y aprovisiona Invitation + Assistant | Se necesita captura nominal sin teléfono, sin asumir nuevo modelo |
| Catálogo de producto | ServiceCode = FLIPBOOK/FLYER/PHYSICAL_QR/DEMO; VENUE pricing sólo PHYSICAL_QR | Decidir compatibilidad del modo nominal con Service/Pricing |
| Passe físico | PHYSICAL_QR es independiente de Contact/Invitation/CheckIn | Conservar aislamiento del pase anónimo |
| Cancelación anónima | PhysicalPassesController expone generate, list, SVG y scan, **no endpoint de revocación** | RF10 necesita contrato explícito y nueva capacidad |
| Acomodo detallado | PHYSICAL_QR admite sólo TABLE, no SEAT | Mantener límite; no extender sin decisión separada |
| Escala | Contacts admite 150 por Evento; Pricing V2 STANDARD/PARTNER 1–150; Staff 3 tokens activos | No vender escala superior sin validar cambios |
| UI/reportes | Reports backend existe; Client reports UI no está completa según 06F | RF11 requiere superficie ligera separada de PDF |
| Acceso de Organization Planner | Algunos contratos antiguos aún restringen «createdBy» frente a «assignedPlannerUserId» definido por M02 | Audit de políticas runtime obligatoria antes de tocar rutas |

Referencias de autoridad de comportamiento actual: [Contactos](../04-tecnico/CONTACTS_CONTRACT.md), [Invitaciones](../04-tecnico/INVITATIONS_CONTRACT.md), [QR nominal](../04-tecnico/QR_CONTRACT.md), [Pases físicos](../04-tecnico/PHYSICAL_PASSES_CONTRACT.md), [Scanner](../04-tecnico/SCANNER_CHECKIN_CONTRACT.md), [Croquis detallado](../04-tecnico/FLOORPLAN_DETAILED_SEATING_CONTRACT.md), [Staff](../04-tecnico/STAFF_ACCESS_CONTRACT.md), [Servicios/Pricing](../04-tecnico/SERVICES_PRICING_CONTRACT.md).

## 7. Decisiones abiertas antes de escribir código

**PRODUCT/TECH DECISION REQUIRED** en cada punto. Ninguno se resuelve implícitamente con este documento:

1. Representación del modo nominal por Evento y relación con ServiceCode/productos existentes; no usar CommercialChannel como flag de capability.
2. Identidad/credencial individual: adaptar los agregados Invitation/Assistant o diseñar referencia propia sin duplicar CheckIn ni emitir invitación digital pública.
3. Teléfono opcional: modelo, reglas SQL, CSV y aprovisionamiento sin romper el flujo actual con teléfono obligatorio.
4. Disponibilidad, recuperación, revocación y reemisión de QR nominal; efecto en entradas ya registradas y privacidad.
5. Revocación de pase físico no utilizado; historial, capacidades y idempotencia sin alterar inmutabilidad.
6. Alta/corrección de invitados durante ACTIVE o EVENT_DAY: permitirla con guardas específicas o excluirla formalmente de la primera versión.
7. Reglas de conteo, cancelación y sustitución de credenciales, y exportación compatible con aforos/mesas.
8. Superficie segura Provider/Client/Scanner y contratos OpenAPI; resolver divergencia «createdBy vs assignedPlanner».
9. Capacidad comercial por modalidad para VENUE, activación Managed y licenciamiento posterior; **sin fijar precios ni tocar Ledger**.
10. Volumen y certificación (Staff concurrente, CSV, Scanner real, seguridad, retención), y contingencia sin conexión.

## 8. Gate de salida para desarrollo

Para pasar a implementación: (a) aprobar el diseño técnico DT01 con decisiones 1–10 resueltas o acotadas; (b) actualizar contratos especializados afectados sin falsear el runtime; (c) definir tickets ejecutables, migraciones y pruebas por componente; (d) declarar explícitamente si M02 entra o no al alcance de la release, ya que el objetivo de lanzamiento documentado sigue siendo M01. **La aprobación funcional de B01 por sí sola no autoriza code.**
