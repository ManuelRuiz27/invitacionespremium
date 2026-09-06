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
- qué esquema de créditos o línea comercial se utiliza.

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
| M04 | Instancia/servicio dedicado para clientes de gran escala | **HIPÓTESIS — SIGUIENTE A DEFINIR** | Pendiente |
| M05 | Partner/reseller u otros esquemas de reventa | **HIPÓTESIS COMERCIAL** | Pendiente |

El registro puede ampliarse, fusionarse o descartar modelos sin modificar el producto hasta que exista una decisión explícita.

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

M03 reutiliza roles existentes, pero su implementación futura sí requeriría revisar qué capacidades de preparación hoy reservadas al Provider deben exponerse de forma segura a la Organización, especialmente Croquis/Builder y configuración avanzada.

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

Responde: **¿cómo se reparte el trabajo entre InvitacionesPremium y el cliente en este escenario?**

Ejemplos:

- M01: InvitacionesPremium prepara; Planner administra invitados; Staff opera accesos.
- M02: InvitacionesPremium prepara; Admin de Organización supervisa el salón; Planner asignado opera cada Evento; Staff opera accesos.
- M03: InvitacionesPremium mantiene la plataforma; Organización/Planner preparan y operan sus propios Eventos; Staff opera accesos.

### Condición comercial

Responde: **¿cómo se vende/cobra ese escenario?**

Ejemplos actuales pueden incluir Standard, Partner o Venue, pero esas condiciones no deben redefinir por sí mismas capacidades funcionales.

## 6. Regla de extensión

Un modelo posterior puede introducir una nueva necesidad funcional únicamente cuando no pueda representarse correctamente con:

- roles existentes;
- ownership/asignación existente;
- Organización existente;
- Staff temporal existente;
- superficies administrativas explícitas del Provider.

Antes de crear un nuevo rol persistido debe demostrarse:

1. que existe un actor humano distinto;
2. que necesita permisos distintos de todos los roles existentes;
3. que esa diferencia no se resuelve con ownership o asignación;
4. que el modelo comercial que lo requiere fue aprobado como escenario de producto.

## 7. Relación con pricing y finanzas

Esta serie documental no congela precios ni convierte hipótesis comerciales en contratos financieros.

Un mismo producto funcional puede venderse bajo condiciones comerciales diferentes sin cambiar sus capacidades. Por ejemplo, una Invitación Digital puede conservar el mismo RSVP, Mesas, QR y check-in aunque el comprador sea Standard o tenga una condición Partner.

Los cambios en precios, volumen, comisiones, margen o créditos deben revisarse posteriormente en sus contratos comerciales/financieros.

En particular, la palabra **licencia** en M03 describe el modelo operativo de autoservicio y no implica todavía mensualidad, anualidad, tarifa plana, Eventos ilimitados o una fórmula financiera específica.

## 8. Regla para agentes

Cuando una tarea mencione un nuevo tipo de cliente, partner, salón, agencia, reseller, licencia o instancia dedicada:

1. identificar primero qué modelo operativo representa;
2. leer este registro;
3. leer el documento especializado del modelo si existe;
4. comprobar si roles/ownership actuales ya lo resuelven;
5. no crear código hasta convertir el gap en una decisión explícita y ticket técnico.
