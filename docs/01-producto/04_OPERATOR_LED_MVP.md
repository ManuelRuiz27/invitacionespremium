# Operator-led MVP — Perfil de lanzamiento

Estado: **Decisión de producto para lanzamiento**  
Alcance: primeros eventos/pilotos comerciales  
No sustituye: modelo comercial, créditos, estados de Evento ni autorización base salvo donde un ADR lo indique expresamente.

## 1. Objetivo

InvitacionesPremium se lanzará primero como un **producto operado con servicio asistido**. La plataforma sigue siendo el producto; la configuración técnica inicial se realiza por InvitacionesPremium para reducir alcance, controlar calidad y aprender de eventos reales antes de automatizar el autoservicio.

Este perfil no obliga a que el producto termine siendo completamente self-service.

## 2. Hipótesis de producto

La Planner necesita control directo sobre las personas y la operación del evento, no necesariamente sobre la infraestructura que hace posible esa operación.

Debe poder controlar con claridad:

- quién está invitado;
- quién confirmó;
- cuántas personas asistirán;
- quién sigue pendiente;
- en qué mesa se sienta cada persona;
- quién ingresó el día del evento.

La construcción técnica de invitación, croquis, configuración RSVP y preparación operativa puede mantenerse detrás de una capa de servicio mientras se valida qué partes realmente necesitan autoservicio.

## 3. Responsabilidades de lanzamiento

### InvitacionesPremium / Operación del proveedor

- preparar el Evento para el cliente seleccionado;
- configurar datos y opciones que no correspondan a gestión cotidiana de invitados;
- cargar/configurar el material de la Invitación;
- configurar acciones/hotspots de la Invitación;
- preparar la infraestructura RSVP;
- construir el Croquis V2 mediante Sticker Model cuando el módulo esté habilitado;
- definir mesas, capacidades, zonas y geometría del salón;
- preparar accesos de Staff conforme a las reglas vigentes;
- preparar el Evento para activación;
- resolver incidencias operativas mediante capacidades explícitas y auditadas.

### Planner / cliente

- cargar y mantener la lista de invitados;
- gestionar contactos e invitaciones dentro de su Evento;
- distribuir los links de invitación por los canales autorizados;
- monitorear confirmaciones RSVP;
- consultar pendientes y asistencia;
- asignar/mover/desasignar personas sobre las mesas ya construidas;
- consultar el croquis sin alterar su infraestructura;
- operar las acciones de cliente habilitadas para el Evento.

### Staff temporal

Mantiene el alcance mínimo definido en roles/permisos. El perfil operator-led no amplía automáticamente información ni permisos de Scanner/Hostess.

## 4. Croquis en el lanzamiento

Se separan dos superficies de producto:

1. **Builder del proveedor:** construye infraestructura visual con stickers.
2. **Seating Workspace de Planner:** consume la geometría en modo lectura y administra personas/mesas.

Por lanzamiento, la Planner **no recibe el constructor del croquis**.

Esto no elimina del dominio la posibilidad futura de autoservicio; simplemente queda fuera del producto expuesto inicialmente.

## 5. Lo que deliberadamente NO se construye ahora

Queda en `Not now`, salvo que un piloto demuestre necesidad:

- constructor de croquis self-service para Planner;
- onboarding genérico capaz de explicar toda la configuración avanzada sin asistencia;
- automatización completa de la preparación de Eventos;
- expansión de jerarquías, roles o permisos sólo para anticipar futuros clientes;
- ampliación del motor de promociones/finanzas sin una necesidad comercial inmediata;
- nuevas capacidades de Álbum sin evidencia de que bloqueen la venta u operación;
- un nuevo stack visual para replicar el repositorio legacy;
- herramientas CAD o edición gráfica genérica en Croquis.

`Not now` no significa borrar código existente. Las capacidades ya construidas pueden permanecer congeladas u ocultas si no incrementan riesgo operativo.

## 6. Modelo de acceso

“Operador del proveedor” describe una **función operativa de lanzamiento**, no un nuevo `AuthRole` persistido.

No se permite:

- compartir credenciales con una Planner;
- impersonar silenciosamente a una Planner;
- saltarse ownership/tenant boundaries;
- dar a Platform Admin acceso informal mediante endpoints de cliente;
- confiar en ocultar botones como mecanismo de autorización.

La capacidad técnica del proveedor para operar un Evento debe implementarse conforme a `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md` antes de utilizarse en pilotos reales.

## 7. Invariantes que NO cambia este perfil

Salvo una decisión posterior explícita:

- los tipos de cliente permanecen vigentes;
- los roles persistidos permanecen vigentes;
- el modelo de créditos/precios permanece vigente;
- las reglas de activación permanecen vigentes;
- los estados de Evento permanecen vigentes;
- las reglas RSVP, QR, Staff, check-in y auditoría permanecen vigentes;
- la Planner conserva ownership funcional sobre la gestión de sus invitados.

El cambio es principalmente **quién configura la infraestructura durante el lanzamiento y qué superficie se expone al cliente**.

## 8. Instrumentación obligatoria de aprendizaje

Todo trabajo manual debe servir para decidir qué automatizar. Por Evento se debe poder registrar o derivar, al menos:

- tiempo desde venta/alta hasta Evento listo;
- minutos de configuración del operador;
- minutos de preparación de invitación;
- minutos de preparación de croquis;
- cantidad de invitados;
- cantidad de mesas;
- incidencias de soporte;
- cambios de último minuto;
- fallos o reintentos de check-in;
- errores de asignación/capacidad;
- interacciones de soporte con Planner.

No es obligatorio construir un sistema analítico completo antes del piloto; sí es obligatorio tener una forma consistente de medir estos datos.

## 9. Métricas de producto/negocio para la etapa

Métricas primarias:

- Eventos pagados operados por mes;
- margen de contribución por Evento cuando exista información de costos;
- minutos de operador por Evento;
- tiempo de alta/venta a Evento listo;
- incidencias de soporte por Evento;
- tasa de repetición de Planner/cliente.

Métricas operativas:

- tasa de confirmación RSVP;
- invitados confirmados sin mesa antes del cierre operativo;
- fallos de check-in;
- duplicados/reintentos conflictivos de check-in;
- cambios críticos realizados el día del Evento.

Ninguna métrica aislada sustituye el objetivo: operar Eventos reales con calidad mientras disminuye progresivamente el esfuerzo manual repetitivo.

## 10. Políticas operativas requeridas antes del piloto

Antes de vender/operar el primer piloto deben definirse, aunque inicialmente sean procedimientos manuales:

- tiempo de entrega estándar de invitación configurada;
- tiempo de entrega estándar de croquis;
- ventana límite para cambios estructurales del croquis;
- procedimiento para cambios de mesa de último minuto;
- procedimiento de contingencia para QR/check-in;
- horario/ventana de soporte el día del Evento;
- responsable y mecanismo para autorizar acciones excepcionales.

Estas políticas son un requisito operativo; no todas necesitan una feature de software en la primera versión.

## 11. Criterio para automatizar

Una operación manual se prioriza para automatización cuando combina:

- frecuencia alta;
- tiempo significativo por Evento;
- patrón repetible;
- riesgo de error humano;
- valor bajo de mantener intervención experta.

Las funciones poco frecuentes, de alto contexto o donde el servicio agregue valor pueden permanecer asistidas.

## 12. Evolución posible

La secuencia preferida es:

```text
Operator-led product
        ↓
Assisted SaaS
        ↓
Selective self-service
        ↓
Full self-service únicamente si la evidencia lo justifica
```

El último paso no es un requisito de éxito del producto.