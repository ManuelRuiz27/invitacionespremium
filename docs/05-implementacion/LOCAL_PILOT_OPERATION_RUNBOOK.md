# Runbook local — primer Evento operator-led de punta a punta

Estado: **manual operativo reproducible sobre el producto actual**  
Objetivo: probar en local un Evento `FLYER + Croquis` desde alta hasta RSVP, Seating y Check-in usando las superficies reales de Admin, Planner, Invitado y Staff.

## 1. Dos gaps conocidos antes de iniciar

Este manual no inventa controles que todavía no existen.

### Gap A — el Platform Admin todavía no puede crear el Evento

Hoy `/eventos` en Admin es una colección de solo lectura. El backend Admin tampoco expone `POST /admin/clients/:clientId/events`.

El `POST /api/v1/events` pertenece a los roles Planner/Organization. Además, `Event.createdByUserId` debe pertenecer al Cliente, mientras que `PLATFORM_ADMIN` tiene `clientId=null`. No se debe falsear el creador asignando silenciosamente una Planner que no ejecutó la creación.

Seguimiento: GitHub Issue **#34 — Operator intake — alta de Evento desde Admin** (`PRODUCT DECISION REQUIRED`).

**Workaround actual para el piloto local:** la Planner crea únicamente el shell inicial del Evento y selecciona el Servicio. Inmediatamente después, Provider/Admin toma la preparación técnica.

### Gap B — falta UI Planner para crear accesos Staff

El backend de Staff ya existe y está certificado, pero el workspace Client activo todavía no tiene sección `Staff`.

Seguimiento: GitHub Issue **#35 — Planner — gestión de accesos Staff en Evento activo** (`READY FOR CODE`).

**Workaround actual:** crear el StaffToken con el endpoint Planner y abrir el Scanner con el token resultante.

## 2. Datos de prueba

Usar el Cliente independiente sembrado para evitar mezclar el primer recorrido con permisos de Organización.

### Cuentas locales

Todas usan `LOCAL_ADMIN_PASSWORD` del `.env`.

Con `.env.example` sin modificar:

| Actor | Cuenta | Password de ejemplo |
| --- | --- | --- |
| Platform Admin / Provider | `admin@example.com` | `change-me-at-least-12-chars` |
| Planner independiente | `planner@example.com` | `change-me-at-least-12-chars` |
| Organization Admin | `organizacion.admin@example.com` | `change-me-at-least-12-chars` |
| Organization Planner | `organizacion.planner@example.com` | `change-me-at-least-12-chars` |

Cliente recomendado:

- `[LOCAL] Planner independiente`
- Client ID: `13000000-0000-4000-8000-000000000001`
- saldo inicial sembrado: 100 créditos.

### Evento de prueba

- Servicio: `Flyer`
- Nombre: `Boda Piloto Ana y Carlos`
- Tipo: `Boda`
- Fecha sugerida: una fecha futura, por ejemplo `12/09/2026 18:00`
- Zona horaria: `America/Mexico_City`
- Capacidad: `20`
- Confirmación: habilitada
- Croquis: habilitado
- Ubicación: `https://example.com/ubicacion`
- Mesa de regalos: `https://example.com/regalos`

### Lista de invitados

Fixture versionado:

`docs/05-implementacion/fixtures/local-pilot-contacts.csv`

Contiene seis Contactos ficticios agrupados como Familia novia, Familia novio y Amigos.

### Croquis sugerido

Usar cualquier JPG/PNG local no sensible como fondo y construir:

- `Mesa principal` — capacidad 6;
- `Familia novia` — capacidad 6;
- `Familia novio` — capacidad 6;
- opcional: `Pista` como zona decorativa.

### Flyer sugerido

Usar dos imágenes JPG/PNG de prueba:

- imagen principal;
- imagen QR.

Agregar cuatro zonas interactivas:

- `RSVP`;
- `LOCATION`;
- `GIFT_REGISTRY`;
- `QR_AREA`.

## 3. Levantar y sembrar el entorno

### Opción recomendada: Docker Compose

Desde la raíz del repo:

```powershell
Copy-Item .env.example .env

docker compose up --build
```

El contenedor `workspace` ejecuta automáticamente:

1. migraciones;
2. `pnpm local:seed`;
3. `pnpm dev`.

Por tanto deja sembrados Admin, Planner, Organización, servicios/precios y 100 créditos por Cliente.

### Reinicio completamente limpio

**Advertencia: elimina toda la base y FileAssets locales.**

```powershell
docker compose down -v
docker compose up --build
```

### URLs locales

- Client / Planner / Invitado: `http://localhost:5173`
- Admin / Provider: `http://localhost:5174`
- Scanner Staff: `http://localhost:5175`
- API: `http://localhost:3000/api/v1`
- Swagger local: `http://localhost:3000/docs`

### Sesiones simultáneas

La cookie de sesión usa el host `localhost`, no el puerto. Admin y Planner pueden reemplazarse mutuamente la sesión si se usan en el mismo perfil del navegador.

Para probar varios actores simultáneamente usar, por ejemplo:

- Admin: Chrome perfil A;
- Planner: Edge o Chrome perfil B;
- Invitado: ventana privada u otro navegador;
- Staff: teléfono/otro navegador/perfil separado.

## 4. Etapa A — crear el shell del Evento como Planner

> Desvío temporal por Issue #34. Esta es la única parte del alta que hoy no puede ejecutar Platform Admin.

1. Abrir `http://localhost:5173/login`.
2. Iniciar sesión con `planner@example.com`.
3. Entrar a **Eventos**.
4. Seleccionar **Crear Evento**.
5. En **Datos** seleccionar Servicio **Flyer**.
6. Capturar como mínimo el nombre `Boda Piloto Ana y Carlos`.
7. Presionar **Continuar** hacia la siguiente etapa. En ese momento el Wizard crea el Evento real.
8. Anotar el `eventId` de la URL: `/eventos/<EVENT_ID>/configuracion/...`.
9. Salir del Wizard.

No preparar Invitación ni Croquis desde Planner. El launch surface operator-led los reserva al Provider.

## 5. Etapa B — Provider/Admin toma la preparación

1. Abrir `http://localhost:5174/login` en el perfil Admin.
2. Iniciar sesión con `admin@example.com`.
3. Entrar a **Eventos**.
4. Localizar `Boda Piloto Ana y Carlos`.
5. Presionar **Ver detalle**.
6. Presionar **Preparar evento**.

La preparación Admin tiene cuatro secciones:

- Datos;
- Invitación;
- Croquis;
- Registro operativo.

## 6. Etapa C — completar Datos como Admin

En **Preparar evento → Datos**:

1. Verificar que **Servicio** muestra `FLYER`. El campo es de solo lectura en Admin.
2. Nombre: `Boda Piloto Ana y Carlos`.
3. Tipo social: `WEDDING`.
4. Fecha y hora: usar la fecha futura elegida.
5. Zona horaria: `America/Mexico_City`.
6. Capacidad: `20`.
7. URL de ubicación: `https://example.com/ubicacion`.
8. URL de mesa de regalos: `https://example.com/regalos`.
9. Marcar **Confirmación habilitada**.
10. Marcar **Croquis habilitado**.
11. Presionar **Guardar datos**.
12. Verificar mensaje **Datos guardados.**

## 7. Etapa D — preparar el Flyer como Admin

En **Preparar evento → Invitación**:

1. Presionar **Subir imagen principal** y elegir un JPG/PNG de prueba.
2. Presionar **Subir imagen QR** y elegir otro JPG/PNG.
3. Cuando ambos assets existan, presionar **Crear Flyer**.
4. Verificar que el diseño aparece y que la parte superior muestra el estado técnico de Invitación.

### Crear zonas interactivas

En **Zonas interactivas**, crear al menos estas cuatro acciones:

1. `RSVP`
2. `LOCATION`
3. `GIFT_REGISTRY`
4. `QR_AREA`

Para una prueba funcional basta con geometrías válidas dentro de `0..1`. Ejemplo:

| Acción | x | y | ancho | alto |
| --- | ---: | ---: | ---: | ---: |
| RSVP | 0.10 | 0.10 | 0.25 | 0.10 |
| LOCATION | 0.10 | 0.25 | 0.25 | 0.10 |
| GIFT_REGISTRY | 0.10 | 0.40 | 0.25 | 0.10 |
| QR_AREA | 0.60 | 0.60 | 0.25 | 0.25 |

Después de cada acción guardar la zona y comprobar que aparece en el listado.

Objetivo final: el módulo debe mostrar **Invitación técnicamente lista**.

## 8. Etapa E — construir Croquis como Admin

En **Preparar evento → Croquis**:

1. Si aún no existe plano, subir un JPG/PNG de prueba como fondo.
2. Usar el catálogo Sticker para colocar una Mesa.
3. Nombrarla `Mesa principal` y capacidad `6`.
4. Guardar.
5. Colocar una segunda Mesa: `Familia novia`, capacidad `6`.
6. Guardar.
7. Colocar una tercera Mesa: `Familia novio`, capacidad `6`.
8. Guardar.
9. Opcional: añadir `Pista` como zona decorativa.
10. Mover/acomodar los elementos hasta que el Croquis sea legible.
11. Ejecutar la acción de **bloquear** el Croquis para dejar la geometría lista para Planner.
12. Recargar/actualizar el plano y verificar que las tres Mesas permanecen.

Una vez bloqueado, Planner podrá usar la geometría para Seating pero no editarla.

## 9. Etapa F — cargar invitados como Planner

Volver al perfil Planner.

1. Abrir **Eventos**.
2. Entrar a `Boda Piloto Ana y Carlos`.
3. Mientras siga en preparación, el sistema redirigirá al Wizard.
4. Entrar a **Invitados**.
5. Presionar **Importar lista**.
6. Seleccionar:
   `docs/05-implementacion/fixtures/local-pilot-contacts.csv`.
7. Revisar el preview.
8. Debe indicar 6 registros válidos y 0 inválidos.
9. Presionar **Confirmar importación**.
10. Verificar que aparecen los seis Contactos.

Cada Contacto crea también su Invitación y Asistente principal; no es necesario crear invitaciones manualmente.

Si se desea probar alta individual, los campos son:

- Nombre;
- Número de WhatsApp;
- Grupo;
- botón **Agregar**.

## 10. Etapa G — revisar y activar como Planner

1. Ir a **Revisión**.
2. Verificar los checks:
   - Datos del Evento;
   - Invitados;
   - Invitaciones activas;
   - Invitación;
   - Confirmación de asistencia;
   - Ubicación;
   - Mesa de regalos;
   - Mesas listas.
3. Si algo Provider-managed aparece pendiente, volver al Admin y corregir Invitación/Croquis.
4. Cuando el estado muestre **Todo está listo para activar este evento**, revisar el saldo.
5. El seed deja 100 créditos al Planner independiente; Flyer consume el precio vigente sembrado.
6. Presionar **Activar Evento**.
7. En el diálogo revisar el costo.
8. Presionar **Confirmar activación**.
9. Verificar mensaje **El evento quedó activado correctamente.**
10. Presionar **Enviar invitaciones**.

## 11. Etapa H — operar distribución como Planner

En el Evento activo, pestaña **Invitaciones**:

1. Verificar el resumen de invitaciones.
2. Buscar `Ana Torres`.
3. Probar **Copiar enlace**.
4. Probar **Abrir invitación**.
5. Opcional: **Enviar por WhatsApp** abre WhatsApp con el link individual preparado.

Para la prueba local no es necesario enviar mensajes reales. Copiar/Abrir el link es suficiente.

Repetir con al menos tres invitados si se quiere probar Seating con varias personas confirmadas.

## 12. Etapa I — ingresar como Invitado y confirmar RSVP

Usar un navegador/perfil de Invitado sin sesión Planner/Admin.

1. Abrir el link individual de `Ana Torres` obtenido desde Planner.
2. La ruta será similar a:
   `http://localhost:5173/invitacion/<TOKEN>`.
3. Verificar nombre/fecha del Evento y diseño Flyer.
4. Presionar **Confirmar asistencia**.
5. En el diálogo revisar a la persona principal.
6. Si no hay acompañantes autorizados, confirmar directamente.
7. Presionar **Confirmar asistencia**.
8. Verificar **Tu confirmación quedó guardada.**
9. Verificar que aparece **Ver mi QR** cuando el RSVP ya está confirmado.
10. Abrir el QR y mantenerlo disponible para el Scanner.

Repetir este proceso para 2–3 invitados para probar distribución de Mesas.

También puede probarse **No asistiré** con otro invitado distinto.

## 13. Etapa J — asignar Mesas como Planner

Volver al Evento activo como Planner.

1. Entrar a **Mesas y distribución**.
2. Verificar que el Croquis es de solo lectura.
3. Seleccionar `Familia novia`.
4. El panel debe abrir en **Sin mesa**.
5. Seleccionar uno o más invitados confirmados.
6. Presionar el CTA de asignación a la Mesa seleccionada.
7. Verificar que cambia la ocupación.
8. Cambiar a **En esta mesa** para verificar a las personas ya asignadas.
9. Repetir con `Familia novio` o `Mesa principal`.
10. Probar mover una persona a otra Mesa si se desea.

Antes del check-in, el invitado que se escanee debe estar confirmado y asignado a una Mesa porque este Evento tiene Croquis habilitado.

## 14. Etapa K — crear acceso Staff

> Workaround temporal por Issue #35. Backend real, pero todavía sin UI Planner.

El Evento debe estar `ACTIVE` o `EVENT_DAY`.

### 14.1 Login Planner por terminal

En PowerShell, desde cualquier carpeta:

```powershell
curl.exe -i -c planner.cookies `
  -H "Origin: http://localhost:5173" `
  -H "Content-Type: application/json" `
  -d '{"email":"planner@example.com","password":"change-me-at-least-12-chars"}' `
  http://localhost:3000/api/v1/auth/login
```

Si modificaste `LOCAL_ADMIN_PASSWORD` en `.env`, usa ese valor.

### 14.2 Crear StaffToken

Sustituir `<EVENT_ID>`:

```powershell
curl.exe -s -b planner.cookies `
  -H "Origin: http://localhost:5173" `
  -H "Content-Type: application/json" `
  -d '{"alias":"Acceso principal"}' `
  http://localhost:3000/api/v1/events/<EVENT_ID>/staff-tokens
```

La respuesta `201` contiene un secreto que empieza por `st1.`. **Ese token sólo se entrega en la creación; copiarlo inmediatamente.**

Un Evento admite como máximo tres StaffTokens activos.

## 15. Etapa L — operar como Staff

1. En otro navegador/dispositivo abrir:
   `http://localhost:5175/scanner/<STAFF_TOKEN>`.
2. Verificar:
   - nombre del Evento;
   - `Staff: Acceso principal`;
   - estado operativo.
3. La app ofrece:
   - **Cámara**;
   - **Buscar**;
   - **Croquis**.

### Entrada por QR

1. En el dispositivo Invitado abrir **Ver mi QR**.
2. En Scanner → **Cámara**, escanear el QR.
3. Verificar que aparece el invitado pendiente y su Mesa.
4. Confirmar el ingreso.
5. Debe aparecer **Ingreso registrado: [nombre].**
6. Presionar **Siguiente escaneo**.

### Contingencia por búsqueda

1. Abrir **Buscar**.
2. Buscar el nombre exacto, por ejemplo `Ana Torres`.
3. Seleccionar la coincidencia.
4. Confirmar ingreso.

La búsqueda no usa teléfono ni fuzzy matching.

### Segundo intento

Volver a escanear el mismo QR después del ingreso. El sistema no debe crear una segunda entrada activa; debe reflejar que ya no hay asistentes pendientes o devolver la protección contractual correspondiente.

## 16. Etapa M — validar desde los cuatro actores

### Provider/Admin

- Evento visible en Admin;
- Invitación técnicamente lista;
- Croquis bloqueado;
- `Registro operativo` disponible para documentar minutos/incidencias.

### Planner

- Evento `ACTIVE`;
- Invitaciones compartibles;
- respuestas RSVP visibles;
- Croquis read-only;
- Seating modificable.

### Invitado

- invitación pública abre sin login;
- RSVP guarda respuesta;
- QR aparece sólo después de confirmar.

### Staff

- StaffToken abre Scanner sin login Planner;
- ve sólo información operativa necesaria;
- check-in registra individualmente;
- no expone teléfonos.

## 17. Registrar evidencia del piloto

Como Admin, abrir:

`/eventos/<EVENT_ID>/preparar/registro`

Registrar al menos:

- Tiempo de preparación / Invitación;
- Tiempo de preparación / Croquis;
- Soporte a Planner;
- Incidencia / Check-in si ocurrió;
- Cambio de último minuto si ocurrió;
- Trabajo manual repetitivo.

Esto alimenta el journal PILOT-02 sin bloquear el Evento.

## 18. Criterio de prueba exitosa

La prueba local es satisfactoria cuando se demuestra, para el mismo Evento:

1. Planner crea el shell temporalmente por el gap #34;
2. Admin prepara Datos, Flyer y Croquis;
3. Planner carga Contactos;
4. Evento alcanza `READY_TO_ACTIVATE` y se activa;
5. Planner obtiene/abre un link de Invitación;
6. Invitado confirma y obtiene QR;
7. Planner asigna Mesa;
8. se crea StaffToken real;
9. Staff abre Scanner;
10. Scanner identifica invitado + Mesa y confirma Check-in;
11. el segundo intento no duplica el ingreso;
12. Provider registra evidencia operativa.

## 19. Qué no considerar “funcionando por UI” todavía

Hasta resolver los issues detectados:

- **#34:** el primer alta del Evento no es Admin-led; la Planner crea el shell y Servicio.
- **#35:** StaffToken no se crea desde el workspace Planner; se usa endpoint/terminal.

Estos dos puntos son gaps de superficie descubiertos al convertir la certificación técnica en un procedimiento humano completo. El resto del recorrido anterior utiliza las superficies implementadas del producto.