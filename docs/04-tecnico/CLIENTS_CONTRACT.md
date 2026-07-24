# Contrato especializado de Clientes y usuarios

## Autoridad

Este documento especializa `09_MODELO_DATOS_CONCEPTUAL.md`, `11_API_CONTRACTS.md`, `ACCESS_MATRIX.md`, `15_BACKLOG_CODEX.md` y `16_BACKLOG_QA_AMENDMENTS.md` para `CODEX-021`.

En cualquier contradicción sobre rutas de Clientes, ownership o compatibilidad de roles, este contrato prevalece.

## Modelo

`Client` es la única entidad base de cliente y admite exclusivamente:

- `PLANNER`;
- `ORGANIZATION`.

No existen entidades separadas para salón, jardín, agencia o empresa.

Estados:

- `ACTIVE`;
- `SUSPENDED`.

La suspensión es un estado operativo auditado. No equivale a borrado lógico.

## Compatibilidad de usuarios

- `PLATFORM_ADMIN`: `client_id = null`;
- `INDEPENDENT_PLANNER`: pertenece a un `Client.PLANNER`;
- `ORGANIZATION_ADMIN`: pertenece a un `Client.ORGANIZATION`;
- `ORGANIZATION_PLANNER`: pertenece a un `Client.ORGANIZATION`.

Cada usuario operativo pertenece a un solo Cliente. La compatibilidad se valida tanto en aplicación como en PostgreSQL.

## Rutas públicas

- `POST /clients/register-planner`

Crea atómicamente:

1. Cliente `PLANNER`;
2. usuario principal `INDEPENDENT_PLANNER`;
3. auditoría de registro.

El Planner independiente no puede crear usuarios internos.

## Rutas del Cliente autenticado

- `GET /clients/:clientId`;
- `PATCH /clients/:clientId`;
- `GET /clients/:clientId/users`;
- `POST /clients/:clientId/users/planner`;
- `PATCH /clients/:clientId/users/:userId`.

Reglas:

- Planner independiente solo consulta/edita su Cliente;
- Admin de Organización consulta/edita su Organización y administra sus usuarios;
- Planner de Organización no administra Cliente ni usuarios;
- un recurso fuera del ownership responde `404` sin confirmar existencia.

## Rutas administrativas explícitas

Platform Admin no reutiliza rutas operativas como impersonación. Usa:

- `GET /admin/clients`;
- `POST /admin/clients/organizations`;
- `GET /admin/clients/:clientId`;
- `PATCH /admin/clients/:clientId`;
- `POST /admin/clients/:clientId/suspend`;
- `POST /admin/clients/:clientId/restore`;
- `GET /admin/clients/:clientId/users`;
- `POST /admin/clients/:clientId/users/planner`;
- `PATCH /admin/clients/:clientId/users/:userId`.

Crear una Organización crea atómicamente su usuario `ORGANIZATION_ADMIN`.

## Suspensión

Un Cliente suspendido:

- conserva usuarios y datos;
- puede iniciar sesión;
- puede consultar la información autorizada;
- no puede activar nuevos Eventos;
- no se restaura mediante eliminación/recreación;
- se reactiva únicamente mediante acción administrativa auditada.

Cada request autenticado resuelve el estado actual del Cliente para evitar permisos obsoletos dentro de una sesión existente.

## Seguridad

- contraseñas nunca se devuelven ni auditan en claro;
- correos se normalizan antes de persistir;
- cambiar contraseña revoca sesiones activas del usuario;
- Platform Admin no pertenece a Cliente operativo;
- IDs del frontend nunca determinan ownership;
- alta de Cliente + usuario principal ocurre en una transacción `Serializable`;
- errores de correo duplicado usan un contrato `409` estable.

## Fuera de alcance

- Auth0;
- recuperación de contraseña;
- MFA;
- eliminación de usuarios;
- transferencia de usuarios entre Clientes;
- cambio de tipo de Cliente;
- Eventos, precios, promociones, ledger o crédito;
- interfaces frontend.
