# 05 — Modelo comercial, pricing y flujo operator-led

Estado: **Decisión de producto para piloto comercial**  
Fecha de decisión: **24 agosto 2026**  
Alcance: pricing de lanzamiento, canales B2B/B2B2C, reglas financieras asociadas y flujo operativo operator-led.  
Origen: alineación comercial Marketing/Admin → Product Manager del 24 agosto 2026.

## 1. Objetivo y precedencia

Este documento convierte las hipótesis comerciales de lanzamiento en reglas de producto explícitas sin iniciar todavía un rewrite financiero.

Para materias de **SKU, canal comercial, selección de precio, volumen venue, alcance de diseño, intake comercial y flujo operator-led**, este documento prevalece sobre secciones anteriores de:

- `02_PRD.md`;
- `04_OPERATOR_LED_MVP.md`;
- `docs/02-flujos-reglas/04_APP_FLOW.md`;
- `docs/02-flujos-reglas/05_REGLAS_NEGOCIO.md`;
- `docs/02-flujos-reglas/06_FINANZAS_CREDITOS_CONTABILIDAD.md`.

No modifica por sí mismo:

- roles persistidos;
- tenant isolation;
- estados de Evento;
- RSVP, QR, Seating, Staff, Scanner, check-in, Álbum o privacidad salvo lo indicado expresamente;
- ledger histórico ya registrado;
- balances o deuda existentes;
- la regla de no impersonación.

Los precios siguen siendo **hipótesis configurables de lanzamiento**. No deben hardcodearse en UI o dominio de forma irreversible.

## 2. Tesis comercial aprobada

InvitacionesPremium se vende como **servicio gestionado de logística digital de invitados**, no únicamente como software de invitaciones digitales.

El valor comercial puede combinar, según SKU:

- invitación digital;
- gestión de invitados;
- RSVP;
- Croquis/Mesas;
- QR;
- check-in;
- operación de acceso;
- reporte;
- experiencia postevento.

El perfil de lanzamiento continúa siendo **operator-led**:

- InvitacionesPremium configura infraestructura técnica;
- Planner/venue conserva decisiones sobre personas y operación;
- no se crea un rol persistido `Operator`;
- Provider/Admin usa capacidades administrativas explícitas y auditadas.

## 3. Regla fundamental: producto ≠ canal

Los productos/SKU y los canales comerciales son dimensiones distintas.

### SKU de lanzamiento

1. `QR / EventOps`
2. `Flyer`
3. `Flipbook`

### Canales comerciales

1. Planner / agencia — B2B2C.
2. Salón / jardín / venue — B2B recurrente.

`ClientType.PLANNER` y `ClientType.ORGANIZATION` continúan siendo conceptos de cuenta/autorización. **No deben seguir siendo la única dimensión para decidir el precio comercial.**

Una Organización puede ser agencia, venue u otro cliente y no debe recibir automáticamente un precio por el simple hecho de ser `ORGANIZATION`.

La implementación futura debe manejar el canal comercial como atributo separado del `ClientType`.

## 4. Alcance por SKU

### 4.1 QR / EventOps

Objetivo: operación digital de invitados/accesos con COGS bajo y alta repetibilidad.

Incluye en el perfil inicial:

- QR / control de acceso como capacidad core;
- check-in;
- Staff/Scanner conforme a permisos vigentes;
- Croquis/Mesas cuando aplique;
- operación de lista/pases conforme al flujo `PHYSICAL_QR` vigente;
- reporte operativo vigente.

No incluye en el perfil inicial:

- diseño gráfico personalizado por Evento;
- Flipbook/Flyer;
- Álbum;
- RSVP público basado en Invitación digital.

La referencia comercial **QR / EventOps** puede mostrarse en UX/ventas, pero el enum técnico `PHYSICAL_QR` no se renombra en este contrato. Cualquier ampliación futura de QR/EventOps para RSVP público requiere decisión y ticket separados.

Para venue se usa una plantilla operativa estándar. Si posteriormente existe branding reusable por venue, debe configurarse como activo/template reutilizable, no como diseño personalizado por Evento.

### 4.2 Flyer

Incluye:

- diseño personalizado de dos piezas principales;
- Invitation Design vigente;
- RSVP;
- gestión de invitados;
- Croquis/Mesas opcional;
- QR/check-in;
- Álbum hasta el límite vigente de 35 fotos.

### 4.3 Flipbook

Incluye:

- diseño personalizado de hasta 10 páginas;
- Invitation Design vigente;
- RSVP;
- gestión de invitados;
- Croquis/Mesas opcional;
- QR/check-in;
- Álbum hasta el límite vigente de 35 fotos.

### 4.4 Croquis no es diseño gráfico

Croquis/Mesas es una capacidad operativa de Evento y su costo debe medirse como tiempo operativo/servicio, no mezclarse con honorarios de diseñador de Flyer/Flipbook.

## 5. Alcance del diseñador

### Flyer

Base incluida:

- dos piezas principales;
- una propuesta inicial;
- hasta **dos rondas consolidadas de cambios**.

### Flipbook

Base incluida:

- hasta 10 páginas;
- una propuesta inicial;
- hasta **dos rondas consolidadas de cambios**.

Una ronda significa un paquete consolidado de observaciones del cliente/Planner. Mensajes separados que correspondan a la misma revisión no deben contarse artificialmente como rondas distintas.

Cambios posteriores a las rondas incluidas, cambio completo de concepto o retrabajo provocado por nueva información del cliente quedan fuera del alcance base y requieren cotización/add-on manual mientras no exista evidencia para formalizar un producto adicional.

QR/EventOps no incluye rondas de diseño personalizado por Evento.

## 6. Precio público por capacidad

La capacidad del Evento determina el bracket comercial:

- `1–50`;
- `51–100`;
- `101–150`.

Se conserva el límite MVP actual de 150.

### 6.1 Decisión sobre créditos

Se conserva durante el MVP:

- `1 crédito = $20 MXN`;
- créditos enteros;
- ledger y snapshots existentes;
- línea de crédito/deuda existentes.

Las hipótesis comerciales originales terminaban en `$...90`, incompatibles con créditos enteros de $20. Para evitar un cambio global de unidad y conservar el motor financiero existente, los precios de sistema se normalizan al múltiplo de $20 más cercano superior de $10.

No se debe mostrar un PVP de `$2,490` si el sistema realmente cobrará `$2,500`.

### 6.2 PVP sugerido normalizado

| SKU | Hasta 50 | Hasta 100 | Hasta 150 |
| --- | ---: | ---: | ---: |
| QR / EventOps | $2,500 / 125 cr | $3,000 / 150 cr | $3,500 / 175 cr |
| Flyer | $4,500 / 225 cr | $5,500 / 275 cr | $6,500 / 325 cr |
| Flipbook | $6,000 / 300 cr | $7,000 / 350 cr | $8,000 / 400 cr |

Estos importes son configurables y deben conservar vigencia temporal/snapshot.

## 7. Tarifa Planner / agencia

Planner/agencia compra a precio partner y puede revender al anfitrión.

Para Eventos de hasta 100 personas, hipótesis normalizada:

| SKU | PVP sugerido | Precio partner | Margen potencial partner |
| --- | ---: | ---: | ---: |
| QR / EventOps | $3,000 | $2,400 / 120 cr | $600 |
| Flyer | $5,500 | $4,300 / 215 cr | $1,200 |
| Flipbook | $7,000 | $5,500 / 275 cr | $1,500 |

Reglas:

- el PVP es sugerido, no obligatorio;
- InvitacionesPremium no controla el precio final de reventa del partner durante el piloto;
- el margen del partner no se registra como costo o descuento de InvitacionesPremium;
- partner pricing es **precio base de canal**, no `Promotion`;
- las tarifas partner para brackets 1–50 y 101–150 permanecen configurables/TBD hasta validación comercial; no deben inferirse automáticamente desde el PVP.

## 8. Tarifa venue por volumen

Venue usa prioritariamente QR/EventOps.

Hipótesis normalizada:

| Eventos efectivos / mes | Precio QR/EventOps por Evento |
| --- | ---: |
| 1–2 | $2,400 / 120 cr |
| 3–5 | $2,200 / 110 cr |
| 6–10 | $2,000 / 100 cr |
| 11+ | $1,800 / 90 cr |

### 8.1 Regla del tier

Durante piloto, el tier del mes `M` se calcula con **Eventos efectivamente cobrados del mes calendario anterior `M-1`** para ese venue.

- cuenta únicamente Evento no Demo con cargo comercial confirmado;
- un Evento con devolución comercial total no cuenta para volumen efectivo;
- no usar volumen declarado;
- no usar proyecciones verbales;
- no hay repricing retroactivo del mes anterior;
- no hay devolución automática al cruzar un threshold durante el mes;
- venue nuevo o sin historial inicia en tier `1–2`;
- cualquier compromiso contractual de volumen/override pertenece a una decisión comercial posterior y debe quedar explícito, no inferirse.

Esto permite medir recurrencia real sin crear deuda de descuentos retroactivos.

## 9. Selección de precio

El precio base de un Evento debe resolverse conceptualmente por:

`SKU + bracket de capacidad + canal comercial + tier de volumen (si venue) + vigencia temporal`.

Después puede aplicar una promoción elegible conforme a reglas de stacking.

### Jerarquía

1. identificar SKU;
2. determinar bracket con `Event.capacity`;
3. resolver canal comercial del Cliente;
4. si canal es venue y SKU es QR/EventOps, resolver tier vigente;
5. resolver price entry vigente;
6. aplicar promoción sólo si es elegible y stacking está autorizado;
7. conservar snapshot del resultado en el Evento/cargo.

### Regla de seguridad

`ClientType` no debe seleccionar por sí solo partner/venue pricing.

Un Cliente sin canal comercial explícito usa precio estándar/PVP hasta que Platform Admin lo clasifique.

## 10. Promociones

Canal, precio partner y tier venue **no son promociones**.

Las promociones continúan siendo incentivos temporales adicionales.

El orden conceptual es:

`precio base comercial → promoción autorizada → precio final`.

No aplicar automáticamente un “descuento Organization” adicional por pertenecer a `ClientType.ORGANIZATION`; esa lógica queda conceptualmente obsoleta con este modelo y debe adaptarse antes del lanzamiento comercial.

## 11. Regla financiera previa a preparación

El trabajo operator-led puede generar COGS antes de la activación técnica, especialmente en Flyer/Flipbook.

Por tanto, un Evento puede existir como borrador, pero **Provider no debe iniciar trabajo personalizado ni comprometer diseñador hasta que exista autorización comercial**.

Autorización comercial mínima durante piloto:

- cotización/precio de Evento conocido;
- Cliente acepta el SKU/bracket/tarifa;
- existe pago/prepago suficiente o línea de crédito aprobada conforme al proceso comercial;
- Platform Admin valida que el Evento puede entrar a preparación.

Esta autorización comercial es un **gate operativo**, no un nuevo `EventStatus` en este documento.

Mientras el motor siga cobrando al activar, el consumo real de créditos permanece en activación. Antes de desarrollar un mecanismo de reserva, el piloto debe operar con una política manual: no enviar trabajo a diseñador sin saldo/pago o crédito comercial autorizado.

### Price lock

Una vez aceptada la cotización y comenzada la preparación, el precio comercial debe quedar congelado para ese Evento.

El runtime actual sólo hace snapshot al activar. Esto es un **gap de implementación**: hasta que exista snapshot/reserva previa, Platform Admin no debe cambiar el precio aplicable a Eventos en preparación que ya fueron comercialmente aceptados.

## 12. Cambio de SKU antes de activar

La regla anterior “puede cambiarse libremente antes de activar sin costo” se restringe comercialmente.

### Antes de iniciar preparación personalizada

- se puede cambiar SKU;
- se recalcula cotización;
- no existe costo de retrabajo.

### Después de `design kickoff` / inicio de trabajo personalizado

- Flyer/Flipbook no se cambian como una acción gratuita;
- requiere revisión/re-cotización del Provider;
- el trabajo ya consumido debe medirse como COGS;
- no se promete devolución ni retrabajo gratuito.

La API puede conservar temporalmente capacidad técnica de cambio antes de activación, pero la superficie comercial/operator-led debe respetar este gate.

El upgrade post-activación Flyer → Flipbook existente se conserva, pero debe revisar su cálculo de diferencia contra el nuevo price book y cualquier costo de diseño antes de considerarse comercialmente definitivo.

## 13. Cancelación y retrabajo antes de activar

No se crea todavía una política automatizada de penalización.

Reglas de piloto:

- no existe reembolso monetario automático;
- una compra de créditos mantiene las reglas vigentes de saldo interno;
- si ya comenzó trabajo personalizado, la cancelación requiere revisión comercial manual;
- el sistema no debe prometer “cancelación sin costo” después del design kickoff;
- registrar costo/tiempo incurrido para decidir posteriormente si se necesita anticipo, fee de diseño o política de cancelación formal.

## 14. Flujo comercial y operativo actualizado

### Etapa A — Canal y cotización

1. Identificar Cliente y canal comercial.
2. Seleccionar SKU.
3. Capturar capacidad estimada/contratada.
4. Resolver bracket.
5. Resolver tarifa partner/venue/estándar.
6. Aplicar promoción si corresponde.
7. Presentar cotización/PVP según canal.
8. Obtener aceptación comercial.
9. Confirmar prepago/saldo o línea autorizada.

### Etapa B — Intake Provider

10. Provider/Admin crea el Evento para el `clientId` objetivo.
11. Se asigna Planner responsable cuando corresponda.
12. Se fija precio comercial del Evento.
13. Se solicitan materiales necesarios.
14. Flyer/Flipbook entra a design kickoff sólo después del gate financiero.
15. QR/EventOps omite diseño personalizado y usa plantilla operativa.

### Etapa C — Preparación técnica

16. Provider completa datos técnicos.
17. Provider prepara Invitación para Flyer/Flipbook.
18. Provider prepara infraestructura RSVP cuando aplica.
19. Provider construye Croquis/Mesas cuando aplica.
20. Planner carga/mantiene invitados en paralelo cuando el SKU lo permite.
21. Planner monitorea readiness de sus datos operativos.

### Etapa D — Preparación de personas

22. Planner distribuye enlaces sólo cuando el Evento esté activo.
23. Planner monitorea RSVP.
24. Planner asigna personas a Mesas ya construidas.
25. Planner corrige nombres/acompañantes conforme al contrato vigente.

### Etapa E — Activación

26. Revisión conjunta de readiness.
27. Resolver precio final desde el price snapshot comercial.
28. Consumir saldo/línea mediante ledger vigente.
29. Activar Evento.
30. Congelar infraestructura conforme a reglas vigentes.

### Etapa F — Operación

31. Planner distribuye Invitaciones digitales si aplica.
32. Planner crea y distribuye accesos Staff.
33. Staff opera Scanner/check-in.
34. Planner controla Seating y decisiones sobre personas.
35. Provider atiende incidencias técnicas sin impersonación.

### Etapa G — Cierre

36. Cerrar Evento.
37. Generar reporte.
38. Publicar Álbum si el SKU lo incluye.
39. Registrar costos/tiempos finales.
40. Revisar margen de contribución y repetibilidad.

## 15. Decisión sobre creación de Evento por Provider

El flujo comercial requiere que Provider pueda iniciar un Evento después del cierre de venta. Esto resuelve la decisión pendiente de `Operator intake`.

### Semántica aprobada

- `clientId` representa al Cliente/tenant propietario del Evento.
- `createdByUserId` representa **provenance del actor que creó el registro**, no ownership comercial.
- `PLATFORM_ADMIN` puede ser `createdByUserId` cuando crea el Evento desde una superficie Admin explícita.
- no se asigna silenciosamente como creador a una Planner que no ejecutó la acción.

### Asignación operativa

Para no usar `createdByUserId` como sustituto de ownership operativo, el dominio debe incorporar una asignación explícita de Planner para Eventos Provider-created.

Conceptualmente:

- `assignedPlannerUserId` nullable;
- Planner independiente: autoasignar al Planner del Cliente cuando exista uno único/compatible;
- Organización: Platform Admin u Organization Admin selecciona Planner responsable;
- Organization Admin continúa viendo Eventos de su Organización;
- Organization Planner ve/gestiona únicamente Eventos asignados conforme a la política que sustituya la dependencia actual de `createdByUserId`.

Esto requiere contrato técnico/migración antes de implementar #34. No se autoriza falsificar actor ni ampliar visibilidad de Organization Planner a todos los Eventos.

## 16. Decisión sobre accesos Staff

Durante el perfil operator-led, **la creación/distribución de Staff access pertenece a Planner/cliente**, porque depende de quién operará físicamente el Evento y es una decisión cotidiana de operación.

Provider:

- verifica que Scanner/Staff esté técnicamente disponible;
- puede apoyar en contingencia;
- no usa credenciales Planner ni crea Staff mediante bypass.

Planner:

- lista accesos;
- crea alias/token conforme al límite vigente;
- distribuye el link al personal;
- entiende que el secreto sólo se muestra una vez.

Esto alinea el producto con el Issue #35 existente.

## 17. Unit economics e instrumentación

Las métricas PILOT-02 existentes se conservan:

- minutos de preparación;
- minutos de Invitación;
- minutos de Croquis;
- soporte Planner;
- incidencias;
- cambios de último minuto;
- trabajo manual;
- invitados;
- Mesas.

Para validar el modelo comercial se requiere una extensión mínima de costos internos, sin convertir el ledger del Cliente en contabilidad de COGS.

Medir por Evento:

- `designerCostMxn` real;
- costo externo adicional específico del Evento;
- costo tecnológico marginal estimado cuando pueda determinarse;
- rondas de revisión de diseño;
- minutos de operador por área;
- minutos de soporte;
- trabajo manual repetitivo;
- SKU;
- canal comercial;
- bracket de capacidad;
- tier venue aplicado cuando corresponda;
- ingreso/cargo comercial final;
- devolución comercial si existió.

El costo sombra del fundador debe calcularse analíticamente como:

`horas operador × tarifa interna de referencia`

No se mezcla con movimientos del ledger del Cliente.

## 18. Unit economics de referencia

Las cifras originales siguen siendo hipótesis. Con la normalización a múltiplos de $20:

- QR venue 6–10: ingreso `$2,000`; costo externo hipótesis `~$400`; caja antes de fijos/impuestos `~$1,600`; margen caja `~80%`.
- Flyer partner hasta 100: ingreso `$4,300`; costo externo hipótesis `~$1,200`; caja `~$3,100`; margen caja `~72%`.
- Flipbook partner hasta 100: ingreso `$5,500`; costo externo hipótesis `~$2,000`; caja `~$3,500`; margen caja `~64%`.

No llamar a estos valores utilidad neta.

## 19. Decisiones no cerradas

Permanecen abiertas hasta evidencia real:

- precio partner para brackets 1–50 y 101–150;
- add-on/precio de rondas extra de diseño;
- anticipo o fee no recuperable de diseño;
- costo tecnológico marginal definitivo;
- tarifa interna/hora para costo sombra del fundador;
- contratos de volumen garantizado para venues;
- ampliación QR/EventOps a RSVP público;
- Mercado Pago;
- facturación CFDI automática.

Estas ausencias no bloquean el piloto si se operan manualmente y se instrumentan.

## 20. Reglas de implementación

Antes de modificar código financiero:

1. actualizar documentación de fuente de verdad;
2. auditar `ServicePrice`, `Promotion`, activación y snapshots actuales;
3. definir migración mínima de pricing por capacidad/canal;
4. resolver #34 con creator + assignment explícitos;
5. no reescribir Ledger/CreditLine/Payment/Receipt si pueden adaptarse;
6. preservar compatibilidad histórica de cargos existentes;
7. agregar pruebas de price selection, snapshots, tenant isolation y tier venue;
8. no hardcodear las tablas de precios en frontend.

Cualquier implementación que convierta `ClientType` en sinónimo permanente de canal comercial contradice este contrato.