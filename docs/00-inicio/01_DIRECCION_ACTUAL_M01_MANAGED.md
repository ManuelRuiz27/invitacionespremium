# DIRECCIÓN ACTUAL — MANAGED PROFILE LAUNCH / M01

Estado: **ACTIVE — FUENTE DE VERDAD DE ALCANCE PARA EL SIGUIENTE LANZAMIENTO**

## 1. Decisión

InvitacionesPremium fue concebido bajo un modelo operator-led / servicio gestionado. Aunque el repositorio y la documentación ya modelan M01–M05 y contienen capacidades compatibles con autoservicio, el siguiente objetivo de implementación y demostración será exclusivamente:

**M01 — Perfil Gestionado para Planner independiente.**

No se debe intentar implementar simultáneamente autoservicio, licencias, organizaciones complejas, pricing Partner, Venue o Enterprise.

## 2. Objetivo de esta fase

Construir una versión funcional, estable y demostrable para:

- reuniones comerciales;
- demostraciones presenciales;
- prospección en frío;
- primeras citas comerciales;
- primeros pilotos controlados.

Propuesta operativa:

**InvitacionesPremium prepara el Evento.  
El Planner administra invitados, confirmaciones, mesas y Staff.  
Staff opera el acceso el día del Evento.**

## 3. Modelo funcional

```text
PLATFORM ADMIN / INVITACIONESP​REMIUM
            │ prepara
            ▼
          EVENTO
            │ opera
            ▼
   INDEPENDENT_PLANNER
            │ habilita
            ▼
       STAFF TEMPORAL
```

No crear nuevos roles. Reutilizar:

- `PLATFORM_ADMIN`;
- `INDEPENDENT_PLANNER`;
- Staff mediante token.

M02–M05 quedan como referencia futura y no deben introducir comportamiento adicional durante esta fase.

## 4. Responsabilidades

### Platform Admin / Provider

Debe poder preparar el Evento antes de entregarlo al Planner, incluyendo según el producto:

- crear cliente y Evento;
- asignarlo al Planner;
- definir datos generales;
- seleccionar/configurar producto;
- preparar Flyer o Flipbook;
- administrar assets y hotspots;
- configurar experiencia pública;
- preparar Croquis;
- crear Mesas;
- revisar readiness;
- supervisar operación;
- resolver incidencias.

No debe impersonar al Planner.

### Planner

Debe concentrarse en:

- invitados y acompañantes;
- confirmaciones;
- distribución de invitaciones;
- organización de mesas;
- Staff;
- operación del Evento;
- actividad/resultados.

Invitación: puede visualizar, compartir, copiar enlaces y distribuir; no necesita diseñarla.

Croquis: puede visualizar, consultar mesas, asignar/mover invitados e identificar pendientes; no necesita construir geometría.

Staff: el Planner crea, distribuye y revoca accesos cuando corresponda.

## 5. Perfil operativo Managed

El runtime debe distinguir explícitamente:

```text
MANAGED
Provider prepara
Planner opera
```

frente a un futuro:

```text
SELF_SERVICE
Cliente prepara y opera
```

En esta fase sólo se certifica `MANAGED`.

No utilizar `CommercialChannel`, Partner, Venue, tarifa, pricing o créditos como mecanismo para decidir capacidades funcionales. El perfil operativo debe permanecer desacoplado de Finance/Commercial.

## 6. Qué debe ocultarse o bloquearse al Planner Managed

Revisar `apps/client` y evitar acceso ordinario a capacidades Provider/self-service como:

- creación/configuración técnica del producto;
- selección técnica de SKU;
- edición completa de Flyer/Flipbook;
- carga/sustitución estructural de assets;
- edición de hotspots;
- construcción del Croquis;
- creación/modificación estructural de Mesas;
- herramientas Provider;
- configuraciones técnicas.

No borrar destructivamente estas capacidades: se preservan para futuro `SELF_SERVICE`.

## 7. Finanzas y cobro

Managed Profile V1 no utilizará créditos, cobro ni flujo financiero desde la experiencia del cliente.

Durante esta fase:

- no checkout;
- no compra de créditos;
- no wallet visible;
- no saldo requerido para demostrar el producto;
- no suscripción;
- no pago automático;
- no tarifas Partner/Venue nuevas;
- no facturación nueva.

El cierre comercial será externo al producto durante reuniones y primeros pilotos.

**No eliminar ni reescribir Finance/Ledger/Pricing existente.** Preservar infraestructura y realizar sólo el desacoplamiento mínimo necesario para que Managed funcione sin simular compra.

Finance se revisará después en una fase `Commercial / Finance V3`.

## 8. Activación Managed

Auditar primero el contrato actual de activación.

Objetivo conceptual:

```text
PRODUCT READINESS
+
PLATFORM ADMIN AUTHORIZATION
=
EVENTO HABILITADO
```

sin obligar al operador a:

```text
crear pago ficticio
→ cargar créditos
→ consumir saldo
```

No eliminar seguridad, readiness, idempotencia ni auditoría.

Antes de fijar el contrato final revisar:

- `EVENT_ACTIVATION_CONTRACT.md`;
- `FINANCE_CONTRACT.md`;
- contratos operator-led;
- implementación real de `EventsService.activate`.

## 9. Recorrido de demo requerido

```text
Platform Admin
prepara Evento
      ↓
Planner
recibe Evento listo
      ↓
Invitado
abre Invitación
      ↓
RSVP
      ↓
Planner
ve confirmación
      ↓
Planner
asigna Mesa
      ↓
Planner
crea Staff
      ↓
Staff
abre Scanner
      ↓
escanea QR
      ↓
registra entrada
      ↓
Planner/Admin
observan operación
```

Todo contra runtime real. No mocks para cerrar el recorrido.

## 10. Demo reproducible

Mantener o preparar un fixture exclusivamente de desarrollo/demo usando el universo ficticio:

**Boda de Elena & Mateo**

Debe permitir demostrar Invitación, RSVP, invitados, acompañantes, mesas, Croquis, distribución, Staff, QR y check-in.

Debe ser idempotente, reproducible, sin datos personales reales y no accesible como endpoint productivo.

## 11. Prioridades técnicas

- `MG-01` — Managed Profile Foundation — P0.
- `MG-02` — Managed Client Experience — P0.
- `MG-03` — Managed Activation — P0.
- `MG-04` — Commercial Demo Fixture — P0.
- `MG-05` — Managed E2E / UAT — P0.
- `MG-06` — Reports Lite — P1.
- `MG-07` — Album Management — P1.

## 12. Fuera de alcance

No implementar durante esta fase:

- M02 completo;
- M03 autoservicio;
- M04 Enterprise;
- Partner pricing nuevo;
- Venue pricing nuevo;
- créditos nuevos;
- checkout;
- pagos;
- suscripciones;
- facturación;
- comisiones;
- reseller automation;
- white-label;
- marketplace;
- API WhatsApp;
- SMS;
- CRM;
- capacidad 2,000 como objetivo de lanzamiento;
- nuevos roles comerciales.

## 13. Primera tarea obligatoria

**No implementar todavía MG-01+**.

Primero entregar:

`MG00_MANAGED_PROFILE_IMPLEMENTATION_AUDIT`

Clasificar requisitos como:

- `EXISTS`;
- `ADAPT`;
- `MISSING`;
- `HIDE_FOR_MANAGED`;
- `FINANCE_COUPLED`;
- `OUT_OF_SCOPE`.

Para cada gap documentar comportamiento actual, objetivo, archivos, API, persistencia, seguridad/permisos, tests existentes/faltantes y riesgo de regresión sobre Self-Service futuro.

El audit debe terminar proponiendo tickets pequeños y ordenados MG-01…MG-07.

No modificar dominio, roles, Finance ni activación hasta que ese audit haya sido revisado y aprobado.

## 14. Criterio final

El lanzamiento debe permitir afirmar:

> **InvitacionesPremium ya puede preparar un Evento y entregárselo a un Planner para que gestione invitados, confirmaciones, mesas y accesos de principio a fin.**

Ese producto debe ser suficientemente estable y presentable para reuniones comerciales y prospección en frío.
