# M02-B01 — Operación del piloto de accesos

Ámbito: piloto separado ACCESS_CONTROL, Organización MANAGED, una modalidad por Evento,
máximo 150 derechos vigentes. M01 conserva la dirección principal de lanzamiento.
La validación física está **PENDIENTE**; este procedimiento no constituye autorización de apertura.
Evidencia y dictamen: [certificación DT09](./M02_B01_DT09_CERTIFICATION.md).

## Antes de abrir recepción

1. Identificar Evento, modalidad, Planner asignado, responsable del salón y contacto Provider.
   Acordar horario y canal de soporte, responsable de incidentes y dispositivos de respaldo.
2. Provider prepara datos, aforo y Croquis. NOMINAL admite TABLE/SEAT; ANONYMOUS sólo TABLE.
   El salón opera el acomodo y no modifica la geometría Managed.
3. NOMINAL: importar nombres, revisar preview y teléfonos cuando existan; nombres repetidos
   conservan identidades distintas. Emitir una credencial por persona y completar Mesa/Lugar.
   No confirmar RSVP ni inventar teléfonos. ANONYMOUS: Provider genera el lote y el salón verifica
   folios, Mesas y revocados. No crear contactos ficticios.
4. Revisar readiness autoritativo y resolver cada bloqueo. Provider activa mediante su superficie
   Admin. ACCESS_CONTROL Managed no requiere compra ficticia, créditos, Receipt ni Ledger.
5. Descargar SVG/PDF autorizado; revisar impresión a escala, contraste y margen. Custodiar y
   distribuir únicamente el material necesario. Un QR sustituido debe retirarse físicamente;
   revocación invalida el anterior, conserva su historial y no reutiliza folios.
6. Planner asignado u Organization Admin crea Staff; máximo tres tokens activos. Entregar el enlace
   de una sola entrega únicamente al personal autorizado. No ponerlo en reportes, tickets, vídeos,
   capturas, analytics ni almacenamiento compartido. Provider no impersona al Planner.
7. Probar HTTPS, cámara trasera, permisos y red con dispositivos reales y material controlado.
   Completar la matriz siguiente antes de autorizar un piloto presencial. Mantener batería/cargador.
8. Abrir **Ingresos y aforo** y comprobar `vigentes = ingresados + pendientes` y las Mesas.
   “Capacidad disponible” es cupo para emitir derechos, no un conteo de personas que aún no llegaron.

## Durante recepción

Elegir el Scanner del Evento correcto. Leer el resultado completo: nombre/Mesa/Lugar en NOMINAL,
folio/Mesa en ANONYMOUS. Esperar la respuesta del servidor y usar **Siguiente escaneo** antes del
siguiente QR. La cámara permanece pausada durante una operación o resultado.

Ante resultado incierto, reintentar desde el mismo Scanner conservando la intención y su clave.
No recargar, cerrar la pestaña ni escanear como una operación nueva hasta resolverlo; la intención
vive en memoria. Otro lector puede recibir “utilizado” aunque el primero todavía espere respuesta.
Consultar el panel autoritativo y escalar cualquier contradicción. No autorizar ingreso offline.

| Situación | Actuación |
| --- | --- |
| Cámara ausente o permiso denegado | Revisar permisos y cámara trasera; pasar a otro dispositivo autorizado. No sustituir validación B01 por búsqueda manual ni un check-in inventado. |
| Red interrumpida antes del envío | Recuperar red y reintentar la misma intención; mantener la fila en espera. |
| Red perdida después del envío | Conservar pestaña e intención; reintentar con la misma clave y conciliar con el panel. No asumir rechazo ni crear otra operación. |
| QR inválido, ajeno o revocado | Revisar Evento y material entregado con el Planner. No revelar otras personas/folios ni aceptar una captura como prueba de ingreso. |
| QR utilizado | Verificar el registro con el Planner; no repetir el ingreso. ANONYMOUS no tiene reversión de uso. Correcciones NOMINAL corresponden al operador autorizado, con auditoría. |
| Staff expirado | Detener Scanner. Planner comprueba estado y emite otro acceso sólo si el Evento está operativo y el límite lo permite. No restaurar tokens expirados. |
| Evento cerrado/cancelado | Detener recepción. No evitar el cierre ni continuar con enlaces antiguos; escalar al responsable autorizado. |
| Panel desactualizado | Revisar red, `asOf`, aviso de datos antiguos y **Actualizar**. Un fallo de red no demuestra que un ingreso haya fallado. |
| ACCESS_OPERATIONS_INCONSISTENT | No usar cifras parciales ni ajustar contadores manualmente. Registrar hora, Evento y operationId seguro; detener decisiones basadas en el panel y escalar a Provider. |
| Cambio de Planner | Verificar asignación actual; el anterior pierde acceso al Evento. No compartir su sesión para eludir ownership. |

## Cierre y soporte

El operador con permisos de lifecycle cierra/cancela por el flujo autorizado. Verificar estado
persistido, expiración de Staff y rechazo de nuevas entradas. Conservar el historial y conciliar
ingresos/pendientes por Mesa. No borrar auditoría, reciclar folios ni reactivar secretos expirados.

Escalar con Evento, modalidad, hora/zona, dispositivo/navegador, acción, código seguro y operationId.
Nunca adjuntar QR operativos, StaffTokens, contraseñas, teléfonos, cookies o conexiones. Provider
investiga por rutas Admin; las acciones reservadas al Planner continúan bajo sus permisos.
Respetar anonimización de 30 días y ventanas de retención existentes; no reconstruir identidades.

## Acta manual de dispositivos físicos — pendiente

Usuario confirmó el 2026-10-23 que no hay ejecuciones físicas disponibles. Playwright y una cámara
virtual no sustituyen esta aceptación. Usar datos ficticios y material controlado; guardar evidencia
identificable con secretos ocultos. Registrar para cada fila fecha, responsable, modelo/SO, versión de
navegador, red, Evento de prueba, resultado, evidencia y defecto/ticket. No marcar aprobado sin ejecución.

| Prueba | Android / Chrome | iPhone / Safari | Tablet compatible | Aceptación |
| --- | --- | --- | --- | --- |
| Cámara trasera y permisos concedidos | Pendiente | Pendiente | Pendiente | Lectura y resultado legibles; un ingreso. |
| Permiso denegado / sin cámara | Pendiente | Pendiente | Pendiente | Estado comprensible, sin ingreso local ni bypass. |
| QR impreso | Pendiente | Pendiente | Pendiente | Material vigente se valida con servidor. |
| QR en otra pantalla | Pendiente | Pendiente | Pendiente | Sin reflejos impeditivos; no duplica ingreso. |
| QR pequeño, inclinado y poca luz | Pendiente | Pendiente | Pendiente | Registrar tamaño/ángulo/luz y límites observados; no inventar lectura exitosa. |
| Dos lectores, mismo QR nominal/anónimo | Pendiente | Pendiente | Pendiente | Un único ingreso/uso y rechazo o replay coherente. |
| Red lenta | Pendiente | Pendiente | Pendiente | Espera visible y bloqueo de segunda intención. |
| Pérdida de red antes de enviar | Pendiente | Pendiente | Pendiente | Sin autorización offline; retry seguro. |
| Pérdida después de enviar y antes de responder | Pendiente | Pendiente | Pendiente | Misma clave; un ingreso y auditoría únicos. |
| Bloqueo/reanudación del navegador | Pendiente | Pendiente | Pendiente | Recupera autoridad; no consume otra entrada. |
| Staff expira durante operación | Pendiente | Pendiente | Pendiente | Detiene cámara/acciones; no persiste autorización vieja. |
| Cierre durante recepción | Pendiente | Pendiente | Pendiente | Nuevas entradas bloqueadas, Staff expirado y panel conciliado. |

**Gate presencial: NO-GO hasta aprobar las pruebas físicas mínimas, contingencias y soporte.**
