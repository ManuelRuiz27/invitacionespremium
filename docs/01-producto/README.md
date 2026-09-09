# Producto — cómo leer esta carpeta

Estado: **GUÍA DE CLASIFICACIÓN**

Antes de usar cualquier documento de esta carpeta, leer:

1. `../00-inicio/00_START_HERE.md`
2. `../00-inicio/01_DIRECCION_ACTUAL_M01_MANAGED.md`

## ACTIVE — lanzamiento actual

- `02_PRD.md` — sólo reglas no sustituidas por dirección posterior.
- `03_ROLES_PERMISOS_ACCESO.md`.
- `04_OPERATOR_LED_MVP.md`.
- `06A_MODELO_01_PLANNER_INDEPENDIENTE.md`.
- `ACCESS_MATRIX.md`.
- `ACCESS_MATRIX_OPERATOR_LED_ADDENDUM.md`.

La dirección vigente es **M01 Managed para Planner independiente**.

## REFERENCE FUTURE — no autoriza code ahora

- `06_MODELOS_OPERATIVOS_DE_VENTA.md` — registro de modelos, no roadmap activo.
- `06B_MODELO_02_SALON_JARDIN_ORGANIZACION.md` — M02.
- `06C_MODELO_03_LICENCIA_AUTOSERVICIO.md` — M03 / Self-Service.
- `06D_MODELO_04_CLIENTE_GRAN_ESCALA_DEDICADO.md` — M04.
- `06E_MODELO_05_PARTNER_RESELLER.md` — M05.
- `06F_MATRIZ_CAPACIDADES_GAPS_MODELOS.md` — archaeology/gap analysis; sus gaps no son backlog automático.

Aunque un archivo diga “aprobado” o describa una extensión futura, **eso no significa autorizado para implementación durante Managed Profile V1**.

## COMMERCIAL / FINANCE — runtime existente, no dirección de capability

- `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`.
- `05A_PRICING_RESOLUTION_CLARIFICATION.md`.
- `05B_LANDING_COMMERCIAL_SALES_CONTRACT.md`.

Estas fuentes son necesarias para mantener compatibilidad con Pricing/Finance ya implementado. No deben usarse para decidir si un Planner Managed puede crear Eventos, editar Invitación, construir Croquis o activar capacidades técnicas.

No usar como capability profile:

- `CommercialChannel`;
- Partner;
- Venue;
- pricing;
- créditos;
- tarifa.

## Regla práctica

Si una tarea propone comportamiento para M02–M05 o Commercial/Finance que no es estrictamente necesario para preservar el runtime actual, clasificarlo como **OUT OF CURRENT LAUNCH SCOPE** salvo ticket explícito.
