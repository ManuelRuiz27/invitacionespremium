# 06D — Modelo 04: Cliente de gran escala / servicio dedicado

Estado: **APROBADO COMO MODELO DE REFERENCIA — NO AUTORIZA CODE**  
Modelo: M04  
Escenario: cliente profesional con alto volumen anual y Eventos de gran escala que requiere operación e infraestructura dedicada  
Objetivo: separar necesidades reales de escala/aislamiento de decisiones comerciales enterprise antes de modificar el producto.

## 1. Escenario de origen

M04 nace de un escenario comercial ya discutido para un cliente que produce aproximadamente:

- 20–50 Eventos por año;
- graduaciones y otros Eventos de 500–1,500/2,000 invitados;
- adicionalmente bodas, XV años y corporativos.

Este escenario supera ampliamente el límite funcional de 150 invitados por Evento del perfil actual y no debe tratarse como un simple cambio de tarifa.

## 2. Tesis del modelo

El cliente de gran escala utiliza **el mismo producto, core y repositorio** de InvitacionesPremium.

No se crea un fork por cliente.

Cuando la escala, aislamiento o requisitos de operación lo justifiquen, puede existir un despliegue dedicado con:

- infraestructura propia del cliente;
- base de datos aislada;
- storage aislado;
- configuración y límites propios;
- dominio propio;
- branding configurable;
- observabilidad y soporte diferenciados.

La regla es:

> **Dedicado no significa producto distinto. Significa el mismo core desplegado con aislamiento, configuración y capacidad acordes al cliente.**

## 3. Diferencia respecto de M03

M03 es autoservicio sobre la plataforma multi-tenant compartida.

M04 añade una necesidad de escala o aislamiento suficiente para justificar un entorno dedicado.

```text
M03
Core compartido
→ infraestructura compartida
→ tenant aislado lógicamente
→ cliente opera sus Eventos

M04
Mismo core
→ despliegue dedicado
→ datos/storage/configuración dedicados
→ cliente opera sus Eventos a gran escala
```

No debe crearse M04 sólo por prestigio comercial. Debe existir una razón técnica, operativa, contractual o de escala verificable.

## 4. Actores

M04 intenta reutilizar los mismos actores funcionales:

1. Platform Admin / InvitacionesPremium;
2. Admin de Organización;
3. Planner(s) de Organización;
4. Staff temporal;
5. Público por Invitación/Álbum.

### Decisión

Un cliente enterprise no obtiene automáticamente un nuevo rol persistido.

No crear `ENTERPRISE_ADMIN`, `DEDICATED_ADMIN`, `CLIENT_OWNER` o equivalente salvo que un gap real de permisos no pueda resolverse con los roles existentes.

## 5. Organización enterprise

La Organización sigue siendo la unidad propietaria de usuarios, Eventos y datos operativos.

Debe poder administrar:

- múltiples Planner;
- múltiples Eventos simultáneos;
- Eventos de capacidades significativamente mayores;
- Staff por Evento;
- reportes consolidados;
- finanzas propias cuando correspondan;
- configuración organizacional compatible con el contrato enterprise futuro.

La escala no rompe el modelo de tenancy.

## 6. Platform Admin / InvitacionesPremium

### 6.1 Responsabilidad

InvitacionesPremium mantiene:

- core del producto;
- despliegues/versiones;
- seguridad;
- migraciones;
- backups;
- observabilidad;
- soporte técnico;
- recuperación ante incidentes;
- configuración de infraestructura dedicada;
- auditoría/global support donde corresponda.

### 6.2 No fork

No se permite mantener una rama funcional distinta del producto para cada cliente.

Las diferencias deben resolverse preferentemente mediante:

- configuración;
- feature flags contractuales;
- límites por deployment/tenant;
- branding configurable;
- infraestructura distinta;
- capacidades explícitas que también puedan mantenerse en el core.

Toda personalización que requiera comportamiento exclusivo debe evaluarse como producto o integración y no introducirse como parche privado sin gobierno.

## 7. Admin de Organización

Conserva la responsabilidad global del cliente:

- usuarios Planner;
- todos los Eventos;
- asignaciones;
- supervisión;
- readiness;
- reportes;
- finanzas propias;
- configuración organizacional autorizada.

En un entorno dedicado puede además existir configuración operativa específica del deployment, pero ésta no debe mezclarse automáticamente con permisos de dominio.

## 8. Planner de Organización

Opera Eventos asignados bajo el mismo principio de ownership de M02/M03.

Para que M04 sea realmente autoservicio, debe disponer de las capacidades de preparación definidas en M03 cuando correspondan:

- datos del Evento;
- Invitaciones;
- Confirmaciones;
- invitados;
- Croquis/Mesas;
- Staff;
- check-in;
- reportes;
- Álbum según producto.

La gran escala no debe conceder acceso a Eventos no asignados.

## 9. Staff temporal en gran escala

El modelo actual de máximo tres StaffTokens activos por Evento fue diseñado para el MVP y puede ser insuficiente para Eventos de 1,000–2,000 personas.

M04 no debe asumir que aumentar ese número es sólo una constante.

El gap analysis debe evaluar:

- cantidad real de puntos de acceso;
- concurrencia de Scanner;
- throughput requerido;
- tiempos objetivo de ingreso;
- operación offline/contingencia;
- coordinación entre accesos;
- búsqueda manual bajo carga;
- límites y revocación de Staff;
- observabilidad durante el Evento.

Hasta que exista esa evaluación, M04 no autoriza un nuevo límite Staff.

## 10. Capacidad de invitados

El baseline actual de producto soporta hasta 150 invitados/contactos por Evento.

M04 requiere evaluar capacidades de al menos 500–2,000 invitados y no puede considerarse implementado mientras el dominio, UI, importación, reportes y operación mantengan límites incompatibles.

La expansión debe comprobar como mínimo:

- modelo de capacidad;
- importación masiva;
- validaciones;
- tiempos de respuesta;
- búsquedas;
- RSVP;
- distribución;
- seating;
- generación/lectura QR;
- check-in concurrente;
- reportes;
- exportaciones;
- almacenamiento;
- QA de volumen.

No cambiar el límite a 2,000 sin pruebas y contratos explícitos.

## 11. Croquis/Mesas a gran escala

Un Evento de 1,000–2,000 asistentes puede requerir cientos de Mesas o zonas.

M04 debe evaluar:

- rendimiento del Builder;
- rendimiento del Seating Workspace;
- navegación/zoom;
- selección masiva;
- búsqueda de invitados;
- asignaciones por grupo/familia;
- capacidad por zonas;
- integridad de asientos cuando el modo detallado se utilice;
- lectura rápida desde Scanner.

La funcionalidad de Croquis sigue perteneciendo al core; no se crea un editor enterprise separado.

## 12. Invitaciones y distribución a gran escala

El producto debe seguir respetando los mismos contratos de Invitación y privacidad.

La escala exige revisar:

- creación masiva de Invitaciones;
- generación de QR;
- distribución de enlaces;
- throttling/colas si existen integraciones posteriores;
- observabilidad de errores;
- importaciones grandes;
- recuperación ante fallos parciales.

M04 no autoriza por sí mismo WhatsApp API, SMS o tracking de entrega.

## 13. Infraestructura dedicada

Un despliegue dedicado puede incluir:

```text
Core InvitacionesPremium
        ↓
Deployment dedicado
├── API
├── Frontends
├── Base de datos
├── Storage
├── backups
├── observabilidad
├── dominio/configuración
└── límites enterprise
```

La arquitectura exacta se define después de medir carga y requisitos.

No asumir que cada cliente enterprise necesita duplicar todos los componentes si el aislamiento lógico/configurable resuelve el caso.

## 14. Branding y dominio

M04 puede justificar:

- dominio/subdominio dedicado;
- branding configurable;
- identidad visual del cliente donde comercialmente se acuerde.

Pero eso no significa automáticamente white-label completo.

Debe distinguirse:

- **branding configurable**: el producto sigue siendo InvitacionesPremium con identidad adaptada;
- **white-label**: el cliente presenta el producto como propio.

White-label requiere decisión comercial y contractual separada.

## 15. SLA y soporte

Un cliente de 20–50 Eventos/año y Eventos masivos puede requerir soporte distinto al modelo estándar.

M04 debe permitir definir posteriormente:

- ventana de soporte;
- soporte en día de Evento;
- severidades;
- tiempos de respuesta;
- contingencia;
- respaldo/restauración;
- monitoreo;
- mantenimiento programado.

Estos elementos pertenecen al contrato enterprise y no deben codificarse como reglas de EventStatus.

## 16. Flujo operativo M04

```text
1. InvitacionesPremium provisiona/actualiza deployment dedicado
        ↓
2. Se configura la Organización enterprise
        ↓
3. Admin gestiona Planner internos
        ↓
4. Organización crea múltiples Eventos
        ↓
5. Planner prepara cada Evento mediante autoservicio
        ↓
6. Se cargan/importan invitados a gran escala
        ↓
7. Se configuran Invitaciones, RSVP y Croquis/Mesas
        ↓
8. Se valida readiness y capacidad operativa
        ↓
9. Se habilita Staff suficiente conforme al contrato futuro
        ↓
10. Se opera acceso/check-in concurrente
        ↓
11. Se generan reportes/Álbum cuando corresponda
        ↓
12. InvitacionesPremium monitorea infraestructura y soporte
```

## 17. Modelo comercial histórico del escenario

En conversaciones previas se exploró, sólo como hipótesis comercial, un esquema similar a:

- implementación inicial alrededor de $25,000–$40,000 MXN, con referencia de trabajo de ~$30,000;
- anualidad alrededor de $50,000–$80,000 MXN, con referencia de trabajo de ~$60,000;
- operación por Evento escalonada por capacidad, con ejemplos aproximados de $2,500 / $3,500 / $4,500 / $5,500 para bandas hasta 500 / 1,000 / 1,500 / 2,000 asistentes.

Estos importes **NO quedan aprobados como pricing** mediante M04.

Se conservan únicamente como antecedente del escenario que originó el modelo. La capa financiera deberá recalcular infraestructura, soporte, volumen, COGS y disposición de pago antes de convertirlos en Price Book o contrato.

## 18. Qué M04 NO autoriza

M04 no autoriza todavía:

- aumentar capacidad a 2,000 en producción;
- cambiar límites Staff;
- infraestructura nueva sin sizing;
- fork del repositorio;
- white-label automático;
- API privada;
- SSO;
- nuevas integraciones;
- nuevas tarifas;
- nuevo esquema de créditos;
- SLA codificado;
- roles enterprise nuevos;
- cambios de EventStatus;
- eliminación de tenant isolation.

## 19. Gap analysis requerido antes de código

M04 requiere una auditoría específica de escala que clasifique:

- capacidad actual y límites duros;
- performance API/DB;
- importación masiva;
- RSVP;
- QR;
- Scanner concurrente;
- Staff;
- Croquis/Seating;
- reportes;
- storage;
- backups;
- observabilidad;
- deployment;
- seguridad;
- UX de listas grandes;
- pruebas de carga.

Cada punto debe quedar `EXISTS`, `ADAPT`, `MISSING`, `DOC-ONLY` u `OUT-OF-SCOPE` antes de implementar.

## 20. Criterio para justificar deployment dedicado

No basta con que el cliente sea grande.

Debe existir al menos una razón verificable como:

- aislamiento contractual requerido;
- carga incompatible con límites compartidos;
- requisitos de disponibilidad/SLA;
- data residency/seguridad acordada;
- branding/dominio contractual;
- integraciones exclusivas justificadas;
- volumen que haga económicamente viable el costo dedicado.

Si el mismo resultado puede lograrse de forma segura y rentable en multi-tenant configurable, debe preferirse esa alternativa.

## 21. Próximo modelo

El último modelo pendiente de esta serie es M05: **Partner / Reseller**.

M05 deberá determinar si representa realmente un nuevo modelo operativo o si es una condición comercial que reutiliza M01/M02/M03 sin nuevos permisos.
