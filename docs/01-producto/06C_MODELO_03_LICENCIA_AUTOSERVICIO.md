# 06C — Modelo 03: Licencia / autoservicio para Organización

Estado: **APROBADO COMO MODELO DE REFERENCIA — NO AUTORIZA CODE**  
Modelo: M03  
Escenario: cliente Organización que licencia InvitacionesPremium y opera directamente la plataforma  
Objetivo: fijar cómo cambia el reparto operativo cuando InvitacionesPremium deja de preparar cada Evento por defecto.

## 1. Tesis del modelo

M03 representa un modelo distinto de M01 y M02.

En M01 y M02, InvitacionesPremium funciona como proveedor gestionado y prepara la parte técnica de cada Evento. En M03, el cliente adquiere el derecho de **operar la plataforma directamente** y asume la preparación cotidiana de sus propios Eventos.

La relación queda así:

> **InvitacionesPremium mantiene la plataforma, seguridad y soporte. La Organización configura y opera sus Eventos. El Admin de Organización administra la cuenta y supervisa todos los Eventos. Cada Planner configura y opera los Eventos que tiene asignados. El Staff temporal opera el acceso.**

M03 no es una instancia dedicada, white-label ni un despliegue separado. Es el mismo producto multi-tenant con mayor autoservicio para el cliente.

## 2. Diferencia principal respecto de M02

M02:

```text
InvitacionesPremium
        ↓ prepara cada Evento
Organización
        ↓ supervisa
Planner
        ↓ opera invitados/mesas
Staff
```

M03:

```text
InvitacionesPremium
        ↓ mantiene plataforma y da soporte
Organización
        ↓ administra y configura
Admin de Organización
        ↓ asigna/supervisa
Planner(s)
        ↓ preparan y operan Eventos asignados
Staff
```

La diferencia no es quién posee los datos ni quién paga. La diferencia es **quién realiza la preparación técnica del Evento**.

## 3. Actores

M03 reutiliza los actores ya existentes:

1. **Platform Admin / InvitacionesPremium** — propietario de la plataforma, soporte y gobierno global.
2. **Admin de Organización** — administrador de la cuenta licenciada.
3. **Planner de Organización** — persona que prepara y opera Eventos asignados.
4. **Staff temporal** — personal Event-scoped para recepción y acceso.
5. **Público por Invitación/Álbum** — invitado que consume su experiencia pública.

### Decisión

M03 **no requiere un nuevo rol persistido `LICENSE_ADMIN`, `VENUE_OWNER`, `SUPER_PLANNER` ni equivalente**.

La diferencia de M03 se modela mediante **superficies/capacidades de autoservicio habilitadas para roles existentes**, no creando identidades nuevas sólo por el modelo comercial.

## 4. Organización licenciada

La Organización continúa siendo el tenant propietario de:

- sus usuarios;
- sus Eventos;
- Invitaciones y Contactos;
- Croquis/Mesas;
- Staff Event-scoped;
- reportes y recursos asociados;
- finanzas de la cuenta conforme al contrato vigente.

M03 no cambia aislamiento de datos ni ownership.

La Organización sigue pudiendo representar, por ejemplo:

- salón;
- jardín;
- agencia;
- empresa de Eventos;
- operador profesional con varios Eventos y varias personas internas.

El modelo comercial concreto se resuelve fuera de este documento.

## 5. Platform Admin / InvitacionesPremium

### 5.1 Responsabilidad principal

Mantener un producto estable, seguro y soportado que el cliente pueda operar sin depender de InvitacionesPremium para preparar cada Evento.

### 5.2 Responsabilidades

InvitacionesPremium conserva:

- alta/provisionamiento de la Organización mientras no exista onboarding público aprobado;
- administración global de Clientes;
- seguridad, autenticación y autorización;
- mantenimiento del producto;
- soporte técnico;
- auditoría global donde corresponda;
- configuración global de servicios y reglas comerciales/financieras vigentes;
- gestión de incidencias que requieran una capacidad administrativa explícita;
- recuperación/soporte extraordinario conforme a contratos técnicos.

### 5.3 Lo que deja de hacer por defecto

En M03, InvitacionesPremium **no es responsable ordinario de preparar cada Evento**.

Por defecto no debe:

- cargar la lista de invitados;
- configurar cada Invitación;
- construir cada Croquis;
- crear las Mesas de cada Evento;
- asignar personas a Mesas;
- crear Staff del Evento;
- distribuir Invitaciones;
- operar recepción.

Puede ofrecer asistencia o servicios adicionales en un acuerdo comercial separado, pero esa asistencia no redefine el modelo base M03.

### 5.4 Límites

Platform Admin no impersona al cliente ni utiliza endpoints Client-owned como si fuera usuario de la Organización.

El soporte que requiera modificar datos del Evento debe existir como acción administrativa explícita, acotada y auditable.

## 6. Admin de Organización

### 6.1 Qué representa

Es la persona responsable de administrar la licencia/cuenta dentro de la Organización.

Puede corresponder a propietario, gerente, coordinador general o responsable autorizado. El puesto comercial no cambia el rol técnico.

### 6.2 Responsabilidad principal

> **Administrar la cuenta, personas internas y cartera de Eventos, con capacidad suficiente para supervisar o intervenir en la preparación cuando sea necesario.**

### 6.3 Debe poder administrar

Dentro de su Organización y conforme a contratos vigentes/futuros aprobados:

- datos de la Organización;
- usuarios Planner internos;
- todos los Eventos del tenant;
- creación de nuevos Eventos;
- asignación/reasignación de Planner responsable;
- estado y readiness de cada Evento;
- Invitaciones/Confirmaciones cuando intervenga;
- Croquis/Mesas cuando la superficie self-service esté habilitada;
- Staff por Evento;
- reportes operativos;
- finanzas propias de la Organización.

### 6.4 Supervisión

Su vista principal debe responder:

> **qué Eventos tenemos → quién es responsable → qué falta preparar → qué requiere atención → cómo terminó.**

M03 no obliga al Admin a configurar personalmente cada Evento. Puede delegar a Planner(s).

## 7. Planner de Organización

### 7.1 Cambio respecto de M02

En M02, el Planner consume una infraestructura técnica preparada por InvitacionesPremium.

En M03, el Planner asignado pasa a ser responsable de **preparar y operar** su Evento dentro de las herramientas de autoservicio habilitadas.

### 7.2 Ownership

Conserva la regla:

> **Sólo opera Eventos de su Organización asignados a su `userId`.**

`createdByUserId` conserva provenance y no determina el ownership operativo.

### 7.3 Debe poder preparar, sobre Eventos asignados

Cuando el producto/servicio lo requiera y exista superficie autorizada:

- completar datos del Evento;
- cargar/configurar material de Invitación;
- configurar acciones de Invitación dentro de los contratos vigentes;
- configurar Confirmaciones cuando el producto las incluya;
- construir o ajustar Croquis mediante el builder habilitado;
- definir Mesas, capacidades, zonas y geometría;
- validar readiness funcional;
- cargar/mantener invitados;
- organizar personas en Mesas;
- crear/distribuir accesos Staff.

### 7.4 Debe poder operar

- distribución de Invitaciones;
- seguimiento de Confirmaciones;
- acompañantes;
- seating;
- Staff;
- lifecycle permitido;
- reportes;
- Álbum cuando el producto lo permita.

### 7.5 No puede

- acceder a Eventos no asignados;
- administrar usuarios de la Organización;
- modificar pricing, reglas financieras o contratos globales;
- ver finanzas globales salvo decisión explícita posterior;
- alterar audit/provenance;
- saltarse readiness o permisos porque el cliente tenga licencia.

## 8. Croquis en M03

Éste es uno de los cambios funcionales más importantes respecto del perfil operator-led.

M03 necesita que el cliente pueda preparar el Croquis sin depender del proveedor.

Por tanto, como modelo objetivo:

- Admin de Organización puede acceder al builder donde corresponda;
- Planner asignado puede acceder al builder de su Evento;
- el builder debe respetar los mismos contratos de geometría, capacidad y seating;
- Staff continúa en lectura operativa durante el Evento;
- el Público no recibe acceso al builder.

### Importante

Este documento **no autoriza por sí solo exponer hoy el builder a Planner**. Sólo establece que el autoservicio completo no puede considerarse implementado mientras esa capacidad siga reservada al proveedor.

La habilitación futura requiere gap analysis, contratos de acceso actualizados y ticket técnico explícito.

## 9. Invitación y diseño en M03

M03 requiere autoservicio suficiente para configurar los productos contratados.

Cuando el Evento use Invitación Digital o Invitación Premium, la Organización debe poder:

- aportar/cargar material gráfico;
- ordenar/configurar las piezas permitidas;
- configurar acciones/hotspots conforme al contrato;
- revisar la experiencia pública;
- completar la preparación sin intervención obligatoria de InvitacionesPremium.

M03 no obliga a incluir un diseñador gráfico dentro del software.

La Organización puede producir su propio material o contratar diseño como servicio separado. Esa decisión es comercial y no cambia las capacidades base del Evento.

## 10. Confirmaciones, invitados y Mesas

No cambian conceptualmente respecto de M01/M02.

La Organización/Planner sigue siendo responsable de:

- lista de invitados;
- grupos/familias nominales;
- acompañantes permitidos;
- distribución de Invitaciones;
- monitoreo de Confirmaciones;
- asignación/movimiento/desasignación de personas entre Mesas;
- cierre/reapertura de Confirmaciones donde el contrato lo permita.

El autoservicio cambia quién configura la infraestructura, no las reglas de RSVP o seating.

## 11. Staff temporal

No cambia de naturaleza.

- sigue siendo Event-scoped;
- no es usuario permanente;
- Planner/Admin de Organización lo habilita para el Evento;
- opera Scanner/check-in;
- no ve finanzas ni otros Eventos;
- los límites, expiración y seguridad del token siguen sus contratos especializados.

M03 no autoriza un rol permanente de hostess/recepción.

## 12. Público por Invitación/Álbum

No cambia.

El invitado sólo consume su experiencia pública mediante tokens válidos y conforme al producto contratado.

El hecho de que el Evento sea autoservicio no modifica sus permisos.

## 13. Matriz de responsabilidades M03

| Actividad | InvitacionesPremium | Admin Organización | Planner asignado | Staff |
|---|---:|---:|---:|---:|
| Mantener plataforma/seguridad | Responsable | — | — | — |
| Alta/provisión de Organización | Responsable mientras no exista onboarding aprobado | Aporta información | — | — |
| Crear Evento | Soporte global | Responsable/puede delegar | Puede crear/operar conforme a ownership | — |
| Asignar Planner | Soporte excepcional/Admin explícito | Responsable | — | — |
| Configurar Invitación | Soporte | Puede intervenir | Responsable operativo | — |
| Configurar Confirmaciones | Soporte | Puede intervenir | Responsable operativo | — |
| Construir Croquis | Soporte | Puede intervenir | Responsable operativo | — |
| Crear Mesas/capacidades/zonas | Soporte | Puede intervenir | Responsable operativo | — |
| Mantener invitados | Soporte | Puede intervenir | Responsable | — |
| Distribuir Invitaciones | — | Puede intervenir | Responsable | — |
| Organizar Mesas | Soporte | Puede intervenir | Responsable | — |
| Crear/distribuir Staff | Infraestructura/soporte | Puede intervenir | Responsable | — |
| Escanear/registrar entrada | Soporte | Usa Staff si participa | Usa Staff si participa | Responsable operativo |
| Reportes | Soporte global | Todos los Eventos del tenant | Eventos asignados | — |
| Finanzas de Organización | Administración global conforme a contrato | Responsable | — | — |

La matriz expresa el reparto operativo objetivo. Cada permiso concreto debe implementarse mediante contrato y policy explícitos.

## 14. Flujo operativo M03

```text
1. InvitacionesPremium provisiona la Organización licenciada
        ↓
2. Admin de Organización administra sus Planner internos
        ↓
3. La Organización crea un Evento
        ↓
4. Admin asigna una Planner responsable
        ↓
5. Planner completa datos y configura el producto contratado
        ↓
6. Planner prepara Invitación/Confirmaciones cuando aplican
        ↓
7. Planner construye Croquis/Mesas cuando aplican
        ↓
8. Planner carga y mantiene invitados
        ↓
9. Planner distribuye Invitaciones
        ↓
10. Invitados confirman cuando corresponde
        ↓
11. Planner organiza Mesas y valida que el Evento esté listo
        ↓
12. Planner/Admin habilita Staff
        ↓
13. Staff opera recepción y check-in
        ↓
14. Planner/Admin consultan reportes y Álbum cuando aplica
        ↓
15. InvitacionesPremium interviene sólo ante soporte/incidencia o capacidad Admin explícita
```

## 15. Superficies esperadas

### Platform Admin

Debe priorizar:

- Clientes/Organizaciones;
- salud y soporte de cuentas;
- Eventos globales para supervisión;
- incidencias;
- auditoría;
- reglas globales;
- finanzas/comercial según contrato.

No necesita una cola de preparación manual de cada Evento como centro del modelo M03.

### Admin de Organización

Debe priorizar:

- cartera de Eventos;
- usuarios Planner;
- asignaciones;
- readiness/pendientes;
- supervisión global;
- reportes;
- finanzas de la Organización.

### Planner de Organización

Debe priorizar:

- Mis Eventos asignados;
- preparación/configuración;
- Invitación;
- Confirmaciones;
- invitados;
- Croquis/Mesas;
- Staff;
- reportes;
- Álbum cuando aplique.

### Staff

Mantiene una superficie mínima de acceso al Evento asociado.

## 16. Qué M03 NO significa

M03 no implica automáticamente:

- infraestructura dedicada;
- base de datos separada por cliente;
- dominio personalizado;
- white-label;
- branding completo del cliente;
- eliminación de InvitacionesPremium de la experiencia;
- API privada para integraciones;
- SSO enterprise;
- SLA enterprise;
- usuarios ilimitados;
- Eventos ilimitados;
- suscripción mensual/anual;
- tarifa plana;
- checkout automático;
- registro público de Organización;
- una nueva jerarquía de roles.

Esos puntos pertenecen a la capa comercial o a M04 si implican una instalación/servicio dedicado.

## 17. Relación con pricing y finanzas

"Licencia" describe aquí el **modelo operativo de autoservicio**, no una fórmula financiera.

M03 puede venderse posteriormente mediante:

- mensualidad;
- anualidad;
- bolsa de Eventos;
- créditos;
- precio por Evento;
- mínimo de consumo;
- contrato negociado.

Este documento no aprueba ninguna de esas fórmulas.

Hasta que exista una decisión financiera posterior, el runtime vigente de pricing/activación permanece como está.

## 18. Relación con servicio gestionado

M02 y M03 pueden coexistir comercialmente sin duplicar producto:

- **M02:** el cliente compra el resultado y InvitacionesPremium prepara la parte técnica;
- **M03:** el cliente compra acceso operativo suficiente para preparar sus propios Eventos.

Una Organización podría migrar de M02 a M03 conforme madure su capacidad operativa, pero esa transición futura debe preservar datos, roles y ownership.

No se requiere crear un tenant nuevo sólo por cambiar de modelo operativo.

## 19. Implicaciones funcionales esperadas

Antes de considerar M03 implementable debe evaluarse, como mínimo:

1. autoservicio completo de creación/preparación de Evento;
2. exposición segura del builder de Croquis a roles de Organización;
3. configuración de Invitación sin intervención Provider obligatoria;
4. readiness y mensajes de error comprensibles para usuario no técnico;
5. asignación/reasignación de Planner desde la Organización;
6. onboarding operativo suficiente;
7. guardrails para evitar configuraciones inválidas;
8. auditoría y soporte sin impersonation;
9. UX para que Admin supervise sin ejecutar todas las tareas;
10. QA de aislamiento entre Planner de la misma Organización.

Esta lista es una guía para el futuro gap analysis y no un ticket de implementación.

## 20. Invariantes

M03 no modifica por sí mismo:

- EventStatus;
- ServiceCode;
- reglas RSVP;
- reglas QR/check-in;
- límites Staff;
- ownership del tenant;
- `assignedPlannerUserId` como responsabilidad operativa;
- separación creator vs assigned Planner;
- ledger o momento del cargo;
- reglas comerciales vigentes;
- seguridad entre Organizaciones.

## 21. Criterio para pasar a código

Antes de implementar M03 se debe ejecutar gap analysis contra el runtime y clasificar cada capacidad como:

- `EXISTS`;
- `ADAPT`;
- `MISSING`;
- `DOC-ONLY`;
- `OUT-OF-SCOPE`.

Los cambios que amplíen permisos de `ORGANIZATION_ADMIN` o `ORGANIZATION_PLANNER`, especialmente Builder/Croquis y configuración avanzada, requieren actualización explícita de:

- `03_ROLES_PERMISOS_ACCESO.md`;
- `ACCESS_MATRIX.md`;
- contratos especializados afectados;
- pruebas de authorization/tenant isolation.

M03 aprobado como modelo no equivale a M03 autorizado para implementación.

## 22. Próximo modelo

El siguiente modelo a definir es M04: **instancia/servicio dedicado para cliente de gran escala**.

M04 debe responder, entre otros puntos:

- qué problema de escala o aislamiento justifica una instancia dedicada;
- si realmente requiere infraestructura separada o sólo límites/configuración distintos;
- cómo se administran Eventos de 1,000–2,000+ invitados;
- qué roles reutiliza;
- qué soporte/SLA operativo cambia;
- qué capacidades de importación, performance y operación requieren adaptación;
- qué elementos son producto y cuáles son condiciones enterprise/comerciales.
