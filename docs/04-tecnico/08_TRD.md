# 08 — TRD

## Stack confirmado

### Frontends

- React
- Vite
- Material UI
- TypeScript estricto

Aplica a:

- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Prisma
- Socket.IO/WebSockets

### Deploy inicial

- Netlify para frontends
- Railway para backend y PostgreSQL

### Repos

- `invitacionespremium-api`
- `invitacionespremium-client`
- `invitacionespremium-admin`
- `invitacionespremium-scanner`
- `invitacionespremium-landing`
- `shared-ui`

## Arquitectura

Apps separadas consumiendo una API REST común.

Principios:

- backend concentra reglas, ownership, estados y persistencia;
- frontend no decide permisos ni efectos financieros;
- OpenAPI es el contrato entre repos;
- SDK cliente se genera desde OpenAPI;
- tiempo real notifica cambios confirmados, pero REST y base de datos son fuente de verdad;
- no crear microservicios adicionales en MVP.

## Auth

### Desarrollo temprano

- auth local temporal;
- email/password;
- sesión/cookie;
- hash seguro de contraseña;
- guards por rol y ownership.

### Producción

- Auth0;
- email/password;
- Google;
- sin WhatsApp/SMS en MVP;
- login único con redirección por rol;
- backend valida identidad y resuelve Cliente/rol local.

Platform Admin no impersona Clientes.

## API

- REST API
- OpenAPI
- SDK generado desde OpenAPI
- errores de dominio estables
- idempotencia en operaciones críticas
- validación backend obligatoria

Operaciones críticas transaccionales:

- activación de Evento;
- compra/asignación de créditos;
- uso de línea;
- pago de deuda;
- devolución/reversal;
- check-in;
- uso de PaseFisicoQR;
- transición de estados.

## Base de datos

- PostgreSQL
- Prisma ORM
- UUID como identificador
- enums controlados
- JSON solo para metadata/configuraciones variables
- constraints e índices para invariantes críticos
- soft delete en entidades principales
- ledger/auditoría inmutables por movimientos compensatorios

PostgreSQL debe proteger concurrencia en:

- check-in único activo;
- uso único de PaseFisicoQR;
- idempotencia financiera;
- folio global de comprobantes;
- límites de línea/deuda;
- máximo de StaffTokens activos.

## Fecha, hora y zonas horarias

- timestamps técnicos se almacenan en UTC;
- Evento conserva zona horaria IANA;
- estados y reglas de fecha se evalúan en la zona horaria del Evento;
- frontend muestra horario localizado;
- no asumir zona horaria del servidor.

## Storage

### Desarrollo

- storage local controlado por API.

### Producción futura

- S3 compatible;
- proveedor aún no definido;
- buckets privados;
- URLs firmadas de corta duración cuando aplique.

Todos los archivos obedecen `FILE_ASSET_POLICY.md`.

## QR

- generado en backend principal;
- formato SVG;
- token opaco;
- sin nombre/teléfono visible o codificado directamente;
- QR de Invitación y PaseFisicoQR usan propósitos distintos;
- operación protegida contra doble uso.

## Reportes PDF

Decisión confirmada: se renderizan desde plantilla HTML y se exportan a PDF en el frontend autorizado.

### Flujo

1. Frontend solicita crear reporte al API.
2. API valida rol, ownership, estado, ventana de privacidad y tipo de reporte.
3. API crea el registro lógico de reporte y devuelve:
   - `report_id`;
   - dataset autorizado;
   - versión de plantilla;
   - parámetros;
   - timestamp/snapshot de generación.
4. Frontend renderiza plantilla HTML aprobada.
5. Frontend exporta PDF.
6. Frontend envía el PDF al API asociado al `report_id`.
7. API valida tipo, tamaño, checksum, ownership y estado del reporte.
8. API guarda el PDF como `FileAsset` tipo `GENERATED_REPORT_PDF`.
9. Descarga posterior siempre pasa por autorización.

### Reglas

- frontend nunca sube directo al storage;
- no aceptar un PDF sin `report_id` previamente autorizado;
- frontend no puede cambiar Cliente, Evento ni actor del reporte;
- no incluir teléfonos;
- reportes detallados con nombres solo se descargan durante 30 días post-Evento;
- al anonimizar, reportes detallados se ocultan o reemplazan por versión anonimizada;
- historial de seis meses conserva metadata y reportes agregados/anónimos;
- PDF es reporte operativo, no CFDI ni documento fiscal;
- fallos de exportación/subida no deben dejar un reporte como completado.

## Tiempo real

Socket.IO.

Canales mínimos:

- `event:{eventId}:dashboard`
- `event:{eventId}:scanner`
- `event:{eventId}:floorplan`

Eventos autorizados:

- `checkin.created`
- `checkin.reverted`
- `rsvp.updated`
- `seating.updated`
- `event.closed`
- `event.cancelled`

No enviar teléfonos, nombres, finanzas ni tokens por socket.

Contratos completos en `REALTIME_PAYLOADS.md`.

## Archivos

Todos los archivos suben vía API.

Frontend nunca:

- guarda archivos directo en storage;
- decide `storage_key`;
- recibe credenciales de storage;
- convierte un bucket en público;
- reutiliza FileAssets entre Clientes/Eventos.

## PDF a imagen

MVP temprano:

- rechazar PDF subido por usuario para Flyer/Flipbook/Croquis;
- pedir imagen JPG/PNG.

Futuro:

- aceptar PDF de una página;
- convertir a imagen mediante proceso backend controlado;
- conservar FileAsset original/derivado según política futura.

## Procesos programados

El producto requiere tareas programadas dentro de los módulos existentes. No crear un módulo backend nuevo solo por esta responsabilidad.

Procesos mínimos:

- borrar lógicamente borradores cuya fecha pasó sin activarse;
- recalcular `active` → `event_day` según zona horaria;
- archivar `album_published` al vencer 30 días;
- expirar tokens de Álbum/Staff según estado;
- anonimizar nombres y teléfonos 30 días post-Evento;
- ocultar o reemplazar reportes detallados al anonimizar;
- limpiar bytes huérfanos de subidas fallidas conforme a retención técnica;
- ejecutar backups según configuración de infraestructura.

Requisitos:

- idempotentes;
- auditables cuando cambian datos de negocio;
- seguros ante ejecución duplicada;
- con logs y métricas de éxito/error;
- usan zona horaria del Evento cuando aplica.

## Testing

- unitarias;
- integración;
- E2E para flujos críticos.

Por repo:

- API: unitarias + integración + concurrencia en operaciones críticas;
- Client: E2E de wizard, Invitación, Confirmación, QR y Álbum;
- Admin: E2E de Clientes, finanzas, precios, reportes y auditoría;
- Scanner: E2E de token, escaneo, check-in, cierre y cancelación;
- Landing: smoke, navegación, performance y accesibilidad básica.

Flujos E2E obligatorios:

- Crear Evento → Contacto → Invitación → Confirmar → QR → Scanner → Check-in.
- Activación con saldo, línea y pago mixto.
- Cancelación con vista pública correcta.
- Cierre que invalida Staff.
- Álbum con token separado y expiración.
- Anonimización y bloqueo de reportes detallados.

## Logs y observabilidad

Contemplar logs estructurados para:

- auth;
- activación de Evento;
- consumo de créditos;
- pagos;
- ledger e invariantes;
- scanner;
- check-in;
- sockets;
- jobs programados;
- errores de archivo;
- fallos de PDF;
- errores de storage;
- transiciones de estado.

Reglas:

- no registrar contraseñas;
- no registrar tokens completos;
- no registrar URLs firmadas completas;
- no registrar teléfonos ni payloads personales completos;
- incluir `operation_id`, `event_id` y `client_id` cuando aplique;
- separar logs por ambiente.

## Seguridad mínima

- CORS por orígenes permitidos;
- cookies seguras por ambiente;
- CSRF conforme a estrategia de sesión;
- rate limiting en auth, endpoints públicos, scanner y archivos;
- validación MIME real;
- límites de body/upload;
- headers de seguridad;
- secretos solo en variables de entorno;
- autorización por recurso en backend;
- respuestas `404` para recursos fuera de ownership cuando corresponda;
- rotación/configuración segura de credenciales;
- backups y restauración probados antes de producción.

## CI/CD

MVP:

- lint;
- typecheck;
- tests;
- build;
- validación de migraciones;
- generación/verificación de OpenAPI;
- smoke tests de despliegue.

No desplegar si falla cualquier verificación obligatoria.

## Ambientes

- local
- staging
- producción

Cada ambiente usa:

- base de datos separada;
- storage separado;
- credenciales separadas;
- orígenes/CORS separados;
- Auth0/configuración separada cuando aplique;
- seeds demo únicamente donde estén autorizados.

Nunca copiar datos reales de producción a desarrollo sin anonimización.