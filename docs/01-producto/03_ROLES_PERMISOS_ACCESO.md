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

## Perfil operator-led de lanzamiento

El perfil operator-led **no agrega un rol persistido nuevo**.

“Operador del proveedor” describe una función interna de lanzamiento. Su capacidad técnica debe implementarse mediante la superficie administrativa explícita, limitada y auditada definida en `docs/04-tecnico/ADR_OPERATOR_LED_ACCESS.md`.

Por tanto:

- Platform Admin no se convierte en Planner;
- no existe impersonación;
- no se comparten credenciales;
- la matriz normal de endpoints de Cliente no se amplía implícitamente;
- ocultar/mostrar UI no sustituye autorización backend.

Durante el lanzamiento, la **superficie expuesta** a Planner puede ser deliberadamente más estrecha que la capacidad histórica del rol. En particular:

- la Planner conserva gestión de Contactos/Invitaciones, RSVP, distribución y seating;
- el Croquis se presenta con geometría read-only para Planner;
- la construcción/mutación de geometría pertenece al proveedor mediante la capacidad operator-led;
- la Planner puede asignar/mover/desasignar personas sobre Mesas ya creadas.

Esta restricción de exposición para lanzamiento no redefine por sí sola el modelo SaaS futuro.

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

No puede por sus rutas estándar:

- impersonar al Cliente;
- iniciar sesión como Cliente;
- reutilizar endpoints operativos del Planner como si tuviera ownership;
- alterar ledger confirmado;
- crear roles/módulos no definidos.

La lectura administrativa de Eventos no equivale a operar el Evento en nombre del Cliente.

La excepción de lanzamiento provider-led sólo existe cuando una acción está expresamente implementada conforme a `ADR_OPERATOR_LED_ACCESS.md`; no convierte automáticamente todas las rutas Planner en rutas Platform Admin.

## Planner independiente

Puede, sobre recursos de su propio Cliente:

- crear Eventos;
- editar Eventos en preparación;
- comprar créditos;
- activar Eventos;
- gestionar Contactos/Invitaciones;
- configurar Flyer/Flipbook antes de activar conforme a la superficie habilitada;
- gestionar Confirmación;
- gestionar seating sobre Croquis/Mesas disponibles;
- crear hasta tres StaffTokens activos cuando el Evento esté operativo;
- cerrar/reabrir/cancelar/archivar conforme a estados;
- revertir check-in mediante flujo autorizado;
- crear/publicar Álbum si el servicio aplica;
- ver reportes operativos propios;
- usar demo.

En el perfil operator-led de lanzamiento no se expone el constructor de geometría de Croquis a Planner, aunque el modelo futuro pueda ampliarlo mediante una decisión posterior.

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
- gestionar Contactos, Invitaciones, seating, Staff, Álbum y reportes;
- cerrar/reabrir/cancelar/archivar;
- ver historial de movimientos de la Organización.

En el perfil operator-led de lanzamiento, la geometría del Croquis se construye por el proveedor y la Organización opera el seating sobre esa geometría.

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
- configurar Flyer/Flipbook antes de activar conforme a la superficie habilitada;
- gestionar Confirmación;
- gestionar seating sobre Croquis/Mesas disponibles;
- crear hasta tres StaffTokens activos;
- activar Eventos usando créditos/línea de la Organización;
- cerrar/reabrir/cancelar/archivar conforme a estados;
- crear/publicar Álbum si aplica;
- ver reportes operativos de esos Eventos.

En el perfil operator-led de lanzamiento no recibe el builder de geometría del Croquis.

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
- acciones operator-led autorizadas;
- cambios de ownership permitidos;
- intentos sensibles fallidos cuando aplique;
- Confirmaciones/check-ins con actor tipo sin guardar tokens secretos.

No auditar impersonación porque no existirá.

## StaffToken implementado

Los tres roles operativos pueden crear y listar StaffTokens únicamente bajo su ownership normal.

## Scanner y reversión implementados

StaffToken puede resolver sesión, escanear QR, buscar por coincidencia exacta y registrar una selección parcial de Asistentes confirmados pendientes dentro de su Evento. Nunca recibe teléfonos ni capacidad de reversión. Planner independiente, Admin de Organización y Planner de Organización pueden revertir CheckIn bajo el mismo ownership de Evento; Platform Admin queda fuera de esta ruta operativa estándar. La futura recuperación provider-led sólo puede añadirse mediante una acción administrativa explícita y auditada. Staff no es usuario, no tiene subtipo ni permisos configurables: un secreto de una sola entrega lo limita al Evento asociado. El listado nunca devuelve secreto o digest. No existe revocación manual; cierre/cancelación expiran y reapertura no reactiva.
