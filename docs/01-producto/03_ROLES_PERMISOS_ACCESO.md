# 03 — Roles, permisos y acceso

## Tipos de Cliente

- Planner
- Organización

No existen tipos de Cliente separados para salón, jardín, agencia o empresa.

## Actores autorizados

- Platform Admin
- Planner independiente
- Admin de Organización
- Planner de Organización
- Staff por token
- Público por token de Invitación o Álbum

Staff y Público no son usuarios autenticados permanentes.

## Registro público

Solo el Planner independiente puede registrarse desde la landing.

Una Organización no se registra públicamente.

## Organización

La Organización solo la crea Platform Admin.

Platform Admin crea al menos el Admin de Organización inicial.

## Auth

### Desarrollo temprano

- email/password;
- sesión/cookie local.

### Producción

- Auth0;
- email/password;
- Google;
- sin WhatsApp/SMS en MVP.

### Accesos sin login

- Invitación: token de Invitación.
- Álbum: token de Álbum separado.
- Scanner: token Staff.
- QR: token opaco del recurso.

Los tokens no son intercambiables.

## Datos obligatorios post-registro

Para registro con Google o email/password:

- correo electrónico;
- tipo de cuenta;
- nombre comercial;
- teléfono WhatsApp;
- ciudad;
- estado;
- aceptar términos.

## Platform Admin

Puede:

- crear Organización;
- crear usuarios iniciales de Organización;
- editar datos de Cliente mediante acción administrativa;
- suspender/restaurar Cliente;
- consultar Eventos globalmente por rutas administrativas;
- ver saldo y deuda;
- asignar créditos manualmente;
- asignar/suspender línea de crédito;
- registrar Pago manual;
- ejecutar devolución interna o reversal conforme a reglas;
- asignar promoción;
- gestionar precios/promociones;
- ver auditoría;
- ver reportes generales;
- restaurar recursos con borrado lógico.

No puede:

- impersonar al Cliente;
- iniciar sesión como Cliente;
- reutilizar endpoints operativos del Planner como si tuviera ownership;
- alterar ledger confirmado;
- crear roles/módulos no definidos.

La lectura administrativa de Eventos no equivale a operar el Evento en nombre del Cliente.

## Planner independiente

Puede, sobre recursos de su propio Cliente:

- crear Eventos;
- editar Eventos en preparación;
- comprar créditos;
- activar Eventos;
- gestionar Contactos/Invitaciones;
- configurar Flyer/Flipbook antes de activar;
- gestionar Confirmación;
- gestionar Croquis/Mesas;
- crear hasta tres StaffTokens activos cuando el Evento esté operativo;
- cerrar/reabrir/cancelar/archivar conforme a estados;
- revertir check-in mediante flujo autorizado;
- crear/publicar Álbum si el servicio aplica;
- ver reportes operativos propios;
- usar demo.

No puede:

- asignarse créditos manualmente;
- crear usuarios internos permanentes;
- editar Flyer/Flipbook después de activar;
- ver auditoría global;
- impersonar otros Clientes.

## Admin de Organización

Puede, sobre recursos de su Organización:

- contratar/pagar;
- comprar créditos;
- ver saldo, deuda y línea;
- activar Eventos;
- crear Planner de Organización;
- ver/editar todos los Eventos de la Organización conforme al estado;
- gestionar Contactos, Invitaciones, Croquis, Staff, Álbum y reportes;
- cerrar/reabrir/cancelar/archivar;
- ver historial de movimientos de la Organización.

No puede:

- asignar créditos manualmente;
- asignar línea de crédito;
- ver auditoría global;
- editar ledger confirmado;
- impersonar Platform Admin.

## Planner de Organización

Puede, únicamente sobre Eventos de su Organización creados por su propio `user_id`:

- crear Eventos;
- editar Eventos en preparación;
- gestionar Contactos/Invitaciones;
- configurar Flyer/Flipbook antes de activar;
- gestionar Confirmación;
- gestionar Croquis/Mesas;
- crear hasta tres StaffTokens activos;
- activar Eventos usando créditos/línea de la Organización;
- cerrar/reabrir/cancelar/archivar conforme a estados;
- crear/publicar Álbum si aplica;
- ver reportes operativos de esos Eventos.

No puede:

- comprar créditos;
- ver saldo comprado;
- ver deuda/línea;
- ver reportes financieros;
- ver/editar Eventos creados por otro usuario de la Organización;
- crear usuarios internos;
- editar Flyer/Flipbook después de activar.

## Staff por token

Puede:

- entrar con token sin login;
- operar únicamente el Evento asociado;
- operar solo con Evento `active` o `event_day`;
- escanear QR;
- buscar Invitación exacta;
- registrar check-in por Asistente;
- ver Asistentes pendientes;
- ver mesa/plano si existe.

No puede:

- registrar extra anónimo;
- ver asistencia en tiempo real global/dashboard;
- ver teléfonos;
- ver deuda o finanzas;
- revertir check-in;
- ver reportes finales;
- comprar créditos;
- activar/editar Eventos;
- acceder a otro Evento;
- entrar al room Socket.IO `dashboard`.

Reglas:

- máximo tres StaffTokens activos por Evento;
- cerrar/cancelar expira tokens activos;
- reabrir no reactiva expirados;
- no existe revocación manual en MVP.

## Público por token de Invitación

Puede:

- abrir su Invitación;
- confirmar/rechazar mientras esté permitido;
- registrar nombres nominales dentro del límite;
- modificar respuesta mientras Confirmación esté abierta;
- ver QR después de confirmar y solo con Evento operativo;
- ver mensaje de cancelación si Evento/Invitación fue cancelado.

No puede:

- cambiar identidad del Contacto;
- exceder cupo/límite;
- ver otras Invitaciones;
- usar token de Invitación como token de Álbum;
- confirmar o ver QR operativo en Evento cerrado/archivado/cancelado.

## Público por token de Álbum

Puede ver únicamente el Álbum asociado cuando:

- Evento está `album_published`;
- token no expiró;
- Invitación asociada tuvo al menos un Asistente ingresado.

No puede ver Contactos/Asistentes de otras Invitaciones ni reutilizar el token para otros accesos.

## Suspensión

Cliente suspendido puede iniciar sesión, pero no activar Eventos.

Platform Admin puede aplicar bloqueos administrativos adicionales documentados.

La suspensión no elimina datos ni modifica ledger.

## Deuda vencida

Cliente con deuda vencida solo se bloquea si Platform Admin lo decide mediante estado/bloqueo administrativo explícito.

No inferir bloqueo automático únicamente por fecha vencida.

## Respuestas de autorización

- sesión/token inválido: `401`;
- rol sin permiso: `403`;
- recurso fuera de ownership: `404` o política equivalente que no revele existencia;
- estado incompatible: `409` con error de dominio.

## Auditoría de acceso

Auditar:

- login/logout;
- registro;
- creación de usuario;
- cambio de rol;
- suspensión/restauración;
- creación/expiración de StaffTokens;
- acciones administrativas;
- cambios de ownership permitidos;
- intentos sensibles fallidos cuando aplique;
- Confirmaciones/check-ins con actor tipo sin guardar tokens secretos.

No auditar impersonación porque no existirá.