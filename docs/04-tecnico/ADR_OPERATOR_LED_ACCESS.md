# ADR — Acceso operativo del proveedor en el perfil operator-led

Estado: **Accepted — implementación requerida antes de piloto**  
Fecha: 2026-08-13

## Contexto

El modelo estándar de InvitacionesPremium separa Platform Admin de la operación cotidiana de los Eventos de clientes. El perfil de lanzamiento operator-led requiere que InvitacionesPremium pueda preparar técnicamente un Evento para una Planner/Organización sin convertir esa excepción operativa en impersonación, credenciales compartidas o bypass multi-tenant.

La UI por sí sola no resuelve autorización. Ocultar el builder a la Planner y mostrarlo a un usuario interno no es suficiente si los endpoints no tienen una política explícita.

## Decisión

“Operador del proveedor” será una **capacidad operativa de lanzamiento**, no un nuevo `AuthRole` persistido.

La operación del proveedor debe implementarse como una superficie administrativa explícita, con alcance por Evento, ownership verificable, actor real y auditoría. Puede materializarse mediante endpoints administrativos operativos dedicados o una capa equivalente que mantenga la separación de las rutas de cliente.

No se autoriza que Platform Admin opere mediante impersonación de Planner ni mediante una ampliación silenciosa de endpoints normales de cliente.

## Requisitos de autorización

Toda operación del proveedor deberá:

1. autenticar al usuario interno real;
2. requerir capacidad administrativa explícita;
3. identificar el `clientId` y `eventId` objetivo;
4. verificar que el Evento existe y pertenece al cliente objetivo;
5. limitar la mutación al conjunto de acciones operator-led autorizado;
6. registrar auditoría con el actor interno real;
7. respetar invariantes de estado, crédito, pricing y activación;
8. producir errores explícitos cuando el Evento no sea operable;
9. evitar cualquier bypass global reutilizable desde superficies de cliente.

## Capacidades iniciales permitidas

La primera implementación puede habilitar al proveedor, de forma explícita y auditada, para:

- crear/preparar un Evento para un cliente existente conforme al modelo vigente;
- modificar datos de configuración del Evento dentro de estados permitidos;
- cargar/configurar assets y diseño de Invitación;
- configurar acciones/hotspots;
- preparar configuración RSVP;
- crear y modificar geometría de Croquis V2;
- crear/configurar mesas y capacidades relacionadas con el Croquis;
- preparar accesos Staff bajo las reglas existentes;
- ejecutar la preparación/activación únicamente cuando los invariantes actuales lo permitan;
- realizar acciones de recuperación operativa que tengan contrato específico y auditoría.

La lista es de máximo alcance; la implementación debe preferir el mínimo necesario para el piloto.

## Capacidades excluidas

No se autoriza por este ADR:

- impersonar una cuenta Planner;
- compartir credenciales;
- editar respuestas RSVP fingiendo ser el invitado o la Planner;
- alterar check-ins sin una acción de recuperación explícita/auditada;
- bypass de saldo, créditos, promociones o pricing;
- mutar datos de otro tenant por conveniencia operativa;
- acceder masivamente a Eventos de clientes desde endpoints diseñados para Planner;
- introducir un rol `OPERATOR` o equivalente sin un ADR posterior;
- usar un secreto técnico o service account como sustituto del actor humano en auditoría.

## Relación con roles existentes

Los roles persistidos definidos en `docs/01-producto/03_ROLES_PERMISOS_ACCESO.md` permanecen vigentes.

- Planner continúa siendo el rol de operación del cliente.
- Platform Admin continúa sin convertirse en Planner.
- La capacidad provider-operated vive en una superficie administrativa explícita.
- Scanner/Hostess no reciben ningún privilegio nuevo por este ADR.

La matriz estándar de acceso describe endpoints normales del SaaS. La capacidad operator-led debe documentarse como una capacidad administrativa adicional, no como una deformación de esa matriz.

## Croquis V2

Se separan dos permisos conceptuales:

### Geometry / infrastructure

- mutación durante el lanzamiento: proveedor mediante la capacidad definida por este ADR;
- consumo por Planner: lectura;
- no implica modificar el modelo de datos de Floorplan.

### Seating assignment

- operación: Planner sobre geometría existente;
- utiliza el workspace actual y contratos actuales;
- continúa sujeto a capacidad, estado, concurrencia, realtime y auditoría existentes.

Esta separación es una frontera de producto y de autorización, no sólo una diferencia visual.

## Auditoría mínima

Para cada mutación operator-led debe poder reconstruirse:

- actor interno real;
- cliente;
- Evento;
- recurso afectado;
- acción;
- timestamp;
- before/after cuando aplique;
- `operationId` o correlación equivalente cuando exista;
- motivo/metadata adicional para overrides o recuperación excepcional cuando el contrato lo requiera.

## Consecuencias

### Positivas

- permite el modelo concierge sin romper aislamiento multi-tenant;
- evita introducir un rol prematuro;
- mantiene trazabilidad;
- deja abierta una migración futura hacia self-service;
- hace explícita la diferencia entre UI exposure y autorización.

### Costos

- requiere una superficie de acceso adicional antes del piloto;
- algunas operaciones existentes de Planner necesitarán un adapter/caso de uso administrativo en vez de reutilizar directamente el controller de cliente;
- obliga a mantener tests de autorización y auditoría para ambos caminos.

El costo es aceptable porque una operación interna implícita sería un riesgo de seguridad y deuda mayor.

## Criterios de aceptación para implementación

Antes de considerar resuelto este ADR:

- no existe impersonación;
- no existen credenciales compartidas;
- el operador interno puede preparar el Evento objetivo sin obtener acceso indiscriminado a otros tenants;
- las mutaciones relevantes quedan auditadas con el actor real;
- las reglas de negocio existentes siguen aplicándose;
- tests prueban happy path, cross-tenant denial, estado no permitido y auditoría;
- la Planner no obtiene mutación de geometría únicamente por conocer un endpoint interno;
- el builder y el Seating Workspace tienen políticas de acceso coherentes con `FLOORPLAN_STICKER_SEATING_CONTRACT.md`.

## Fuera de alcance

Este ADR no decide:

- la UI final del backoffice del proveedor;
- si en el futuro habrá un rol interno dedicado;
- si el producto terminará siendo self-service;
- cambios al esquema comercial;
- nuevas capacidades de soporte no requeridas por el piloto.