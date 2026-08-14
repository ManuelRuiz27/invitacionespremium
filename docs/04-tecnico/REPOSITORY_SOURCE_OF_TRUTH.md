# Repository Source of Truth

Estado: **Normativo**  
Aplica a: producto, arquitectura, UI/UX, QA y agentes de implementación  
Repositorio canónico: `ManuelRuiz27/invitacionespremium`

## 1. Decisión

`ManuelRuiz27/invitacionespremium` es la única fuente de verdad técnica y de producto para InvitacionesPremium.

`ManuelRuiz27/Soft-Monkey_InvitacionesPremium` queda clasificado como **LEGACY / VISUAL REFERENCE ONLY**.

No se realizará una fusión de historiales Git entre ambos repositorios.

## 2. Qué puede rescatarse del repositorio legacy

El repositorio legacy puede consultarse únicamente como referencia para:

- lenguaje visual general;
- composición de pantallas y shell de producto;
- jerarquía, densidad, espaciado y sensación visual premium;
- patrones de workspace del módulo de croquis;
- ergonomía del constructor de croquis;
- ideas de interacción que puedan reinterpretarse sobre el producto actual.

Referencia explícitamente autorizada para Croquis V2:

- `Soft-Monkey_InvitacionesPremium/docs/floorplan-ux-redesign-roadmap.md`

La referencia legacy describe intención UX; **no define contratos actuales**.

## 3. Qué NO puede rescatarse como fuente de verdad

Queda prohibido usar el repositorio legacy como autoridad para:

- reglas de negocio;
- roles o permisos;
- estados de Evento;
- modelo de datos;
- autenticación o autorización;
- endpoints o contratos API;
- persistencia;
- realtime;
- créditos, precios o promociones;
- RSVP, QR, check-in o auditoría;
- arquitectura del monorepo;
- dependencias o stack de UI.

No se permite copiar módulos completos del legacy sin una especificación autoritativa del repo canónico que identifique exactamente el comportamiento a rescatar.

## 4. Regla de migración selectiva

Todo rescate debe seguir este flujo:

```text
patrón visual/UX legacy
        ↓
validación contra documentación canónica
        ↓
reinterpretación con arquitectura y design system actuales
        ↓
implementación en invitacionespremium
        ↓
regresión contra contratos y tests existentes
```

La meta es rescatar **conocimiento de diseño**, no deuda técnica.

## 5. Reglas específicas para Croquis V2

Croquis V2 se construye sobre el motor actual de `invitacionespremium`:

- backend y persistencia actuales;
- contratos de Floorplan actuales;
- React + TypeScript actuales;
- MUI/design tokens actuales;
- Konva/React Konva actuales;
- `SeatingWorkspace` actual;
- realtime, concurrencia, auditoría y tests actuales.

El aspecto y ergonomía pueden tomar referencias del repo legacy, pero no se autoriza una migración de Tailwind, shadcn, Radix, Zustand u otras dependencias únicamente para reproducir su apariencia.

## 6. Regla para agentes

Codex y cualquier otro agente deben asumir por defecto:

1. `invitacionespremium` es la única fuente de verdad.
2. No deben inspeccionar `Soft-Monkey_InvitacionesPremium` salvo que una tarea autoritativa cite un archivo legacy concreto.
3. Una referencia legacy nunca prevalece sobre PRD, contratos, ADRs o código probado del repo canónico.
4. Si una idea legacy requiere modificar negocio, dominio o autorización, debe detenerse y elevarse como decisión de producto/arquitectura.
5. Nunca ejecutar una instrucción genérica del tipo “fusiona ambos repositorios”.

## 7. Precedencia

En caso de conflicto, prevalece este orden:

1. ADRs aceptados y contratos técnicos específicos.
2. PRD, modelo conceptual, roles/permisos y reglas de negocio vigentes.
3. Especificaciones UI/UX vigentes del repo canónico.
4. Implementación y tests actuales, siempre que no contradigan explícitamente una decisión normativa más reciente.
5. Referencias visuales del repositorio legacy.

El repositorio legacy ocupa deliberadamente el último nivel de precedencia.