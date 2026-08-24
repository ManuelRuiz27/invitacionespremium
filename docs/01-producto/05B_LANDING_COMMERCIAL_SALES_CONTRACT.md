# 05B — Landing comercial y funnel de venta

Estado: **Decisión de producto para piloto comercial**  
Fecha: **24 agosto 2026**  
Alcance: posicionamiento público, presentación de SKU/precios, conversión Planner/agencia y Venue, y límites de lo que la landing puede prometer.

## 1. Objetivo

La landing deja de presentar InvitacionesPremium principalmente como una plataforma SaaS autogestionada y pasa a presentar el producto de lanzamiento como **servicio gestionado de logística digital de invitados y operación de Eventos**.

La landing debe explicar con claridad:

1. qué problema operativo resolvemos;
2. qué SKU existen;
3. qué incluye cada SKU;
4. cuánto cuesta el servicio estándar según capacidad;
5. que Planner/agencia y Venue son canales comerciales distintos, no productos distintos;
6. cómo se inicia una relación comercial según el canal;
7. qué partes opera InvitacionesPremium y qué partes conserva Planner/cliente.

Este contrato se subordina a:

- `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md`;
- `05A_PRICING_RESOLUTION_CLARIFICATION.md`.

## 2. Gap actual

La landing vigente en `apps/landing` presenta:

- tagline de “Plataforma SaaS”;
- hero centrado en autogestión;
- precios históricos de Flipbook 30 cr, Flyer 20 cr y QR 15 cr para Planner;
- una segunda columna de precio por `Organization`;
- `Planner independiente` vs `Organización` como arquitectura principal de pricing;
- FAQ que afirma que el costo depende del tipo de Cliente;
- CTA principal orientado casi exclusivamente a registro Planner.

Ese modelo contradice las nuevas reglas comerciales y no debe llegar al piloto comercial.

## 3. Regla de posicionamiento

Mensaje principal recomendado:

> InvitacionesPremium gestiona la infraestructura digital de tu Evento para que tú mantengas el control de tus invitados y operación.

Conceptos que deben dominar el copy:

- invitados;
- confirmaciones;
- Mesas;
- acceso QR;
- check-in;
- operación;
- servicio gestionado;
- soporte del Provider.

Evitar como headline principal:

- “SaaS”;
- “diseña tú mismo”;
- “configura todo”; 
- mensajes que impliquen que Planner construye Invitación/Croquis técnico durante el perfil operator-led.

## 4. Arquitectura pública de oferta

La landing muestra tres SKU:

### QR / EventOps

Enfocado a control de acceso y operación digital.

Comunicar:

- QR / control de acceso;
- Staff/Scanner;
- Croquis/Mesas cuando aplique;
- reporte operativo;
- sin diseño personalizado de Invitación;
- sin Álbum;
- sin RSVP público digital en el perfil inicial.

### Flyer

Comunicar:

- diseño personalizado de dos piezas principales;
- RSVP;
- gestión de invitados;
- Croquis/Mesas opcional;
- QR/check-in;
- Álbum;
- hasta dos rondas consolidadas de cambios incluidas.

### Flipbook

Comunicar:

- diseño personalizado de hasta 10 páginas;
- RSVP;
- gestión de invitados;
- Croquis/Mesas opcional;
- QR/check-in;
- Álbum;
- hasta dos rondas consolidadas de cambios incluidas.

`DEMO` no debe competir visualmente como cuarto producto pagado. Puede mantenerse como recorrido visual o CTA secundario.

## 5. Pricing público

### 5.1 Regla de presentación

La landing pública vende en **MXN**.

Los créditos continúan como unidad financiera interna/contractual del sistema, pero no deben ser la unidad protagonista del pricing público.

La equivalencia `1 crédito = $20 MXN` puede permanecer en FAQ o detalle secundario para clientes registrados, pero no debe dominar la decisión de compra.

### 5.2 PVP estándar visible

Mostrar tabla/matriz por capacidad:

| SKU | Hasta 50 | Hasta 100 | Hasta 150 |
| --- | ---: | ---: | ---: |
| QR / EventOps | $2,500 | $3,000 | $3,500 |
| Flyer | $4,500 | $5,500 | $6,500 |
| Flipbook | $6,000 | $7,000 | $8,000 |

Los importes deben provenir de una fuente pública derivada del price book autoritativo de Pricing V2, no de números duplicados permanentemente en componentes React.

Hasta que COM-01 exista, la landing comercial V2 no debe publicarse con precios dinámicos simulados.

## 6. Canal Planner / agencia

La sección Planner deja de vender “registro + créditos propios” como propuesta central y pasa a vender una **alianza de reventa/operación**.

Debe comunicar:

- InvitacionesPremium prepara infraestructura técnica;
- Planner conserva relación con cliente, invitados, RSVP operativo, Seating y Staff;
- puede existir tarifa partner explícita;
- PVP sugerido no obliga el precio final de reventa;
- las tarifas partner no deben inferirse para brackets que no tengan precio aprobado.

### Publicación de tarifa partner

Durante piloto, la landing **no necesita publicar el wholesale completo de forma anónima**.

Puede comunicar:

- “Tarifas partner disponibles para Planners/agencias”; 
- “Solicita condiciones partner”; 
- margen/oportunidad comercial en copy general sin prometer porcentajes permanentes.

La tarifa partner aprobada de hasta 100 puede mostrarse únicamente si Product/Marketing decide hacerla pública en el ticket de implementación. La ausencia de publicación no cambia el motor de pricing.

### Registro

El registro público de Planner independiente se conserva.

Pero registrarse como `ClientType.PLANNER` **no garantiza automáticamente tarifa partner**. La clasificación de canal/precio comercial pertenece a Pricing V2 y debe ser explícita.

La landing no debe prometer “regístrate y recibe descuento partner automático”.

## 7. Canal Venue / salón / jardín

Debe existir una sección comercial específica para Venue, separada de la explicación interna de roles de Organización.

Propuesta de valor:

- operación repetible;
- QR/EventOps;
- acceso ágil;
- Staff/Scanner;
- Croquis/Mesas cuando aplique;
- reportes;
- menor costo por volumen efectivo.

Puede comunicar públicamente:

- que existen tiers por volumen mensual efectivo;
- que el precio disminuye conforme al volumen real;
- referencia “desde $1,800 MXN por Evento” si el price book vigente mantiene ese mínimo.

No debe prometer:

- descuento por volumen declarado;
- repricing retroactivo;
- tarifa garantizada sin clasificación/tier;
- registro público de Organización.

Las Organizaciones/Venues continúan siendo creadas de forma administrada por Platform Admin.

## 8. Conversión por canal

La landing necesita tres rutas de conversión claras:

### Evento / precio estándar

CTA sugerido:

- `Cotizar mi Evento`
- o `Ver precios`

Puede llevar a pricing y posteriormente al flujo comercial definido.

### Planner / agencia

CTA principal de canal:

- `Quiero trabajar como Planner partner`
- o `Conocer condiciones para Planners`

CTA secundario:

- `Crear cuenta de Planner`

### Venue

CTA principal:

- `Solicitar propuesta para mi venue`
- o `Cotizar operación recurrente`

No dirigir Venue a `Registrarme como Planner`.

## 9. Lead capture B2B

Para evitar un CTA Venue sin salida, se autoriza un intake comercial mínimo separado del registro de usuario.

Campos mínimos propuestos:

- nombre de contacto;
- nombre comercial/venue/agencia;
- tipo de oportunidad: Planner/agencia o Venue;
- email;
- teléfono/WhatsApp opcional;
- Eventos estimados por mes opcional;
- mensaje/notas opcional;
- aceptación del aviso de privacidad cuando corresponda.

Reglas:

- no crear automáticamente Client/User/Event;
- no otorgar tarifa partner/venue automáticamente;
- no almacenar datos sensibles;
- rate limit/anti-spam mínimo;
- acceso de lectura restringido a Platform Admin;
- la conversión posterior a Client ocurre mediante proceso administrativo explícito.

Durante piloto no se requiere CRM externo ni WhatsApp API.

## 10. Secciones de landing que deben cambiar

Revisar como mínimo:

- SEO title/description;
- Header/nav;
- Hero;
- Problem/Solution;
- Services;
- Pricing;
- Planners;
- Organizations → evolucionar a Venue/Organizations comercial;
- FAQ;
- CTA final;
- Footer;
- Demo copy cuando prometa capacidades que varían por SKU.

La estructura visual actual puede reutilizarse. No se autoriza una reescritura total del design system.

## 11. Componentes/rutas actuales a adaptar

Base de implementación conocida:

- `apps/landing/src/config/landing-config.ts`;
- `LandingHero.tsx`;
- `LandingServices.tsx`;
- `LandingPricing.tsx`;
- `LandingPlanners.tsx`;
- `LandingOrganizations.tsx`;
- `LandingFaq.tsx`;
- `LandingCta.tsx`;
- `LandingHeader.tsx`;
- `App.tsx`;
- tests/metadata/navigation existentes.

`LandingPricing.tsx` debe dejar de renderizar una matriz `Planner vs Organization`.

## 12. Public pricing source

El endpoint actual `GET /api/v1/services` requiere sesión Planner/Organization y no es apropiado como fuente pública de precios.

COM-01 o LAND-01 deben proporcionar una proyección pública read-only que exponga únicamente información comercial pública necesaria, por ejemplo:

- SKU;
- nombre público;
- brackets PVP vigentes;
- MXN;
- vigencia/publication metadata mínima.

No exponer por endpoint público:

- líneas de crédito;
- deuda;
- pricing interno no publicado;
- wholesale partner salvo decisión expresa;
- overrides privados;
- cálculos internos de margen/COGS.

## 13. QA/UAT de landing

Validar:

- no aparecen precios históricos 600/400/300 como oferta vigente;
- no existe tabla Planner vs Organization como selector base;
- PVP estándar coincide con Pricing V2;
- copy no promete self-service técnico al Planner;
- QR/EventOps no promete RSVP/Álbum;
- Flyer/Flipbook sí comunican diseño y rondas incluidas;
- registro Planner sigue funcionando;
- Venue tiene CTA propio;
- lead B2B no crea cuenta/Cliente automáticamente;
- mobile/desktop;
- SEO/metadata;
- accesibilidad;
- no hardcode productivo divergente del price book.

## 14. Criterio de éxito

La landing debe permitir que un visitante entienda en menos de un recorrido:

1. qué vendemos;
2. cuál SKU necesita;
3. cuánto cuesta el servicio estándar;
4. qué cambia si es Planner/agencia;
5. qué cambia si es Venue;
6. cuál es el siguiente paso comercial correcto para su canal.
