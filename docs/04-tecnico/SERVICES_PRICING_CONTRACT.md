# Contrato de servicios, Pricing V2 y promociones

## Alcance

`ServicesPricingModule`, dentro de `apps/api`, es la fuente de verdad del catálogo, el Price Book histórico y la elegibilidad de promociones. Los únicos `ServiceCode` son `FLIPBOOK`, `FLYER`, `PHYSICAL_QR` y `DEMO`.

`ClientType` (`PLANNER`/`ORGANIZATION`) sigue siendo identidad de cuenta y autorización. No selecciona tarifa. `Client.commercialChannel` es nullable y solo Platform Admin puede modificarlo:

- `null` o `STANDARD`: Estándar / PVP;
- `PARTNER`: Planner / agencia partner;
- `VENUE`: Venue recurrente.

Una cuenta de cualquier `ClientType` puede pertenecer a cualquiera de esos canales. Los endpoints propios del tenant no aceptan `commercialChannel`.

## ServicePrice compatible

`ServicePrice` conserva su `id` y la FK restrictiva usada por `Event.activatedServicePriceId`.

- V1 histórica: `pricingVersion=1`, `clientType` presente y todas las dimensiones V2 ausentes.
- V2 vigente: `pricingVersion=2`, `clientType=null`, `commercialChannel` presente.
- STANDARD/PARTNER: `capacityMin` y `capacityMax` presentes; `venueTier` ausente.
- VENUE: `venueTier` presente; capacidades ausentes; solo `PHYSICAL_QR`.

Toda fila conserva `credits`, `[validFrom, validUntil)`, `createdAt` y `updatedAt`. Los créditos son enteros no negativos. Un precio cerrado no se edita ni elimina por API; `PATCH /admin/prices/:priceId` solo fija el límite superior preservando historia transcurrida.

PostgreSQL valida forma V1/V2, rango `1..150`, vigencia, DEMO en cero y Venue exclusivo de `PHYSICAL_QR`. Exclusiones GiST separadas impiden solapamientos temporales del mismo rango aplicable o del mismo tier. Las filas V1 no se reinterpretan como canales comerciales.

## Resolución autoritativa

La operación interna recibe `clientId`, `serviceCode`, capacidad e instante. Relee `Client.commercialChannel` dentro de la misma transacción; ningún caller puede declarar un canal alterno.

1. Sin clasificación explícita resuelve STANDARD por rango.
2. PARTNER resuelve únicamente una regla explícita que cubra la capacidad; no cae silenciosamente a STANDARD.
3. VENUE solo admite `PHYSICAL_QR`, calcula volumen efectivo M-1 y resuelve el tier.
4. La vigencia es `validFrom <= at AND (validUntil IS NULL OR at < validUntil)`.
5. Debe existir exactamente una fila V2 aplicable; si no, responde `CURRENT_PRICE_NOT_FOUND` o un error de dominio más específico.

Capacidad nula, menor que 1 o mayor que 150 no tiene precio STANDARD/PARTNER. `GET /services` devuelve descubrimiento de servicios y `priceRules[]`; ya no fabrica un único `credits`. El frontend puede proyectar el costo, pero activación vuelve a resolverlo autoritativamente.

## Venue M-1

El corte usa meses calendario en `America/Mexico_City`, zona operativa del piloto mientras no exista timezone comercial persistido por Cliente. No usa rolling 30 days.

Cuenta Eventos del mismo Cliente cuya `activatedAt` pertenece a M-1, con servicio no DEMO y movimiento real `EVENT_ACTIVATION_CHARGE` o `CREDIT_LINE_USAGE`. Un Evento queda excluido solo cuando movimientos `EVENT_CREDIT_REFUND` no revertidos restituyen al menos `finalCostCredits`; un reembolso parcial sigue contando. No se persiste un segundo flag de refund o volumen.

Tiers: `ONE_TO_TWO` (0–2), `THREE_TO_FIVE` (3–5), `SIX_TO_TEN` (6–10), `ELEVEN_PLUS` (11+). El tier de M queda fijado por M-1; no repricia activaciones existentes.

## Bootstrap

La migración `20260824180000_add_commercial_pricing_v2` conserva V1, cierra sus vigencias abiertas al despliegue y crea 16 filas V2: nueve STANDARD, tres PARTNER hasta 100 y cuatro VENUE para `PHYSICAL_QR`. El seed `services-pricing:seed` reproduce ese Price Book de forma idempotente sin crear Partner 101–150 ni matriz Venue × capacidad. DEMO permanece en catálogo y no es activable como Evento real.

## API

- `GET /api/v1/services`: autenticado; servicios activos con reglas del canal persistido.
- `GET /api/v1/public/pricing`: público, read-only y sin cookie; únicamente nueve reglas STANDARD pagadas con nombre, rango, créditos, MXN cents y vigencia. MXN se deriva de `CREDIT_UNIT_VALUE_MXN_CENTS`; no expone Client, Partner, Venue ni finanzas.
- `/api/v1/admin/prices*`: solo Platform Admin; lista V1/V2, crea reglas V2 futuras y cierra vigencias.
- `PATCH /api/v1/admin/clients/:clientId`: solo Platform Admin; configura clasificación y genera auditoría.

## Promociones

`Promotion` continúa separado del Price Book y puede filtrar por scope, Client, `ClientType`, servicio y vigencia. En activación la elegibilidad se evalúa después del precio base y dentro de la transacción. El modelo actual no define porcentaje ni créditos de beneficio, por lo que `promotionDiscountCredits` permanece en cero hasta un contrato posterior.
