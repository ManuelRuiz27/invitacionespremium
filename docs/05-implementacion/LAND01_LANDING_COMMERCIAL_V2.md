# LAND-01 — Landing comercial V2 por SKU y canal

Estado: **READY FOR CODE**  
Ticket: **#40**  
Dependencias: GOV-COM-01 y COM-01 completados.

## 1. Objetivo técnico

Adaptar `apps/landing` al contrato comercial vigente sin rediseñar el design system ni duplicar el Price Book.

La landing debe vender el producto de lanzamiento como **servicio gestionado de logística digital de invitados y operación de Eventos** y presentar:

- QR / EventOps;
- Flyer;
- Flipbook;
- PVP Standard por capacidad obtenido desde `GET /api/v1/public/pricing`;
- Planner/agencia como canal partner;
- Venue como canal recurrente;
- registro público de Planner como acción distinta de solicitar condiciones partner.

## 2. Restricciones

- No tocar Pricing V2 backend salvo regresión demostrada.
- No crear un segundo endpoint de pricing.
- No hardcodear precios productivos en `landing-config.ts`, componentes o tests.
- No añadir React Query sólo para esta landing.
- No crear el lead form B2B de LAND-02.
- No convertir Venue en registro de Organization.
- No publicar wholesale Partner.
- No publicar matriz Venue completa; sólo copy comercial permitido por `05B`.
- No prometer RSVP/Álbum para QR/EventOps.
- No rediseñar `landing-theme.ts` ni primitives salvo adaptación mínima de accesibilidad.

## 3. Fuente de pricing

Reutilizar `createPublicPricingApiClient()` de `@invitaciones/api-client`.

Crear `apps/landing/src/pricing-client.ts`:

- `createLandingPricingClient()` usa `getLandingConfig().urls.apiBaseUrl`;
- si no existe API base devuelve `undefined`;
- delega a `createPublicPricingApiClient({ baseUrl })`;
- no envía cookies; esa garantía ya vive en el API client.

Crear `apps/landing/src/use-public-pricing.ts`:

- hook focalizado con `useEffect` + `AbortController`;
- estados: `loading`, `ready`, `error`, `unavailable`;
- una carga por montaje;
- cleanup abort al desmontar;
- sin retry loop;
- no persiste precios en localStorage/sessionStorage;
- no contiene fallback numérico.

El precio público recibido es autoritativo. La landing puede ordenar/proyectar la respuesta, pero no recalcular reglas comerciales.

## 4. `landing-config.ts`

Eliminar de `services.items`:

- `prices.planner`;
- `prices.organization`;
- toda cifra productiva $600/$400/$300 y equivalentes históricas.

Eliminar de `pricing` la arquitectura:

- `planner`;
- `organization`.

Mantener sólo contenido estático: nombres públicos, copy, features, CTAs, límites y equivalencia secundaria `1 crédito = $20 MXN` si se conserva en FAQ/nota.

Servicios públicos pagados exactos:

### PHYSICAL_QR — QR / EventOps

Comunicar:
- control de acceso QR;
- Staff/Scanner;
- Croquis/Mesas cuando aplique;
- reporte operativo;
- sin diseño personalizado de Invitación;
- sin Álbum;
- sin RSVP público digital en este corte.

### FLYER — Flyer

Comunicar:
- diseño personalizado de dos piezas principales;
- RSVP;
- gestión de invitados;
- Croquis/Mesas opcional;
- QR/check-in;
- Álbum;
- hasta dos rondas consolidadas de cambios.

### FLIPBOOK — Flipbook

Comunicar:
- diseño personalizado de hasta 10 páginas;
- RSVP;
- gestión de invitados;
- Croquis/Mesas opcional;
- QR/check-in;
- Álbum;
- hasta dos rondas consolidadas de cambios.

DEMO permanece sólo como recorrido visual; eliminarlo de `services.items` para que no compita como cuarto SKU pagado.

## 5. `LandingPricing.tsx`

Reescribir el componente. No adaptar la tabla Planner/Organization existente.

Props recomendadas:

```ts
interface LandingPricingProps {
  pricing?: PublicPricing[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}
```

`App` puede usar un contenedor/hook y pasar estado; alternativamente `LandingPricing` puede consumir el hook directamente. Elegir una sola fuente de fetch.

Render autoritativo:

- filas: QR / EventOps, Flyer, Flipbook;
- columnas: Hasta 50, Hasta 100, Hasta 150;
- precio protagonista: MXN derivado de `amountMxnCents` de API;
- créditos: texto secundario con `credits` de API;
- ordenar brackets por `capacityMax`;
- mapear `PHYSICAL_QR` a `QR / EventOps`;
- no usar `ClientType` ni `commercialChannel` en la UI pública.

Validación de proyección antes de render:

- exactamente los tres SKU públicos esperados;
- para cada SKU deben existir brackets 1–50, 51–100, 101–150;
- no aceptar duplicados por `serviceCode + capacityMin + capacityMax`;
- no inventar una celda faltante.

Si payload incompleto:

- mostrar estado de precios no disponibles;
- no renderizar una matriz parcial como si fuera completa;
- permitir `Reintentar`;
- conservar CTA a la sección comercial/Planner donde corresponda;
- nunca usar números fallback.

## 6. `App.tsx`

Conservar estructura visual general y lazy loading de Demo/registro.

Orden recomendado:

1. Header
2. Hero
3. Problem
4. Solution
5. Services
6. Pricing
7. Planners
8. Venue
9. Demo visual
10. FAQ
11. CTA final
12. Footer

Mover Demo si es necesario para que no parezca un SKU principal.

Reemplazar `LandingOrganizations` por `LandingVenue` o convertir el componente existente y renombrarlo si el diff sigue siendo claro. Preferencia: **crear `LandingVenue.tsx` y retirar `LandingOrganizations.tsx`** para eliminar el framing interno de roles del mensaje comercial.

## 7. Header / Hero / CTA

### Header

`LandingHeader.tsx`:

Nav público recomendado:
- Servicios
- Precios
- Planners
- Venues
- Demo
- FAQ

Acciones:
- `Iniciar sesión` se conserva;
- registro Planner se conserva como acción secundaria/operativa;
- no presentar `Registrarme` como única conversión comercial.

LAND-01 todavía no tiene lead B2B persistente; por tanto CTAs Partner/Venue deben navegar a su sección y comunicar que el contacto comercial se habilita en el siguiente paso, sin construir un formulario ficticio.

### Hero

`LandingHero.tsx`:

Headline conforme a `05B`:

`InvitacionesPremium gestiona la infraestructura digital de tu Evento para que tú mantengas el control de tus invitados y operación.`

El CTA principal debe llevar a `#precios` (`Cotizar mi Evento` o `Ver precios`) mediante `scrollToLandingSection`, no abrir registro Planner.

CTA secundario puede ser `Conocer opciones para Planners` y llevar a `#planners`, o `Iniciar sesión` si el layout conserva tres acciones de forma accesible. No meter un tercer CTA si rompe jerarquía visual.

### CTA final

`LandingCta.tsx` deja de ser registro Planner universal.

Debe ofrecer:
- estándar: volver a precios;
- Planner: sección partner/registro;
- Venue: sección Venue.

No inventar formulario LAND-02.

## 8. Planner / Partner

`LandingPlanners.tsx` cambia su propuesta central.

Debe explicar:
- Provider prepara infraestructura técnica;
- Planner conserva cliente, invitados, seguimiento RSVP, Seating y operación de Staff;
- existen condiciones/tarifas Partner explícitas;
- registrarse como Planner NO asigna automáticamente tarifa Partner.

CTAs:
- principal de canal: `Conocer condiciones para Planners` o `Quiero trabajar como Planner partner`;
- secundario: `Crear cuenta de Planner` abre el modal existente.

Como LAND-02 todavía no existe, el CTA Partner puede mostrar/navegar a una nota clara de “solicitud comercial próximamente” o usar un destino comercial existente sólo si está configurado realmente. No inventar mailto/WhatsApp.

## 9. Venue

Crear `apps/landing/src/components/LandingVenue.tsx`.

Debe sustituir la sección que hoy explica roles internos de Organization.

Contenido:
- operación recurrente;
- QR/EventOps;
- Staff/Scanner;
- Croquis/Mesas cuando aplique;
- reportes;
- el costo por Evento puede bajar según volumen efectivo del mes anterior;
- `desde $1,800 MXN por Evento` sólo puede aparecer si se deriva de una fuente autorizada.

LAND-01 no dispone de pricing Venue público en `/public/pricing`; por tanto **no hardcodear $1,800**. Comunicar sólo “tarifas por volumen disponibles” hasta LAND-02/otra proyección autorizada.

CTA:
`Solicitar propuesta para mi venue`.

Hasta LAND-02, el CTA debe ser semánticamente visible pero no crear Organization ni abrir registro Planner. Puede marcarse como próximo flujo comercial o navegar al CTA final; no usar botón muerto sin explicación.

## 10. FAQ / Footer / metadata

`LandingFaq.tsx` usa copy de config.

Actualizar FAQ para dejar explícito:
- precio Standard depende de SKU + capacidad, no ClientType;
- créditos son unidad secundaria, 1 crédito = $20 MXN;
- Planner registration != Partner pricing;
- Venue no tiene registro público;
- QR/EventOps no incluye RSVP público ni Álbum;
- máximo MVP 150 invitados y 3 Staff activos.

`LandingFooter.tsx`:
- eliminar “Plataforma SaaS” del legal/brand copy si aparece;
- usar servicio gestionado/operación digital.

`app-metadata.ts` / config SEO:
- title/description deben vender operación digital gestionada;
- no “SaaS para Planners y Organizaciones”.

## 11. Problem / Solution / Demo

Revisar copy, sin reescritura visual.

`LandingProblem.tsx` puede conservar estructura si no promete self-service.

`LandingSolution.tsx` debe explicar separación Provider/Planner:
- InvitacionesPremium prepara infraestructura/diseño/croquis técnico;
- Planner/cliente opera invitados, confirmaciones, Seating y día del Evento.

`LandingDemoMock.tsx` permanece simulación visual y no cuarto SKU.

## 12. Registro Planner

`RegisterPlannerModal.tsx` y `registration-client.ts` se reutilizan.

No cambiar semántica:
- crea `ClientType.PLANNER` Standard inicialmente;
- no promete ni asigna `PARTNER`.

Actualizar únicamente copy circundante si hoy induce “registro = precio Planner”.

## 13. Pruebas

Actualizar/agregar tests de Landing para probar como mínimo:

### Config/copy
- no contiene `prices.planner` / `prices.organization`;
- no contiene $600/$400/$300 como oferta;
- no contiene “Plataforma SaaS” como posicionamiento;
- servicios pagados son exactamente PHYSICAL_QR, FLYER, FLIPBOOK;
- DEMO no está en lista de productos pagados.

### Pricing adapter/hook
- usa `createPublicPricingApiClient`;
- API base ausente => estado unavailable, no throw global;
- abort al unmount;
- error => no fallback;
- payload completo produce matriz 3×3;
- payload incompleto/duplicado => estado inválido, no matriz parcial.

### Pricing UI
- $2,500/$3,000/$3,500 cuando fixtures API contienen esos valores;
- $4,500/$5,500/$6,500 para Flyer;
- $6,000/$7,000/$8,000 para Flipbook;
- los números deben estar en **fixtures de respuesta API de test**, no en config productiva;
- créditos aparecen secundarios;
- no aparecen columnas Planner/Organization.

### Canal
- Planner copy distingue Partner de registro;
- registro existente abre modal y sigue funcionando;
- Venue no dispara registro Planner;
- QR/EventOps no contiene RSVP/Álbum;
- Flyer/Flipbook contienen dos rondas consolidadas.

### Navigation/accessibility
- links Header apuntan a secciones existentes;
- CTA Hero navega a precios;
- mobile Drawer conserva navegación/registro/login;
- headings/aria-labelledby continúan correctos.

### Metadata
- SEO comercial actualizado;
- canonical/OG actuales se preservan.

## 14. QA

Ejecutar:

```bash
pnpm --filter @invitaciones/landing test
pnpm --filter @invitaciones/landing lint
pnpm --filter @invitaciones/landing typecheck
pnpm --filter @invitaciones/landing build
pnpm --filter @invitaciones/api-client test
pnpm --filter @invitaciones/api-client typecheck
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
git diff --check
```

No modificar los cinco archivos Prettier baseline ajenos salvo `LandingEyebrow.tsx` si LAND-01 necesita tocarlo funcionalmente. Si no hay necesidad funcional, no limpiarlo en este ticket.

## 15. DoD

LAND-01 está completo cuando:

1. la landing vende servicio gestionado, no self-service SaaS;
2. muestra exactamente QR/EventOps, Flyer y Flipbook;
3. el PVP visible viene del endpoint público Pricing V2;
4. ninguna cifra productiva vive duplicada en `landing-config.ts`;
5. no existe matriz Planner vs Organization;
6. Planner y Venue tienen propuestas de canal separadas;
7. registro Planner no se presenta como Partner automático;
8. Venue no se registra como Organization;
9. Demo no compite como SKU pagado;
10. mobile, accesibilidad, metadata y registro Planner pasan sus regresiones.