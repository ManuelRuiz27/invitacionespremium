# 06A — Modelo 01: Planner independiente

Estado: **APROBADO COMO MODELO BASE PARA IMPLEMENTACIÓN**  
Modelo: M01  
Escenario: venta directa a Planner independiente con servicio gestionado  
Objetivo: fijar actores, responsabilidades, ownership y flujo antes de convertir gaps en código.

## 1. Tesis del modelo

InvitacionesPremium se ofrece inicialmente a Planner independiente como un **servicio gestionado para operar invitados y acceso de Eventos**.

La división de trabajo es:

> **InvitacionesPremium prepara la parte técnica del Evento. El Planner administra a sus invitados y toma las decisiones operativas. El Staff temporal opera el acceso el día del Evento.**

Este modelo permite lanzar el producto sin exigir al Planner configurar toda la infraestructura técnica ni convertir la plataforma en un SaaS completamente autoservicio.

## 2. Actores

M01 utiliza únicamente estos actores funcionales:

1. **Platform Admin / InvitacionesPremium** — propietario y operador del servicio.
2. **Planner independiente** — cliente que organiza y opera sus Eventos.
3. **Staff temporal** — personal del Evento con acceso limitado mediante token.
4. **Público por Invitación/Álbum** — invitado que interactúa con su propia experiencia pública conforme a contratos vigentes.

No se autoriza crear un rol persistido nuevo para M01.

## 3. Platform Admin / InvitacionesPremium

### 3.1 Responsabilidad principal

Entregar al Planner un Evento técnicamente preparado y supervisable sin apropiarse de las decisiones que corresponden al organizador.

### 3.2 Puede administrar globalmente

- Clientes;
- Eventos mediante superficies administrativas autorizadas;
- estado técnico de preparación;
- Invitación cuando el producto contratado la incluye;
- assets y acciones/hotspots;
- Croquis;
- Mesas, capacidades, zonas y geometría;
- readiness técnico/comercial conforme a contratos vigentes;
- incidencias operativas mediante capacidades administrativas explícitas y auditadas;
- reportes y auditoría global donde el rol ya tenga autorización.

### 3.3 Preparación del Evento

Durante M01, InvitacionesPremium puede preparar para el Planner:

- datos base del Evento;
- producto/servicio contratado;
- Flyer o Flipbook cuando aplique;
- acciones de la Invitación;
- infraestructura de Confirmaciones cuando el producto la incluye;
- Croquis;
- Mesas y capacidades;
- recursos requeridos para que el Evento quede listo para la operación del Planner.

### 3.4 Límites de responsabilidad

Platform Admin no debe decidir normalmente:

- quién está invitado;
- quién deja de estar invitado;
- qué acompañantes acepta el Planner;
- distribución final de invitados entre Mesas;
- quién integra el Staff operativo del Evento;
- comunicación personal con el cliente final del Planner.

Platform Admin tampoco debe:

- impersonar al Planner;
- reutilizar endpoints Planner como si tuviera ownership;
- compartir credenciales;
- saltarse tenant/ownership boundaries;
- depender de UI oculta como mecanismo de autorización.

Toda intervención provider-led debe utilizar superficies administrativas explícitas y auditadas.

## 4. Planner independiente

### 4.1 Responsabilidad principal

Administrar a sus invitados y tomar las decisiones operativas del Evento sobre una infraestructura previamente preparada por InvitacionesPremium.

### 4.2 Puede operar sus Eventos

Debe poder consultar y operar únicamente los Eventos que le pertenecen o le están asignados conforme a los contratos de ownership vigentes.

En esos Eventos administra:

- invitados/contactos;
- Invitaciones;
- distribución de enlaces personales;
- Confirmaciones;
- acompañantes permitidos;
- seguimiento de pendientes;
- asignación, movimiento y desasignación de personas entre Mesas existentes;
- creación y distribución de accesos Staff;
- cierre/reapertura/cancelación donde el lifecycle lo permita;
- reportes propios;
- Álbum cuando el producto contratado lo permita.

### 4.3 Invitados

El Planner controla:

- alta y mantenimiento de invitados;
- contacto principal;
- grupos/familias nominales;
- acompañantes conforme al límite configurado;
- cancelaciones específicas;
- distribución de Invitaciones.

La plataforma puede asistir técnicamente, pero la decisión sobre invitados pertenece al Planner.

### 4.4 Confirmaciones

Cuando el producto contratado incluye Confirmaciones públicas, el Planner puede:

- monitorear pendientes;
- consultar confirmados/rechazados;
- revisar acompañantes;
- gestionar cambios permitidos;
- cerrar/reabrir Confirmaciones conforme a reglas vigentes.

No se debe prometer Confirmación pública para un producto cuyo contrato no la incluya.

### 4.5 Croquis y Mesas

InvitacionesPremium construye la infraestructura del Croquis para M01.

El Planner consume esa infraestructura y administra personas sobre Mesas existentes.

Puede:

- consultar el plano;
- asignar personas;
- mover personas;
- desasignar personas;
- identificar capacidad y ocupación;
- detectar confirmados pendientes de Mesa.

No recibe por defecto el builder de geometría del Croquis durante este modelo de lanzamiento.

## 5. Staff temporal

### 5.1 Naturaleza

Staff no es un usuario permanente ni un subtipo comercial.

Es personal temporal habilitado por el Planner para operar un Evento específico mediante token.

### 5.2 Creación y distribución

En M01, **el Planner crea y distribuye los accesos Staff** mediante las superficies autorizadas.

InvitacionesPremium prepara y mantiene la infraestructura que permite esos accesos, pero no decide normalmente quién integra el equipo operativo del Planner.

### 5.3 Puede

- entrar mediante token sin login tradicional;
- operar únicamente el Evento asociado;
- escanear QR;
- buscar Invitación conforme a contrato vigente;
- ver información mínima necesaria para recepción;
- registrar check-in por Asistente;
- consultar pendientes;
- consultar Mesa y Croquis cuando existan y el contrato Scanner lo permita.

### 5.4 No puede

- ver precios, saldo, créditos o deuda;
- acceder a otros Eventos;
- administrar Invitaciones;
- modificar Croquis o Mesas;
- gestionar Confirmaciones;
- consultar teléfonos si el contrato Staff/Scanner los excluye;
- ver auditoría o reportes financieros;
- activar o modificar el Evento;
- revertir check-in salvo que un contrato posterior lo autorice expresamente.

La interfaz Staff debe priorizar:

> buscar / escanear → identificar → registrar entrada → indicar Mesa.

## 6. Público por Invitación

El invitado no es usuario del Planner ni Staff.

Interactúa únicamente con su Invitación pública mediante token y, cuando aplique:

- consulta la experiencia del Evento;
- confirma/rechaza;
- registra nombres permitidos;
- consulta su QR cuando las reglas lo permiten;
- recibe mensajes de cierre/cancelación correspondientes.

Sus capacidades permanecen regidas por `PUBLIC_RSVP_CONTRACT.md`, `INVITATIONS_CONTRACT.md` y `QR_CONTRACT.md`.

## 7. Ownership y jerarquía de acceso

La estructura conceptual de M01 es:

```text
InvitacionesPremium / Platform Admin
        │
        │ prepara y supervisa mediante capacidades Admin
        ▼
      Evento
        │
        │ ownership/operación
        ▼
Planner independiente
        │
        │ crea accesos temporales
        ▼
      Staff
```

Esta representación no implica una jerarquía laboral ni autoriza acceso informal entre actores.

## 8. Matriz de responsabilidades

| Actividad | InvitacionesPremium | Planner | Staff |
|---|---:|---:|---:|
| Alta/preparación técnica del Evento | Responsable | Consulta/aporta información | — |
| Preparar Flyer/Flipbook | Responsable cuando aplica | Revisa/aprueba contenido | — |
| Configurar acciones de Invitación | Responsable técnico | Define información/decisiones comerciales del Evento | — |
| Construir Croquis | Responsable | Consulta | — |
| Crear Mesas/capacidades/zonas | Responsable | Consulta | — |
| Mantener lista de invitados | Apoyo excepcional | Responsable | — |
| Distribuir Invitaciones | — | Responsable | — |
| Monitorear Confirmaciones | Supervisión/soporte | Responsable | — |
| Organizar personas en Mesas | Soporte excepcional | Responsable | — |
| Crear/distribuir accesos Staff | Infraestructura/soporte | Responsable | — |
| Escanear QR | Soporte/supervisión | Puede operar si su superficie lo permite | Responsable operativo |
| Registrar entrada | Soporte/supervisión | Puede operar si su superficie lo permite | Responsable operativo |
| Consultar reportes del Evento | Admin global autorizado | Responsable de sus Eventos | — |

La columna InvitacionesPremium describe responsabilidad de servicio, no autorización automática sobre endpoints Planner.

## 9. Flujo operativo M01

```text
1. Planner contrata el servicio
        ↓
2. InvitacionesPremium registra/prepara el Evento
        ↓
3. Se prepara Invitación y Croquis cuando corresponda
        ↓
4. El Planner recibe/consulta el Evento preparado
        ↓
5. El Planner carga y mantiene invitados
        ↓
6. El Planner distribuye Invitaciones
        ↓
7. Invitados confirman cuando el producto lo permite
        ↓
8. El Planner organiza Mesas
        ↓
9. El Planner crea accesos para Staff
        ↓
10. Staff opera recepción y check-in
        ↓
11. Planner e InvitacionesPremium consultan resultados según sus permisos
        ↓
12. El Evento se cierra y continúa a reporte/Álbum cuando aplique
```

## 10. Superficies esperadas

### Admin / InvitacionesPremium

Debe priorizar:

- Clientes;
- Eventos;
- preparación técnica;
- Invitaciones;
- Croquis;
- supervisión/incidencias;
- reportes;
- auditoría;
- finanzas sólo donde corresponda.

### Planner

Debe priorizar:

- Mis Eventos;
- invitados;
- Confirmaciones;
- distribución;
- Mesas;
- Staff;
- reportes;
- Álbum cuando aplique.

### Staff

Debe priorizar:

- escanear;
- buscar;
- identificar;
- registrar entrada;
- consultar Mesa/Croquis.

## 11. Invariantes

M01 no autoriza por sí mismo:

- nuevos roles persistidos;
- registro público de Organización;
- autoservicio del Croquis para Planner;
- nueva lógica de pricing;
- nuevas tarifas Partner/Venue;
- modificación del ledger;
- checkout o pasarela de pago;
- WhatsApp API;
- capacidades adicionales de Staff;
- cambios de lifecycle del Evento.

## 12. Relación con la capa comercial

M01 describe **cómo se opera el servicio**, no cuál será el precio definitivo ni el esquema de margen.

Puede venderse inicialmente bajo una condición Standard o cualquier condición comercial posterior aprobada sin cambiar este reparto funcional de responsabilidades.

Las decisiones de pricing, descuento, margen Planner, reventa y adquisición deben mantenerse fuera de este documento salvo cuando una decisión comercial requiera explícitamente una nueva capacidad de producto.

## 13. Criterio para pasar a código

Antes de abrir un ticket técnico derivado de M01 se debe comparar este modelo contra el runtime actual y clasificar cada punto como:

- `EXISTS` — ya está implementado y cubierto;
- `ADAPT` — existe pero la superficie/ownership no coincide exactamente;
- `MISSING` — requiere desarrollo;
- `DOC-ONLY` — sólo requiere aclaración documental;
- `OUT-OF-SCOPE` — no pertenece a M01.

No implementar un gap sin identificar primero el contrato técnico afectado.

## 14. Próximo modelo

Una vez certificado M01, el siguiente modelo a definir será M02: **salón/jardín como Organización que administra múltiples Eventos y puede asignarlos a Planner(s)**.

M02 debe partir de M01 y responder, como mínimo:

- quién contrata;
- qué ve el dueño/admin del salón;
- qué puede hacer un Planner del salón;
- cómo se asignan Eventos;
- quién crea Staff;
- qué información operativa necesita el salón;
- si los roles actuales de Organización ya cubren el escenario o existe un gap real.

No crear un nuevo rol para salón antes de cerrar esa evaluación.
