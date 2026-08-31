# PILOT-03 — UAT comercial de Evento pagado

Estado: contrato de ejecución para `#39 PILOT-03`.

## Objetivo

Certificar que InvitacionesPremium puede recorrer un piloto comercial desde adquisición hasta operación y medición económica sin workarounds P0/P1.

Este UAT no declara PMF ni recurrencia. Certifica que el producto puede adquirir, cotizar, autorizar, preparar, operar, cerrar y medir un Evento pagado con evidencia reproducible.

## Fuentes obligatorias

- `docs/01-producto/04_OPERATOR_LED_MVP.md`
- `docs/01-producto/05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`
- `docs/01-producto/05A_PRICING_RESOLUTION_CLARIFICATION.md`
- `docs/01-producto/05B_LANDING_COMMERCIAL_SALES_CONTRACT.md`
- `docs/02-flujos-reglas/06_FINANZAS_CREDITOS_CONTABILIDAD.md`
- `docs/04-tecnico/SERVICES_PRICING_CONTRACT.md`
- `docs/04-tecnico/EVENT_ACTIVATION_CONTRACT.md`
- `docs/04-tecnico/STAFF_ACCESS_CONTRACT.md`
- `docs/05-implementacion/LAND02_B2B_COMMERCIAL_INTAKE.md`
- este documento.

## 1. Gate cero — baseline QA

PILOT-03 no puede declararse COMPLETED con CI rojo conocido.

Antes del recorrido comercial se deben corregir exclusivamente:

### 1.1 Prettier baseline

Formatear los cinco archivos que han mantenido CI rojo:

- `apps/client/src/wizard/floorplan/PhysicalQrTablesStep.tsx`
- `apps/client/src/wizard/physical-passes/physical-passes-pdf.ts`
- `apps/client/src/wizard/physical-passes/PhysicalPassesStep.tsx`
- `apps/client/src/wizard/WizardPage.tsx`
- `apps/landing/src/components/primitives/LandingEyebrow.tsx`

No cambiar comportamiento durante este cleanup.

### 1.2 Event lifecycle tests obsoletos

`apps/api/test/event-lifecycle.integration-spec.ts` debe adaptarse a contratos ya aprobados:

- cualquier fixture que active un Evento pagado debe tener autorización comercial/price lock válido antes de `activate`;
- cualquier fixture creado para `ORGANIZATION_PLANNER` debe persistir `assignedPlannerUserId` si espera acceso operativo de esa Planner;
- `createdByUserId` no vuelve a representar ownership operativo.

No modificar producción para satisfacer expectativas históricas incorrectas.

### 1.3 Gate requerido

Después del cleanup:

- `pnpm format:check` PASS;
- `pnpm lint` PASS;
- `pnpm typecheck` PASS;
- `pnpm test` PASS sin fallos deterministas;
- `pnpm build` PASS;
- Prisma validate/migrations PASS;
- OpenAPI/API client drift PASS;
- CI remoto sobre `main` GREEN.

Los timeouts de workers deben distinguirse de fallos deterministas, pero PILOT-03 exige al menos una ejecución completa reproducible sin esconder un fallo funcional.

## 2. Escenario A — Planner/agencia Partner + Flyer

### 2.1 Adquisición

Desde Landing:

1. abrir canal Planner/agencia;
2. usar CTA comercial Partner;
3. enviar `CommercialLead` tipo `PLANNER_AGENCY`;
4. verificar success sin creación automática de Client/User/Event;
5. en Admin → Oportunidades verificar el lead read-only.

En paralelo, `Crear cuenta de Planner` debe seguir siendo un flujo distinto.

### 2.2 Clasificación comercial

Usar un Client Planner real de prueba.

Platform Admin:

1. abre Cliente;
2. fija canal comercial `PARTNER`;
3. `ClientType` permanece sin cambios;
4. auditar cambio.

Registro de Planner no concede Partner automáticamente.

### 2.3 Cotización e intake

Crear Evento desde Admin con:

- SKU `FLYER`;
- capacidad `80`;
- Planner asignada válida;
- tarifa Partner explícita `1–100`;
- precio esperado de configuración vigente: `215 créditos / $4,300 MXN`.

El UAT debe demostrar:

- preview autoritativo;
- `acceptedServicePriceId` coincide con price lock;
- creator = Platform Admin real;
- assigned planner separado;
- 0 Ledger/Receipt en autorización/intake;
- suficiente cobertura comercial antes de crear.

Si hace falta saldo para el piloto, Platform Admin usa las operaciones financieras existentes; no se inserta Ledger manualmente desde UI o script de UAT.

### 2.4 Preparación Provider

Admin:

1. completa Datos;
2. confirma autorización comercial;
3. inicia Design Kickoff;
4. prepara Flyer con dos piezas;
5. configura hotspots contractuales;
6. prepara Croquis/Mesas si se activa;
7. registra tiempo/costos/rondas en Registro operativo.

No usar Planner para preparar diseño técnico.

### 2.5 Operación Planner

Planner asignada:

1. importa/carga invitados;
2. monitorea RSVP;
3. asigna Seating sobre croquis Provider;
4. activa Evento usando el price lock;
5. verifica cargo exacto de `215` créditos;
6. crea Staff desde UI Planner;
7. copia/abre Scanner URL desde el secreto recién creado.

No usar endpoints manuales para Staff.

### 2.6 Invitado / check-in / cierre

- confirmar al menos invitados suficientes para Seating;
- obtener QR;
- escanear/check-in con Staff;
- cerrar Evento;
- generar reporte;
- probar Álbum cuando corresponda al Flyer.

### 2.7 Unit economics

Registrar al menos:

- 1 costo diseñador;
- 1 costo externo o tecnología (puede ser 0 agregado por ausencia si no existe costo real);
- 2 rondas de diseño;
- tiempo de Invitación;
- tiempo de Croquis si aplica;
- soporte Planner;
- trabajo manual si existió.

Verificar:

- revenue comercial = cargo del Evento;
- costos no escriben Ledger;
- margin = revenue neto - costos directos;
- costo sombra sólo aparece si configuración explícita existe;
- copy dice margen de contribución, no utilidad neta.

## 3. Escenario B — Venue + QR/EventOps

### 3.1 Adquisición

Desde Landing:

1. entrar a sección Venue;
2. `Solicitar propuesta para mi venue`;
3. enviar lead `VENUE`;
4. verificar que no abre registro Planner y no crea Organization automáticamente;
5. verificar lead en Admin.

### 3.2 Client Venue

Platform Admin usa/crea el Client Organization de prueba mediante superficies existentes y fija:

`commercialChannel = VENUE`.

Organization no equivale automáticamente a Venue.

### 3.3 Volumen efectivo

El UAT debe demostrar el resolver Venue sobre historial real de M-1.

La prueba automatizada debe cubrir al menos tier `3–5` usando tres Eventos M-1 válidos:

- mismo Client;
- no DEMO;
- comercialmente cobrados;
- no totalmente reembolsados.

Esperado para el siguiente mes:

- `PHYSICAL_QR`;
- tier `THREE_TO_FIVE`;
- `110 créditos / $2,200 MXN` con el price book vigente de piloto.

No crear una matriz Venue × capacidad.

Para recorrido manual se permite usar un fixture de UAT reproducible que construya exclusivamente historia previa de prueba. Ese fixture no debe modificar lógica productiva ni insertar snapshots inválidos.

### 3.4 Intake y operación

Admin:

- crea Evento `PHYSICAL_QR`;
- price lock = tarifa Venue resuelta;
- asigna Planner de Organización o deja sin asignar y asigna después;
- completa datos/croquis según operación.

QR/EventOps:

- no Design Kickoff;
- no RSVP público digital;
- no Álbum;
- sí control de acceso, Staff/Scanner, mesas cuando aplique y reporte.

Organization Planner asignada debe poder operar sólo ese Evento; Organization Admin mantiene visibilidad organizacional.

### 3.5 Costos

Costo de diseñador esperado: `0` salvo que exista costo real ajeno al producto.

Registrar tiempo operativo real y cualquier costo tecnológico/externo real.

Verificar contribution margin del Evento.

## 4. Evidencia obligatoria

PILOT-03 debe producir evidencia versionada o en comentario de issue de:

- SHA ejecutado;
- CI verde;
- versiones/URLs locales utilizadas;
- IDs de Client/Event de fixtures no sensibles;
- canal, SKU, capacidad y price lock;
- Ledger movements de activación y ausencia de cargo previo;
- actor creator y Planner assignment;
- Staff creado por UI;
- resultado check-in;
- reporte/cierre;
- unit economics por escenario;
- incidencias y soporte registrados;
- lista de cualquier workaround residual.

Un workaround P0/P1 residual bloquea el cierre.

## 5. Automated UAT

Crear pruebas E2E/integration sólo cuando agreguen evidencia que no esté cubierta por suites unitarias existentes.

Preferencia:

- reutilizar integration tests de Pricing/Activation/Staff/Commercial Leads/Unit Economics;
- agregar una suite `commercial-pilot.integration-spec.ts` para enlazar el journey de dominio si la cobertura actual está fragmentada;
- no probar detalles visuales de MUI desde backend.

La suite comercial debe probar al menos:

1. Partner Flyer 80 → 215 créditos;
2. lock no cambia por actualización posterior del Price Book;
3. activation cobra 215 una sola vez;
4. assigned Planner opera y otra Planner no;
5. Staff creation max/secret semantics siguen vigentes;
6. Venue con 3 Eventos válidos M-1 → tier 3–5 → 110 créditos;
7. full-refund M-1, si existe fixture financiero válido, no cuenta volumen;
8. QR Venue no requiere design kickoff;
9. costos de piloto no alteran Ledger;
10. unit economics calcula margen sobre snapshots/ledger/journal.

## 6. Fuera de alcance

- Mercado Pago;
- CFDI;
- WhatsApp API;
- CRM;
- BI cross-client;
- marketplace;
- nuevos roles;
- RSVP público para QR/EventOps;
- automatización de honorarios/add-ons;
- declaración de PMF.

## 7. DoD

PILOT-03 se considera completado únicamente cuando:

1. baseline QA y CI están verdes;
2. los dos escenarios comerciales tienen evidencia reproducible;
3. no existe workaround P0/P1;
4. price lock, actor/tenant y Ledger permanecen coherentes;
5. Staff/Scanner son operables desde superficies reales;
6. unit economics produce margen de contribución auditable;
7. cualquier incidencia remanente está clasificada como deuda posterior y no impide operar el piloto.
