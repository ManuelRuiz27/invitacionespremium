# 06B — Modelo 02: Salón/jardín como Organización

Estado: **APROBADO COMO EXTENSIÓN DE M01**  
Modelo: M02  
Escenario: salón/jardín que integra InvitacionesPremium como servicio gestionado para múltiples Eventos  
Objetivo: fijar actores, responsabilidades, ownership y superficies antes de convertir cualquier gap en código.

## 1. Tesis del modelo

M02 extiende M01 para un cliente que no es una sola Planner independiente, sino un **salón, jardín o negocio de Eventos que administra varios Eventos y puede tener varias personas responsables de operarlos**.

InvitacionesPremium continúa funcionando como proveedor gestionado:

> **InvitacionesPremium prepara la parte técnica. El salón administra su operación y distribuye la responsabilidad de sus Eventos. Cada Planner opera únicamente los Eventos que le fueron asignados. El Staff temporal controla el acceso el día del Evento.**

M02 no es todavía una licencia SaaS de autoservicio total. La preparación técnica avanzada continúa en InvitacionesPremium conforme al perfil operator-led.

## 2. Qué cambia respecto de M01

M01 tiene una relación simple:

```text
InvitacionesPremium
        ↓
Planner independiente
        ↓
Evento
        ↓
Staff
```

M02 introduce una capa organizacional:

```text
InvitacionesPremium
        ↓
Salón / Jardín (Organización)
        ↓
Admin de Organización
        ↓
Planner(s) de Organización
        ↓
Evento(s) asignados
        ↓
Staff temporal por Evento
```

La capacidad funcional del Evento no cambia por pertenecer a un salón. Invitaciones, Confirmaciones, Mesas, Croquis, QR, check-in, reportes y Álbum siguen regidos por el producto contratado y sus contratos especializados.

## 3. Actores

M02 utiliza actores ya existentes:

1. **Platform Admin / InvitacionesPremium** — propietario y operador del servicio.
2. **Admin de Organización** — propietario, gerente o responsable administrativo del salón/jardín dentro de la plataforma.
3. **Planner de Organización** — persona que opera uno o varios Eventos asignados dentro del salón.
4. **Staff temporal** — personal de recepción/acceso habilitado para un Evento específico.
5. **Público por Invitación/Álbum** — invitado que interactúa con su experiencia pública.

### Decisión

**No se crea un rol persistido `VENUE_OWNER`, `SALON_OWNER`, `VENUE_MANAGER` ni equivalente.**

El `ORGANIZATION_ADMIN` existente representa al actor que necesita visión global de la Organización. Si en el futuro aparece un actor humano con permisos realmente distintos, deberá demostrarse el gap antes de crear un nuevo rol.

## 4. Organización

La Organización representa al salón/jardín como propietario del tenant y de sus Eventos.

Debe permitir agrupar bajo una sola cuenta:

- múltiples Eventos;
- uno o más Planner de Organización;
- administración general del salón;
- información operativa consolidada;
- finanzas de la Organización cuando corresponda;
- Staff temporal separado por Evento.

La Organización no se registra públicamente durante este modelo. Su alta continúa siendo una acción administrativa de InvitacionesPremium conforme a los contratos vigentes.

## 5. Platform Admin / InvitacionesPremium

### 5.1 Responsabilidad principal

Entregar al salón una infraestructura operativa repetible para sus Eventos sin obligarlo a construir o mantener la parte técnica del producto.

### 5.2 Puede preparar

Por Evento, mediante superficies administrativas explícitas:

- alta/intake del Evento para la Organización;
- producto/servicio contratado;
- Invitación cuando aplique;
- acciones de Invitación;
- infraestructura de Confirmaciones cuando aplique;
- Croquis;
- Mesas, capacidades, zonas y geometría;
- recursos técnicos necesarios para dejar el Evento listo;
- asignación o reasignación de Planner responsable mediante la capacidad administrativa vigente;
- soporte e incidencias mediante acciones auditadas.

### 5.3 Provenance y asignación

En M02 se mantiene la separación vigente:

- `clientId` = Organización propietaria del Evento;
- `createdByUserId` = actor real que creó el registro;
- `assignedPlannerUserId` = Planner responsable de la operación cotidiana del Evento.

El creador del Evento no determina ownership operativo.

Cuando InvitacionesPremium crea un Evento para el salón, `createdByUserId` debe conservar al Platform Admin real. Nunca se falsifica al Planner como creador.

### 5.4 Límites

InvitacionesPremium no debe decidir normalmente:

- lista final de invitados;
- acompañantes aceptados;
- distribución final de personas entre Mesas;
- Staff operativo concreto del salón;
- relación del salón con su cliente final.

No hay impersonación ni reutilización informal de rutas Planner.

## 6. Admin de Organización

### 6.1 Qué representa

Es el actor que administra la cuenta del salón/jardín.

Puede corresponder, según el negocio real, a:

- propietario;
- gerente;
- coordinador general;
- responsable administrativo autorizado.

El nombre comercial del puesto no modifica el rol técnico.

### 6.2 Responsabilidad principal

> **Tener control global de los Eventos y personas operativas de su salón sin encargarse necesariamente de la operación diaria de cada Evento.**

### 6.3 Debe poder ver

Dentro de su Organización:

- todos los Eventos;
- estado de cada Evento;
- Planner responsable o falta de asignación;
- información general del Evento;
- avances operativos relevantes;
- invitados/Confirmaciones cuando necesite supervisión;
- Mesas/Croquis;
- Staff habilitado;
- resultados y reportes;
- información financiera de la Organización cuando el módulo corresponda.

### 6.4 Debe poder administrar

Conforme a los contratos vigentes:

- datos de la Organización;
- Planner(s) internos;
- Eventos de la Organización;
- asignaciones operativas donde exista superficie autorizada;
- invitados y operación cuando deba intervenir;
- Staff por Evento;
- lifecycle permitido;
- reportes y finanzas propias de la Organización.

### 6.5 Principio de UX

El Admin de Organización no necesita trabajar como Planner en cada Evento.

Su superficie debe priorizar:

> **qué Eventos existen → quién los está operando → qué requiere atención → cómo terminó cada Evento.**

Puede entrar al detalle operativo cuando lo necesite, pero su vista principal debe ser organizacional.

## 7. Planner de Organización

### 7.1 Qué representa

Es la persona del salón/jardín encargada de operar Eventos concretos.

No representa un tipo de tarifa ni un cliente separado.

### 7.2 Ownership operativo

M02 adopta como regla la asignación explícita vigente:

> **Un Planner de Organización opera únicamente los Eventos de su Organización que estén asignados a su `userId`.**

No se utiliza `createdByUserId` para determinar su acceso operativo.

Esto permite que:

- InvitacionesPremium cree el Evento;
- un Admin de Organización cree o supervise el Evento;
- posteriormente se asigne o reasigne a la persona responsable;
- la provenance histórica permanezca intacta.

### 7.3 Puede operar, sobre Eventos asignados

- invitados/contactos;
- Invitaciones;
- distribución;
- Confirmaciones;
- acompañantes permitidos;
- asignación/movimiento/desasignación de personas entre Mesas;
- consulta del Croquis preparado;
- creación y distribución de accesos Staff;
- lifecycle permitido;
- reportes operativos;
- Álbum cuando aplique.

### 7.4 No puede

- ver Eventos no asignados sólo por pertenecer a la misma Organización;
- administrar finanzas globales de la Organización;
- crear o administrar usuarios internos salvo decisión posterior;
- modificar pricing o condiciones comerciales;
- usar el builder de Croquis si el perfil operator-led lo mantiene reservado al proveedor;
- operar mediante identidad de otro Planner.

## 8. Asignación y reasignación de Eventos

La asignación de Planner es una propiedad de responsabilidad operativa, no un cambio de producto ni de precio.

Reglas conceptuales:

1. un Evento pertenece siempre a una Organización;
2. puede existir temporalmente sin Planner asignado durante preparación;
3. cuando se asigna, sólo una `ORGANIZATION_PLANNER` activa del mismo tenant es candidata válida;
4. cambiar de Planner no cambia creador, producto, precio ni historial;
5. el Planner anterior pierde acceso operativo cuando la reasignación se hace efectiva;
6. el nuevo Planner obtiene acceso conforme a la policy vigente;
7. la acción debe ser explícita y auditable.

M02 no requiere múltiples Planner simultáneamente con ownership completo sobre el mismo Evento. Si un piloto demuestra esa necesidad, se modelará como una decisión posterior.

## 9. Staff temporal

### 9.1 Naturaleza

Staff sigue siendo temporal y Event-scoped.

No pertenece globalmente a la Organización como usuario permanente para efectos del MVP.

Una misma persona física puede recibir accesos distintos en Eventos distintos, pero cada token mantiene alcance independiente.

### 9.2 Quién lo habilita

La responsabilidad operativa recae en el cliente:

- Planner asignado puede crear/distribuir Staff para su Evento;
- Admin de Organización puede intervenir donde su superficie autorizada lo permita.

InvitacionesPremium mantiene la infraestructura y soporte, pero no decide normalmente quién trabaja en la recepción.

### 9.3 Función

Su flujo continúa siendo:

> **buscar / escanear → identificar → registrar entrada → indicar Mesa.**

No obtiene acceso global al salón ni a otros Eventos.

## 10. Público por Invitación

No cambia respecto de M01.

Cada invitado interactúa únicamente con su propia Invitación/Álbum mediante los tokens correspondientes y conforme al producto contratado.

El hecho de que el Evento pertenezca a un salón no concede visibilidad sobre otros Eventos o invitados.

## 11. Matriz de responsabilidades M02

| Actividad | InvitacionesPremium | Admin Organización | Planner asignado | Staff |
|---|---:|---:|---:|---:|
| Alta técnica de Organización | Responsable | Aporta información | — | — |
| Alta/preparación técnica de Evento | Responsable en perfil gestionado | Supervisa/aporta información | Consulta/aporta información | — |
| Preparar Flyer/Flipbook | Responsable cuando aplica | Supervisa si corresponde | Revisa/aporta contenido | — |
| Construir Croquis | Responsable | Consulta | Consulta | — |
| Crear Mesas/capacidades/zonas | Responsable | Consulta | Consulta | — |
| Asignar Planner responsable | Capacidad Admin explícita | Capacidad organizacional donde esté habilitada | — | — |
| Mantener lista de invitados | Soporte excepcional | Puede intervenir | Responsable operativo | — |
| Distribuir Invitaciones | — | Puede intervenir | Responsable operativo | — |
| Monitorear Confirmaciones | Soporte/supervisión | Supervisa | Responsable operativo | — |
| Organizar personas en Mesas | Soporte excepcional | Puede intervenir | Responsable operativo | — |
| Crear/distribuir Staff | Infraestructura/soporte | Puede intervenir | Responsable operativo | — |
| Escanear y registrar entrada | Soporte | Usa Staff si participa | Usa Staff si participa | Responsable operativo |
| Ver todos los Eventos del salón | Admin global | Responsable | Sólo asignados | — |
| Ver reportes del Evento | Admin autorizado | Responsable organizacional | Eventos asignados | — |
| Ver finanzas de la Organización | Admin financiero | Responsable | — | — |

La matriz describe responsabilidades de producto; cada acción concreta sigue su contrato técnico de autorización.

## 12. Flujo operativo M02

```text
1. InvitacionesPremium da de alta al salón/jardín como Organización
        ↓
2. Se crea/habilita al Admin de Organización
        ↓
3. La Organización cuenta con uno o más Planner internos
        ↓
4. Se registra un nuevo Evento para la Organización
        ↓
5. InvitacionesPremium prepara la parte técnica
        ↓
6. Se asigna una Planner responsable
        ↓
7. La Planner mantiene invitados y distribuye Invitaciones
        ↓
8. Se reciben Confirmaciones cuando el producto lo permite
        ↓
9. La Planner organiza Mesas sobre el Croquis preparado
        ↓
10. Planner/Admin habilita Staff para ese Evento
        ↓
11. Staff opera recepción y check-in
        ↓
12. Planner y Admin consultan resultados según alcance
        ↓
13. InvitacionesPremium supervisa/reportea según capacidad Admin
        ↓
14. El Evento se cierra y continúa a reporte/Álbum cuando aplique
```

## 13. Superficies esperadas

### Platform Admin / InvitacionesPremium

Debe priorizar:

- Organizaciones/clientes;
- Eventos globales;
- preparación técnica;
- Planner asignado;
- Invitaciones;
- Croquis;
- incidencias;
- reportes/auditoría;
- finanzas/comercial donde corresponda.

### Admin de Organización

Debe priorizar:

- resumen de todos los Eventos;
- próximo Evento / Eventos activos;
- Planner responsable;
- alertas o pendientes;
- usuarios Planner;
- supervisión de invitados/Confirmaciones/Mesas;
- Staff;
- reportes;
- finanzas de la Organización.

### Planner de Organización

Debe priorizar:

- Mis Eventos asignados;
- invitados;
- Confirmaciones;
- distribución;
- Mesas;
- Staff;
- reportes;
- Álbum cuando aplique.

### Staff

Debe priorizar únicamente la operación del Evento asociado.

## 14. Qué NO introduce M02

M02 no autoriza:

- un rol nuevo para dueño de salón;
- un rol permanente de hostess/recepción;
- Planner con acceso automático a todos los Eventos de la Organización;
- múltiples Planner con ownership completo simultáneo sobre un Evento;
- autoservicio total de Croquis;
- licencia SaaS/autogestión completa;
- registro público de Organización;
- nueva lógica de pricing por volumen;
- descuentos Venue;
- nuevas capacidades de Invitación/RSVP;
- cambios al ledger;
- checkout/pasarela;
- white-label;
- instancia dedicada.

Esos puntos pertenecen a modelos o decisiones posteriores.

## 15. Relación con la capa comercial

M02 describe **cómo opera un salón/jardín integrado al servicio**, no cuánto paga.

El salón puede posteriormente tener:

- tarifa por Evento;
- descuento por volumen;
- paquete comercial;
- reventa;
- otra condición negociada.

Ninguna de esas condiciones cambia por sí misma las capacidades de Admin Organización, Planner, Staff o Invitados.

## 16. Compatibilidad con el dominio actual

M02 está diseñado para reutilizar el dominio existente:

- `ClientType.ORGANIZATION` para tenancy;
- `ORGANIZATION_ADMIN` para visión global;
- `ORGANIZATION_PLANNER` para operación asignada;
- `Event.assignedPlannerUserId` para responsabilidad operativa;
- Staff mediante token Event-scoped;
- Platform Admin mediante superficies administrativas explícitas.

La hipótesis de M02 es, por tanto, que **no requiere un rol persistido nuevo**.

La validación contra runtime posterior deberá clasificar qué superficies ya existen y cuáles necesitan adaptación UX/operativa.

## 17. Criterio para pasar a código

Al terminar de documentar todos los modelos, M02 se auditará contra runtime utilizando:

- `EXISTS`;
- `ADAPT`;
- `MISSING`;
- `DOC-ONLY`;
- `OUT-OF-SCOPE`.

No implementar gaps de M02 antes de terminar la serie de modelos acordada.

## 18. Próximo modelo

El siguiente modelo será M03: **licencia/autoservicio para un salón, agencia u Organización que opera la plataforma con mucha menor intervención de InvitacionesPremium**.

M03 deberá responder especialmente:

- qué preparación deja de hacer InvitacionesPremium;
- qué capacidades técnicas se exponen al cliente;
- si Admin/Planner existentes bastan;
- qué pasa con Croquis y diseño;
- qué soporte/mantenimiento conserva InvitacionesPremium;
- qué diferencia funcional real existe frente a M02, sin mezclar todavía pricing o licencia comercial.
