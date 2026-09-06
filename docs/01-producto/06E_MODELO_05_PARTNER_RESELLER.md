# 06E — Modelo 05: Partner / Reseller

Estado: **RESUELTO COMO CAPA COMERCIAL SOBRE MODELOS OPERATIVOS — NO AUTORIZA CODE**  
Modelo: M05  
Escenario: Planner, agencia, salón u Organización que revende/incorpora InvitacionesPremium en su oferta comercial  
Objetivo: evitar convertir una condición de reventa en nuevos roles, permisos o un producto paralelo.

## 1. Conclusión principal

M05 no necesita convertirse en un modelo operativo independiente del producto.

Partner/Reseller describe principalmente **cómo se comercializa InvitacionesPremium y quién conserva el margen/relación con el cliente final**.

La operación funcional debe reutilizar uno de los modelos ya definidos:

- M01 — Planner independiente gestionado;
- M02 — salón/jardín gestionado;
- M03 — Organización en autoservicio;
- eventualmente M04 — cliente dedicado de gran escala.

Por tanto:

> **Partner es una condición comercial, no un rol funcional. Reseller es una forma de vender, no una autorización adicional dentro del producto.**

## 2. Escenario Planner / agencia

El escenario comercial ya trabajado es B2B2C:

```text
InvitacionesPremium
        ↓ vende al Partner
Planner / Agencia
        ↓ incorpora margen y relación comercial
Cliente final / anfitrión
        ↓ recibe el servicio
Evento
```

El Planner/agencia:

- conserva la relación con su cliente;
- puede incorporar InvitacionesPremium dentro de su propia propuesta;
- puede definir su precio de reventa salvo acuerdo contractual posterior;
- obtiene margen entre su costo y el precio que presenta al anfitrión;
- continúa operando el Evento conforme a M01 o M03, según sea servicio gestionado o autoservicio.

La clasificación Partner no debe cambiar Invitaciones, RSVP, Mesas, QR, Staff, check-in, reportes o Álbum.

## 3. Escenario salón/jardín reseller

Un salón/jardín puede incorporar InvitacionesPremium como parte de sus paquetes.

La operación sigue M02 o M03:

- M02 si InvitacionesPremium prepara la parte técnica;
- M03 si el salón opera la plataforma directamente.

El salón puede comercialmente:

- absorber el costo dentro de su paquete;
- mostrarlo como concepto adicional;
- revenderlo con margen;
- incluirlo como beneficio de una categoría de Evento;
- negociar condiciones por volumen.

Ninguna de estas opciones requiere un rol `RESELLER` dentro de la aplicación.

## 4. Roles

M05 reutiliza los roles existentes del modelo operativo correspondiente.

Ejemplos:

### Planner independiente Partner

Usa:

- `INDEPENDENT_PLANNER`.

### Agencia / salón como Organización

Usa:

- `ORGANIZATION_ADMIN`;
- `ORGANIZATION_PLANNER`;
- Staff temporal por Evento.

### Decisión

No crear:

- `PARTNER_USER`;
- `RESELLER`;
- `PARTNER_ADMIN`;
- `VENUE_PARTNER`;
- roles equivalentes sólo para determinar precio o margen.

## 5. Relación con el cliente final

El cliente final/anfitrión del Evento no necesita convertirse automáticamente en usuario de InvitacionesPremium.

En el modelo inicial, el Partner conserva la relación comercial y operativa con su cliente.

El anfitrión puede interactuar indirectamente mediante:

- revisiones de diseño fuera del producto;
- información que el Planner captura;
- Invitaciones públicas;
- experiencia de invitados.

Si posteriormente se desea dar al anfitrión un portal propio, eso sería una nueva necesidad funcional y deberá modelarse por separado. M05 no lo autoriza.

## 6. Margen y reventa

La hipótesis comercial trabajada para Planner a aproximadamente 100 invitados utilizó como referencia:

| Servicio comercial | Precio Partner de trabajo | Precio sugerido de trabajo | Margen potencial |
|---|---:|---:|---:|
| Gestión de Invitados | ~$2,390 | ~$2,990 | ~$600 |
| Invitación Digital | ~$4,290 | ~$5,490 | ~$1,200 |
| Invitación Premium | ~$5,490 | ~$6,990 | ~$1,500 |

Estos valores pertenecen al antecedente comercial y **no quedan aprobados como tarifas financieras mediante M05**.

La implementación financiera vigente puede contener importes distintos por las reglas actuales de créditos/Price Book. La futura revisión de Finance debe decidir qué valores sobreviven.

## 7. Reventa sin comisión interna

El modelo más simple de lanzamiento es:

```text
InvitacionesPremium cobra al Partner
        ↓
Partner paga su tarifa acordada
        ↓
Partner cobra al cliente final por su cuenta
        ↓
La diferencia comercial pertenece al Partner
```

En este esquema InvitacionesPremium no necesita:

- calcular la venta del Partner al anfitrión;
- registrar su margen real;
- repartir dinero automáticamente;
- emitir una comisión;
- conocer necesariamente el precio final cobrado al anfitrión.

Esto reduce complejidad financiera durante el piloto.

## 8. Cuándo sí habría un nuevo problema financiero

Si en el futuro el flujo cambia a:

```text
Cliente final paga directamente en InvitacionesPremium
        ↓
Sistema debe separar ingreso
        ↓
Sistema debe liquidar comisión al Partner
```

entonces se requiere un modelo financiero nuevo que cubra:

- split payments;
- comisión;
- saldo a favor;
- liquidaciones;
- facturación/impuestos;
- devoluciones;
- conciliación;
- responsabilidad frente al cliente final.

M05 no autoriza esa implementación.

## 9. Clasificación Partner

Tener una cuenta Planner no equivale automáticamente a tener condiciones Partner.

La condición comercial debe aprobarse explícitamente conforme a las reglas comerciales vigentes.

A nivel conceptual:

```text
Rol funcional
≠
Condición Partner
```

Un mismo `INDEPENDENT_PLANNER` puede operar el mismo producto bajo una condición Standard o Partner sin cambiar sus permisos.

## 10. White-label

Ser Partner/Reseller no implica white-label.

El Partner puede vender el servicio como parte de su oferta, pero la eliminación total de la marca InvitacionesPremium, dominio propio o identidad completa del Partner requiere una decisión específica.

White-label puede relacionarse con M04 o con una capability comercial posterior, pero no forma parte automática de M05.

## 11. Soporte

En el esquema Partner inicial:

- el Partner conserva el contacto cotidiano con su cliente final;
- InvitacionesPremium soporta al Partner conforme al modelo operativo contratado;
- el invitado final utiliza las superficies públicas previstas;
- no se crea una mesa de soporte paralela para cada anfitrión salvo acuerdo posterior.

Esto permite que el Partner proteja su relación comercial y evita duplicar canales de atención.

## 12. Adquisición por ventas en frío en San Luis Potosí

Las ventas en frío en San Luis Potosí son una **estrategia de adquisición**, no otro modelo funcional.

Pueden alimentar distintos modelos:

### Planner independiente

```text
Venta en frío
→ Planner interesado
→ M01 gestionado
→ posible condición Partner M05
```

### Salón/jardín

```text
Venta en frío
→ salón/jardín interesado
→ M02 servicio gestionado
→ posible tarifa recurrente/volumen
```

### Cliente que desea operar por sí mismo

```text
Venta en frío
→ Organización madura
→ M03 licencia/autoservicio
```

Por tanto, la estrategia comercial local no debe introducir roles ni capacidades nuevas por sí misma.

## 13. Volumen para salón/jardín

En conversaciones comerciales previas se trabajó como hipótesis de lanzamiento para Gestión de Invitados/QR un esquema por volumen mensual aproximado:

- 1–2 Eventos: ~$2,390 por Evento;
- 3–5: ~$2,190;
- 6–10: ~$1,990;
- 11+: ~$1,790.

Estos importes se conservan como antecedente comercial y no como decisión financiera nueva de M05.

La lógica definitiva de volumen debe revisarse en Finance después de cerrar los modelos funcionales.

## 14. Qué no cambia por ser Partner

Partner/Reseller no modifica por sí mismo:

- ServiceCode;
- capacidades del Evento;
- EventStatus;
- ownership;
- `assignedPlannerUserId`;
- Staff;
- RSVP;
- Croquis/Seating;
- QR/check-in;
- Álbum;
- reportes;
- aislamiento entre tenants.

## 15. Qué M05 NO autoriza

M05 no autoriza:

- nuevos roles;
- portal para anfitrión;
- white-label;
- comisiones automáticas;
- split payments;
- wallet de Partner;
- subcuentas financieras;
- marketplace;
- multi-level reseller;
- afiliados;
- registro Partner automático;
- precios nuevos;
- promociones nuevas;
- acceso cross-tenant;
- que una agencia vea cuentas de clientes externos sin ser su tenant/Organización.

## 16. Relación con modelos operativos

La regla de selección queda:

| Pregunta | Resultado |
|---|---|
| Planner individual y nosotros preparamos | M01 |
| Salón/agencia con varios Eventos y nosotros preparamos | M02 |
| Organización opera/prepara la plataforma por sí misma | M03 |
| Cliente requiere escala/aislamiento dedicado | M04 |
| ¿Tiene precio de reventa/margen/condición mayorista? | M05 como capa comercial sobre el modelo anterior |

M05 nunca sustituye M01–M04.

## 17. Criterio para Finance posterior

Cuando se retome la capa financiera deberán decidirse explícitamente, sin alterar los roles funcionales:

- qué cuentas califican como Partner;
- tarifa Partner definitiva;
- PVP sugerido o libre;
- reglas de volumen;
- vigencia de condiciones;
- descuentos;
- facturación;
- forma de pago;
- si existe o no comisión interna;
- transición entre Standard/Partner/Venue u otras clasificaciones comerciales.

## 18. Resultado de la serie

Con M05 queda cubierta la familia inicial de escenarios imaginados:

1. venta directa gestionada a Planner;
2. integración gestionada para salón/jardín;
3. licencia/autoservicio;
4. cliente grande con servicio/infraestructura dedicada;
5. reventa/Partner como capa comercial.

El siguiente paso de producto ya no debe ser inventar otro modelo, sino revisar esta familia completa, detectar solapamientos y ejecutar un gap analysis funcional contra el runtime antes de autorizar cambios de código.
