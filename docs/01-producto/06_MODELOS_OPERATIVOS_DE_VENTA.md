# 06 — Modelos operativos de venta

Estado: **Marco de producto para modelar escenarios comerciales antes de código**  
Alcance: relación entre InvitacionesPremium, cliente, Evento y actores operativos  
No sustituye: pricing, finanzas, contratos técnicos especializados ni permisos ya persistidos salvo decisión explícita posterior.

## 1. Objetivo

Este documento separa los **modelos operativos de venta** de las hipótesis de pricing y adquisición.

Un modelo operativo de venta responde:

- quién contrata;
- quién prepara el Evento;
- quién administra invitados y decisiones operativas;
- quién opera el acceso el día del Evento;
- qué superficie necesita cada actor;
- qué ownership y permisos deben existir para que el modelo funcione.

No responde todavía:

- cuánto paga cada cliente;
- qué descuento obtiene;
- qué comisión o margen existe;
- qué tier de volumen aplica;
- qué esquema de créditos, suscripción, línea o anualidad se utiliza.

Esas decisiones permanecen en la capa comercial/financiera y sólo deben convertirse en reglas de software cuando estén explícitamente aprobadas.

## 2. Regla de modelado

Los modelos se diseñan de menor a mayor complejidad. Cada modelo posterior debe **extender** al anterior cuando sea posible y no crear un producto paralelo.

Secuencia de trabajo:

```text
Modelo operativo documentado
        ↓
Roles y responsabilidades validados
        ↓
Flujos y superficies necesarias
        ↓
Gap analysis contra producto actual
        ↓
Ticket técnico explícito
        ↓
Código
```

No implementar roles, permisos o superficies nuevas únicamente porque un escenario comercial las imagine. Primero debe existir un modelo aprobado en esta serie documental.

## 3. Registro de modelos

| Modelo | Escenario | Estado | Documento |
|---|---|---|---|
| M01 | Venta directa a Planner independiente, servicio gestionado | **APROBADO COMO BASE** | `06A_MODELO_01_PLANNER_INDEPENDIENTE.md` |
| M02 | Salón/jardín como Organización, múltiples Eventos y operación gestionada | **APROBADO COMO EXTENSIÓN DE M01** | `06B_MODELO_02_SALON_JARDIN_ORGANIZACION.md` |
| M03 | Licencia/autoservicio para Organización que opera directamente la plataforma | **APROBADO COMO MODELO DE REFERENCIA — NO AUTORIZA CODE** | `06C_MODELO_03_LICENCIA_AUTOSERVICIO.md` |
| M04 | Cliente profesional de gran escala con aislamiento/servicio dedicado | **APROBADO COMO MODELO DE REFERENCIA — NO AUTORIZA CODE** | `06D_MODELO_04_CLIENTE_GRAN_ESCALA_DEDICADO.md` |
| M05 | Partner/reseller y reventa | **RESUELTO COMO CAPA COMERCIAL SOBRE M01–M04 — NO AUTORIZA CODE** | `06E_MODELO_05_PARTNER_RESELLER.md` |

Auditoría transversal de implementación:

- `06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md` — compara M01–M05 contra el runtime y clasifica `EXISTS`, `ADAPT`, `MISSING`, `FINANCE-ONLY` y `OUT-OF-SCOPE`.

La familia inicial queda cubierta. Un modelo nuevo sólo debe añadirse si representa una distribución de responsabilidades realmente distinta, no una tarifa o estrategia de adquisición distinta.

## 4. Modelos definidos

### M01 — Planner independiente gestionado

```text
InvitacionesPremium / Platform Admin
        ↓ prepara y supervisa
Evento
        ↓ opera
Planner independiente
        ↓ habilita
Staff temporal
```

InvitacionesPremium conserva la preparación técnica y el Planner conserva las decisiones sobre invitados y operación.

### M02 — Salón/jardín gestionado

```text
InvitacionesPremium
        ↓ prepara y supervisa
Salón / Jardín (Organización)
        ↓ administración global
Admin de Organización
        ↓ asigna/supervisa
Planner(s) de Organización
        ↓ operan Eventos asignados
Staff temporal por Evento
```

M02 reutiliza roles y ownership existentes y no autoriza un rol nuevo para dueño de salón.

### M03 — Licencia/autoservicio

```text
InvitacionesPremium
        ↓ mantiene plataforma y soporte
Organización licenciada
        ↓ administra
Admin de Organización
        ↓ asigna/supervisa
Planner(s)
        ↓ preparan y operan Eventos asignados
Staff temporal por Evento
```

M03 no es una instancia dedicada ni white-label. La diferencia principal es que la Organización prepara sus propios Eventos y el Provider deja de ser el operador técnico ordinario de cada Evento.

### M04 — Cliente de gran escala / dedicado

```text
Mismo core InvitacionesPremium
        ↓
Deployment/configuración dedicada cuando se justifique
        ↓
Organización enterprise
        ↓
Admin + Planner(s)
        ↓
Eventos de gran escala
        ↓
Staff/operación concurrente
```

M04 conserva el mismo repositorio/core. No se permite fork por cliente. El aislamiento dedicado sólo se justifica por escala, seguridad, SLA, integración o requisitos contractuales verificables.

El escenario de origen considera clientes con aproximadamente 20–50 Eventos al año y Eventos de 500–1,500/2,000 invitados, por lo que requiere auditoría de capacidad y no puede resolverse cambiando únicamente el precio.

### M05 — Partner / reseller

M05 no es una quinta forma de operar el producto. Es una **capa comercial** sobre M01–M04.

```text
Modelo operativo M01/M02/M03/M04
        +
condición Partner / reventa / margen
```

Partner no es rol. Reseller no es permiso. Una estrategia de ventas en frío tampoco crea un modelo funcional nuevo.

## 5. Separación de conceptos

### Rol funcional

Responde: **¿qué puede hacer esta persona?**

Ejemplos vigentes:

- `PLATFORM_ADMIN`;
- `INDEPENDENT_PLANNER`;
- `ORGANIZATION_ADMIN`;
- `ORGANIZATION_PLANNER`;
- Staff mediante token.

### Tipo de cuenta / tenancy

Responde: **¿a quién pertenecen los datos?**

Ejemplos vigentes:

- Planner;
- Organización.

### Modelo operativo de venta

Responde: **¿cómo se reparte el trabajo entre InvitacionesPremium y el cliente?**

- M01: Provider prepara; Planner opera.
- M02: Provider prepara; Organización supervisa; Planner asignado opera.
- M03: Organización/Planner preparan y operan; Provider mantiene y soporta.
- M04: mismo patrón de autoservicio con escala/aislamiento dedicado cuando se justifica.

### Condición comercial

Responde: **¿cómo se vende/cobra?**

Puede incluir Standard, Partner, Venue, volumen, anualidad, implementación, licencia u otras condiciones, pero no redefine por sí misma las capacidades funcionales.

### Estrategia de adquisición

Responde: **¿cómo llega el cliente?**

Ejemplos:

- ventas en frío en San Luis Potosí;
- referrals;
- alianzas;
- inbound desde landing.

La adquisición tampoco crea roles o permisos.

## 6. Regla de extensión

Un modelo posterior puede introducir una nueva necesidad funcional únicamente cuando no pueda representarse correctamente con:

- roles existentes;
- ownership/asignación existente;
- Organización existente;
- Staff temporal existente;
- superficies administrativas explícitas del Provider;
- configuración/deployment del mismo core.

Antes de crear un nuevo rol persistido debe demostrarse:

1. que existe un actor humano distinto;
2. que necesita permisos distintos de todos los roles existentes;
3. que esa diferencia no se resuelve con ownership o asignación;
4. que el modelo que lo requiere fue aprobado como escenario de producto.

## 7. Relación con pricing y finanzas

Esta serie documental no congela precios ni convierte hipótesis comerciales en contratos financieros.

Un mismo producto funcional puede venderse bajo condiciones comerciales diferentes sin cambiar sus capacidades.

Los documentos especializados conservan como antecedentes algunas hipótesis ya discutidas —Partner, volumen Venue o cliente dedicado— pero ninguna de ellas debe promoverse automáticamente a Price Book, Ledger o contratos de pago por el hecho de estar documentada aquí.

La capa financiera se revisará después de cerrar los gaps funcionales priorizados de esta familia.

## 8. Regla para agentes

Cuando una tarea mencione un nuevo tipo de cliente, partner, salón, agencia, reseller, licencia, white-label, cliente grande o instancia dedicada:

1. identificar primero qué modelo operativo representa;
2. leer este registro;
3. leer el documento especializado del modelo;
4. leer `06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md` antes de afirmar que una capacidad falta o crearla;
5. separar modelo operativo, condición comercial y adquisición;
6. comprobar si roles/ownership actuales ya lo resuelven;
7. no crear código hasta convertir el gap en una decisión explícita y ticket técnico.

## 9. Gap analysis completado

La auditoría transversal ya se realizó en `06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md`.

Consolidó cinco gaps funcionales relevantes:

- `G01` — Managed vs Self-Service Capability Profile;
- `G02` — Organization Management Surface;
- `G03` — Client Reports Surface;
- `G04` — Client Album Management Surface;
- `G05` — Scale Certification, sólo para M04.

También confirmó que pricing, margen, volumen, licencia, setup fee, anualidad y estrategia de adquisición deben permanecer fuera del siguiente bloque funcional.

La siguiente fase no está autorizada automáticamente por este documento: Product debe seleccionar qué gaps se convierten en tickets técnicos, empezando preferentemente por M01/M02.
