# Guía de port visual — UI legacy → producto canónico

Estado: **Dirección visual aprobada, implementación incremental**  
Repositorio destino: `ManuelRuiz27/invitacionespremium`  
Repositorio de referencia: `ManuelRuiz27/Soft-Monkey_InvitacionesPremium`

## 1. Objetivo

Rescatar del producto legacy la cualidad visual y ergonomía que resultan más agradables, sin rescatar su arquitectura, stack ni reglas de negocio.

La intención es que el producto canónico evolucione hacia una interfaz:

- premium;
- editorial;
- calmada;
- clara;
- con jerarquía fuerte;
- de baja carga cognitiva;
- adecuada para wedding planners y personal no técnico.

No se ejecutará un rediseño big-bang de toda la plataforma.

## 2. Fuente permitida

El legacy puede utilizarse como referencia para:

- shell y composición;
- densidad de información;
- espaciado;
- cards;
- navegación;
- relación entre canvas/paneles/contexto;
- jerarquía tipográfica;
- tratamiento premium de superficies;
- iconografía y microinteracciones;
- ergonomía del workspace.

Las reglas de `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md` siempre prevalecen.

## 3. Dirección estética

Referencia legacy útil: `docs/codex-ui-ux-pro-max-adapter.md`.

La dirección aprobada es:

- fondos cálidos tipo ivory/champagne/taupe en lugar de blancos fríos dominantes;
- acento premium sobrio, cercano a gold/brass y nunca estridente;
- bordes de bajo contraste;
- sombras suaves;
- cards limpias, con menos ruido decorativo;
- estados claros sin saturación innecesaria;
- iconografía consistente, sin emojis como controles;
- movimiento corto y funcional, respetando `prefers-reduced-motion`;
- titulares con carácter editorial cuando el design system lo permita;
- texto operativo en sans legible.

Los valores hex del legacy son **referencia**, no contrato literal. Deben traducirse a `designTokens`/theme del repo canónico y revisarse por contraste/accesibilidad.

## 4. Stack que se conserva

No migrar UI a otro stack sólo para conseguir la estética anterior.

Conservar como base:

- React + TypeScript actuales;
- MUI actual;
- theme/design tokens actuales;
- TanStack Query y contratos actuales;
- Konva/React Konva donde ya corresponda;
- patrones responsive del repo actual.

No adoptar por defecto:

- Tailwind;
- shadcn/ui;
- Radix;
- Zustand;
- Motion;
- dnd-kit;
- otras dependencias legacy.

Una dependencia nueva necesita una necesidad funcional concreta que no esté razonablemente cubierta por el stack vigente.

## 5. Regla de aplicación incremental

La dirección visual se aplica por feature al tocarla, no mediante una reescritura transversal.

Orden recomendado:

1. Croquis V2 Builder;
2. Seating Workspace relacionado;
3. superficies operator-led necesarias para piloto;
4. dashboard/event workspace si el piloto demuestra beneficio;
5. resto del producto sólo conforme entre en roadmap.

No gastar un sprint únicamente en uniformar pantallas fuera del camino crítico del piloto.

## 6. Principios de layout

### Jerarquía

Cada pantalla debe responder rápidamente:

- ¿dónde estoy?;
- ¿qué estado tiene el Evento?;
- ¿qué debo hacer ahora?;
- ¿qué está pendiente?;
- ¿cuál es la acción principal?.

### Densidad

- evitar dashboards llenos de KPIs sin acción asociada;
- priorizar información operativa;
- agrupar secundarios bajo progressive disclosure;
- usar whitespace para jerarquía, no para desperdiciar viewport;
- en workspaces, priorizar el objeto de trabajo sobre navegación global.

### Cards

Usar cards cuando representen agrupación conceptual o acción. No envolver cada texto en una card.

### Estados

Comunicar estado mediante combinación de copy, icono/forma y color. Nunca sólo color.

## 7. Tipografía

Dirección:

- display/títulos: serif editorial si ya existe una fuente compatible en el producto o se aprueba explícitamente;
- controles, datos, tablas, formularios y navegación: sans altamente legible.

No agregar fuentes externas sólo para imitar el legacy dentro de una tarea funcional pequeña.

## 8. Interacciones

- una acción primaria por contexto cuando sea posible;
- acciones destructivas separadas de las frecuentes;
- hover no puede ser la única forma de descubrir una acción requerida;
- touch targets adecuados en tablet/mobile;
- feedback inmediato tras guardar/mutar;
- evitar modales encadenados;
- mantener contexto mediante drawers/paneles cuando sea mejor que navegar fuera del workspace;
- lenguaje natural de Planner, no lenguaje técnico.

## 9. Croquis como primer caso de aplicación

Croquis V2 es el primer módulo donde esta dirección se considera objetivo explícito.

Para Croquis prevalecen:

- `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`;
- `docs/03-diseno/FLOORPLAN_UX_TARGET.md`.

La referencia legacy aporta composición y sensación visual; el Sticker Model y las fronteras Operator/Planner vienen del repo canónico.

## 10. Criterios de aceptación visual

Una feature intervenida debe:

- sentirse parte de un mismo sistema con el resto del repo canónico;
- reducir ruido frente a la versión previa;
- mostrar una jerarquía clara;
- no exponer conceptos técnicos innecesarios;
- conservar contraste y accesibilidad básica;
- funcionar en los breakpoints requeridos;
- no introducir dependencias visuales innecesarias;
- no cambiar reglas de negocio para acomodar el diseño;
- pasar regresión funcional existente.

## 11. Prohibiciones

- copiar CSS/componentes legacy de forma masiva;
- hardcodear la paleta legacy por todo el producto;
- crear un segundo design system;
- reemplazar MUI únicamente por preferencia estética;
- cambiar entidades/roles/estados para reproducir una pantalla antigua;
- tratar mocks legacy como contrato;
- hacer un rediseño total antes del piloto;
- sacrificar claridad operacional por estética.

## 12. Resultado esperado

El objetivo no es que `invitacionespremium` “se vea igual” al legacy.

El objetivo es conservar su mejor cualidad visual mientras se mantiene el motor más sólido del repo actual:

```text
calidad visual/ergonomía legacy
        +
arquitectura y contratos actuales
        +
scope operator-led
        =
InvitacionesPremium canónico
```