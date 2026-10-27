# PR02 — Planes comerciales Managed

Alcance autorizado por el ticket PR02: catálogo comercial, versiones de precio, contratos y
seguimiento administrativo. Extiende Organización Managed de M02-B01; no modifica M01, roles,
capabilities, activación, Scanner, Finance ni las tarifas por Evento de PR01.

## Modelos y configuración inicial

`ManagedPlansModule`, en `apps/api`, mantiene cuatro tablas específicas:

- `ManagedPlan`: identidad permanente de una combinación de modalidad `STANDARD|PRIVATE` y nivel
  `ESSENTIAL|FREQUENT|INTENSIVE`, disponibilidad para nuevas contrataciones y timestamps.
- `ManagedPlanVersion`: nombre comercial, importes enteros en centavos MXN, cuota inicial, precio
  extraordinario, duración de 12 meses, eventos de referencia, límites mensuales, pool anual nullable,
  capacidad, vigencia `[validFrom,validUntil)`, autor real nullable para bootstrap SYSTEM y creación.
- `ManagedPlanContract`: Organización, versión aceptada, fechas contractuales `[startsOn,endsOn)`,
  fecha de aceptación, actor Provider real y snapshot JSON inmutable de todos los términos.
- `ManagedPlanOperation`: clave idempotente, tipo de operación, actor, firma del request y respuesta
  original; historial inmutable exclusivo de este dominio comercial.

La migración aditiva registra las seis combinaciones y su auditoría SYSTEM. Los valores iniciales son:

| Modalidad | Nivel | Mensualidad MXN | Cuota inicial MXN | Referencia mensual | Límite incluido mensual | Pool anual |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Estándar Gestionado | Esencial | 7,900 | 4,900 | 4 | 4 | — |
| Estándar Gestionado | Frecuente | 9,900 | 4,900 | 8 | 12 | 96 |
| Estándar Gestionado | Intensivo | 12,900 | 4,900 | 12 | 12 | — |
| Licencia Privada | Esencial | 8,900 | 39,900 | 4 | 4 | — |
| Licencia Privada | Frecuente | 10,900 | 39,900 | 8 | 12 | 96 |
| Licencia Privada | Intensivo | 13,900 | 39,900 | 12 | 12 | — |

Las seis versiones incluyen licencia anual, pago mensual, contrato obligatorio de 12 meses,
extraordinario de $1,250 MXN y máximo vigente de 150 accesos por Evento; todos los importes son antes
de IVA. Son filas configurables, no precios constantes de UI. No se expresan en créditos ni se aplica
la equivalencia de $20. Las nuevas versiones permiten centavos sin redondearlos a dicha equivalencia.

## Versionado y disponibilidad

No se editan importes históricos. Crear una versión publica un nuevo intervalo no solapado para
contrataciones posteriores. Omitir `validFrom` aplica desde el reloj transaccional de PostgreSQL;
indicarlo permite programar una vigencia futura y no reescribir el pasado. Si sólo se solapa la cola
abierta de una versión anterior, se cierra en el inicio de la nueva dentro de la misma transacción.
Los contratos ya aceptados conservan incluso su fotografía de la vigencia original.

PostgreSQL refuerza intervalos válidos y no solapados, importes, capacidad y duración, identidad del
plan e inmutabilidad de versiones salvo ese cierre. Sólo Frecuente puede tener pool anual; los demás
planes usan cuota mensual sin acumulación. La API valida la misma configuración antes de escribir.

Desactivar disponibilidad impide nuevas aceptaciones; no cancela contratos ni modifica sus términos,
permisos, estado operativo, cuotas históricas o acceso a Scanner.

El actor de versión es un identificador de auditoría, como `AuditLog.actorId`, sin FK hacia User;
el INSERT valida que sea un Provider vigente. Así el historial comercial no depende de la vida de
una cuenta. El bootstrap SYSTEM es explícito y se ejecuta antes de instalar esa guarda.

## Contratación y políticas temporales confirmadas

Sólo Platform Admin auténtico, activo y sin tenant puede asignar contratos. El Cliente debe existir,
estar activo y ser `ORGANIZATION + MANAGED`. La versión elegida debe estar disponible y vigente en
el instante de **asignación/aceptación**, medido por PostgreSQL, aunque el inicio contractual sea futuro.
La fecha de inicio no selecciona otro precio. Una versión futura o caducada se rechaza.

Las fechas contractuales son fechas civiles de `America/Mexico_City`. Los períodos mensuales comienzan
en los aniversarios del inicio contractual. Cuando falta el día en un mes, se usa su último día; cada
límite se calcula desde el ancla original para que 31 de enero → 28 de febrero → 31 de marzo no derive
al día 28 permanentemente. La vigencia termina de forma exclusiva a los 12 meses.

Estas dos políticas fueron confirmadas expresamente por el usuario durante PR02. No se usan meses
calendario ni períodos móviles de 30 días. Las fechas contractuales pueden registrarse explícitamente;
el precio siempre corresponde a la aceptación actual.

La FK de versión, el snapshot de términos y las fechas quedan protegidos contra UPDATE/DELETE.
Una exclusión GiST impide contratos solapados de la misma Organización; las renovaciones adyacentes
son filas nuevas e independientes. No hay cambio automático de plan, cancelación contractual,
prorrateo ni renovación. La historia se consulta sin alterar los contratos anteriores.

## Consumo autoritativo de Eventos

La lectura usa una transacción `RepeatableRead` y `READ ONLY`: contrato, reloj, activaciones y cifras
pertenecen al mismo snapshot. Cuenta identificadores únicos del mismo Cliente con `activatedAt`
dentro del contrato y hasta `asOf`, y servicio histórico de activación `ACCESS_CONTROL`.
No cuenta borradores, demos, eventos ajenos ni PHYSICAL_QR legacy; no infiere consumo desde Finance.
Conserva activaciones canceladas o borradas lógicamente, sin devolución automática de cupo.
Un índice por `clientId,activatedAt,id` acota la lectura al tenant y al período, sin agregar marcas
de consumo ni modificar las escrituras de activación.

La proyección ordena por `activatedAt,id` y entrega períodos mensuales, Eventos utilizados, incluidos,
extraordinarios, disponibles del período actual y saldo del pool anual cuando aplica. En Frecuente se
incluyen hasta 12 en cada período y hasta 96 por año contractual; un Evento que excede cualquiera de
los límites es extraordinario y no consume el pool de incluidos. Esencial e Intensivo reinician su
cuota mensual sin trasladar sobrantes. Fuera de vigencia no hay disponibilidad actual; los residuos
de períodos anteriores y del pool anual son información histórica, no capacidad utilizable renovada.

Los Eventos cancelados siguen contabilizados y se señalan para resolución comercial manual. Repetir
la consulta no escribe reservas, marcas de consumo, auditoría de lectura, cargos ni devoluciones.
No se consulta a invitados ni se revelan credenciales; sólo identidad administrativa de Eventos.

## API administrativa

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/v1/admin/managed-plans` | Seis planes, disponibilidad, versión vigente e historial vigente/futuro/histórico. |
| POST | `/api/v1/admin/managed-plans/:planId/versions` | Nueva versión comercial; `validFrom` opcional para aplicación inmediata. |
| POST | `/api/v1/admin/managed-plans/:planId/availability` | Disponibilidad para nuevas contrataciones. |
| GET | `/api/v1/admin/clients/:clientId/managed-contracts` | Historial y estado temporal derivado FUTURE/CURRENT/EXPIRED. |
| POST | `/api/v1/admin/clients/:clientId/managed-contracts` | Acepta `{planVersionId,startsOn}` y persiste snapshot inmutable. |
| GET | `/api/v1/admin/clients/:clientId/managed-contracts/:contractId/consumption` | Consumo actual e histórico derivado de activaciones. |

Todos los POST exigen `Idempotency-Key`. La firma enlaza tipo, actor, target e input normalizado.
Repetir el mismo intento devuelve la respuesta original sin duplicar contrato, versión ni auditoría;
otra intención con la misma clave devuelve `409 MANAGED_PLAN_IDEMPOTENCY_CONFLICT`.
Mutación, auditoría y registro idempotente se confirman atómicamente en `Serializable`. Los conflictos
transitorios usan reintentos internos acotados y snapshots nuevos. Errores de negocio deterministas
no se convierten en confirmaciones. Un fallo de auditoría revierte también el cierre de precio previo.

Se conservan los errores uniformes: 401 sin sesión, 403 sin rol, 404 para targets no disponibles,
400 para DTO/configuración inválidos y 409 para vigencias incompatibles, solapamientos o contexto
comercial no elegible. OpenAPI es la fuente de DTOs del SDK; los wrappers sólo añaden transporte,
AbortSignal y validación de respuestas.

## Admin, Client y Landing

El catálogo existente incorpora **Planes Gestionados** con las seis combinaciones, historial y acciones
de nuevas versiones/disponibilidad. El detalle Organización Managed incorpora **Plan comercial**,
términos aceptados y consumo por contrato. Los contadores se reciben del backend; Admin no replica
el cálculo de cuotas. Se admiten importes MXN con dos decimales, vigencias explícitas y visualización
responsive. Los errores inciertos conservan cuerpo y clave del intento, bloquean edición y navegación
y ofrecen reintentar la misma operación.

`PRIVATE` identifica condiciones comerciales de Licencia Privada Gestionada; no modifica
`operatingProfile`, `commercialChannel`, rol ni capacidades. No genera ni despliega un frontend.
Ese proyecto sigue necesitando implementación y certificación independientes.

Client mantiene UX01 sin contratación ni saldos comerciales. Landing mantiene precios por evento
de PR01 desde su endpoint público; su aviso en `landing-config.ts` de que los planes para salones se
cotizan por separado y las secciones comerciales de `LandingVenue` son puntos de conexión futura.
PR02 no añade una publicación pública de planes ni precios constantes en Landing.

## Manual para PR03

Siguen manuales la firma comercial, seguimiento de pagos, cobro mensual y de extraordinarios,
facturación/CFDI, renovación, resolución de cancelaciones y desarrollo del frontend privado.
No hay proveedor de suscripciones, checkout, bloqueo por pago, promociones de licencias ni automatización
de deuda. `FinanceBalance`, `LedgerEntry`, `CreditLine`, `Receipt` y las tarifas STANDARD/PARTNER/VENUE
no se modifican. La activación no consulta ni impone estas cuotas contractuales.
