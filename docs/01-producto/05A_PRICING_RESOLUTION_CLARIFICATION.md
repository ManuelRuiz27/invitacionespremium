# 05A — Aclaración de resolución de pricing comercial

Estado: **Aclaración de producto para piloto comercial**  
Fecha: **24 agosto 2026**  
Alcance: resolver una ambigüedad entre PVP por capacidad y tarifa venue por volumen.

## 1. Origen

El contexto comercial aprobado define tres estructuras distintas:

- PVP público de QR/EventOps, Flyer y Flipbook por capacidad (`hasta 50`, `hasta 100`, `hasta 150`);
- precio partner Planner/agencia explícito para el caso de hasta 100 invitaciones;
- precio venue QR/EventOps por cantidad de Eventos efectivos al mes, sin una segunda tabla por capacidad.

Por tanto, no es correcto forzar una fórmula universal `SKU + bracket + canal + tier` si la fuente comercial no definió todos esos cruces.

Esta aclaración prevalece sobre la redacción general de selección de precio de `05_MODELO_COMERCIAL_PRICING_Y_OPERACION.md` cuando exista contradicción.

## 2. Regla standard / PVP

Para un Cliente sin tarifa comercial específica:

`SKU + bracket de capacidad + vigencia`

Brackets vigentes:

- 1–50;
- 51–100;
- 101–150.

Se aplican los PVP configurados y normalizados al sistema de créditos vigente.

## 3. Regla Planner / agencia

Partner pricing es una tarifa de canal explícita, no una Promotion.

Durante piloto:

- existe hipótesis aprobada para hasta 100 invitaciones;
- no se infiere automáticamente un porcentaje de descuento para 1–50 o 101–150;
- si no existe una tarifa partner explícita para el caso solicitado, el sistema no debe fabricar una;
- el precio standard/PVP puede seguir existiendo como alternativa comercial, pero no debe presentarse como “precio partner” calculado.

Resolver conceptualmente por:

`SKU + tarifa partner explícita aplicable + vigencia`

La capacidad sigue siendo dato del Evento y puede limitar la elegibilidad de una entrada partner concreta, pero no autoriza derivar precios no aprobados.

## 4. Regla venue

Durante piloto, la tabla comercial aprobada de Venue para QR/EventOps es **precio por Evento según volumen mensual**, no precio por capacidad.

Resolver por:

`QR/EventOps + tier venue + vigencia`

Tier del mes `M` según Eventos efectivamente cobrados del mes calendario `M-1`:

- 1–2;
- 3–5;
- 6–10;
- 11+.

El límite general MVP de 150 personas continúa vigente, pero no se crea una matriz venue `tier × bracket` sin una decisión comercial posterior.

No hay repricing retroactivo al cruzar un tier.

## 5. Jerarquía por canal

1. Identificar SKU.
2. Resolver canal comercial explícito del Cliente.
3. Si no hay canal/tarifa específica: usar resolver standard por bracket.
4. Si es Planner/agencia: buscar únicamente tarifa partner explícita aplicable; no inferir descuento ausente.
5. Si es Venue y SKU es QR/EventOps: resolver tier por volumen efectivo M-1 y aplicar precio venue vigente.
6. Aplicar Promotion sólo después del precio base si es elegible y permite stacking.
7. Conservar snapshot del precio final y de la regla aplicada.

`ClientType` nunca sustituye al canal comercial.

## 6. Implicación para implementación

El modelo de pricing debe admitir reglas comerciales con dimensiones diferentes por canal; no debe obligar a llenar combinaciones artificiales sólo para satisfacer una tabla rígida.

Cualquier implementación que requiera inventar un precio partner no aprobado o un precio venue por capacidad debe detenerse y solicitar decisión de producto.