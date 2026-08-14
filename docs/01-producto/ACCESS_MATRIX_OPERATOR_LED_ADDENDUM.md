# Addendum — Access Matrix para lanzamiento operator-led

Estado: **Normativo para el perfil operator-led**  
Base que permanece vigente: `docs/01-producto/ACCESS_MATRIX.md`  
Decisión de arquitectura: `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`

## 1. Propósito

Este addendum evita modificar o reinterpretar la matriz estándar de acceso mientras se introduce el perfil de lanzamiento operator-led.

`ACCESS_MATRIX.md` continúa describiendo los endpoints/capacidades normales de los roles SaaS. Este documento describe una **superficie administrativa adicional y explícita** para la operación del proveedor.

No agrega un `AuthRole`.

## 2. Regla central

La operación provider-led no se obtiene otorgando a Platform Admin permisos Planner sobre rutas existentes.

Debe existir una capacidad administrativa explícita con estas propiedades:

- actor autenticado real;
- target `clientId` + `eventId`;
- verificación de ownership/tenant;
- allowlist de operaciones;
- validación de estado y reglas de negocio;
- auditoría;
- denial cross-tenant;
- sin impersonación.

## 3. Matriz conceptual de lanzamiento

| Capacidad | Planner / Cliente | Provider operation | Staff | Público |
|---|---|---|---|---|
| Gestionar lista de Contactos/Invitaciones | Sí, bajo ownership | No por defecto | No | No |
| Distribuir links de Invitación | Sí | No por defecto | No | No |
| Consultar RSVP operativo | Sí | Sólo si una acción administrativa lo requiere/autoriza | No | Sólo su token |
| Configurar infraestructura de Invitación | Superficie reducida en lanzamiento | Sí, mediante ruta administrativa autorizada | No | No |
| Construir/mutar geometría de Croquis | No en lanzamiento | Sí, explícito y auditado | No | No |
| Leer Croquis | Sí, su Evento | Sí, target explícito | Sí, mínimo requerido | No salvo proyección pública autorizada |
| Asignar personas a Mesas | Sí, bajo ownership | No por defecto | No | No |
| Crear/preparar Staff access | Según rol estándar | Puede prepararlo si el contrato operator-led lo habilita | No | No |
| Scanner/check-in | No como Staff; reversión según contrato estándar | Sólo recuperación explícita si existe contrato | Sí | No |
| Activar Evento | Según rol/finanzas estándar | Sólo si la acción administrativa conserva todos los invariantes | No | No |
| Bypass de créditos/pricing | No | **No** | No | No |
| Impersonación | **No** | **No** | N/A | N/A |

“Provider operation” es una capability administrativa, no una columna de rol persistido.

## 4. Croquis V2

### Geometría

- Planner: lectura durante lanzamiento.
- Provider operation: lectura/escritura mediante superficie administrativa autorizada.
- Staff: sólo lectura mínima cuando el flujo operativo la requiere.

### Seating

- Planner: lectura/escritura de asignación conforme a ownership y estado.
- Provider operation: fuera de alcance por defecto; una recuperación excepcional requiere contrato explícito.
- Staff: no reacomoda personas.

## 5. UI exposure vs autorización

La UI del perfil operator-led puede ocultar capacidades históricas de autoservicio a la Planner. Eso no basta para seguridad.

Toda restricción crítica debe existir también en backend.

Del mismo modo, mostrar un Builder en una aplicación administrativa no concede capacidad de mutación si el backend no implementó el ADR.

## 6. Respuestas esperadas

Se conservan las políticas estándar:

- identidad inválida: `401`;
- capability administrativa ausente: `403`;
- target fuera de alcance/ownership: `404` o política equivalente que no revele existencia;
- estado/regla incompatible: `409` con error de dominio.

## 7. Regla de implementación

Hasta que `ADR_OPERATOR_LED_ACCESS.md` esté implementado y probado:

- Platform Admin continúa sin operar Eventos mediante endpoints Planner;
- el Builder provider-led no debe habilitarse en producción real;
- no usar seeds, flags inseguros o bypasses temporales como sustituto de autorización.

## 8. Criterios de regresión

Toda implementación debe probar:

- Planner no obtiene mutación de geometría en la superficie de lanzamiento;
- Provider operation puede actuar sólo sobre el target explícito autorizado;
- cross-tenant es denegado;
- estado incompatible es denegado;
- auditoría registra actor real;
- Staff/Público no ganan privilegios;
- credits/pricing/readiness siguen aplicándose.