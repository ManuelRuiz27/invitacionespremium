# Guías de control de acceso

Material del escenario ficticio **Salón Jardines del Lago**, generado con las aplicaciones reales.

- [Cómo preparar un salón](./01_MANUAL_ADMIN.pdf) · [fuente HTML](./01_MANUAL_ADMIN.html).
- [Guía para recibir a tus invitados](./02_MANUAL_SALON.pdf) · [fuente HTML](./02_MANUAL_SALON.html).
- [Prueba de usabilidad](./03_PRUEBA_USABILIDAD.pdf) · [fuente HTML](./03_PRUEBA_USABILIDAD.html). Entregar por separado; no contiene respuestas.
- [Índice de capturas](./INDICE_CAPTURAS.md).

Los HTML se pueden abrir sin conexión. Están preparados para teléfono e impresión tamaño carta.
Los contornos discretos señalan controles reales; las franjas oscuras ocultan datos privados y la cámara.

## Regeneración desde un clon

Requisitos habituales del repositorio: Node 22.13+, pnpm 11.15.1 y PostgreSQL **local** con permiso para crear bases.
No utilizar una conexión de producción, staging compartido o una cuenta real. El capturador rechaza hosts distintos
de `localhost`, `127.0.0.1` y `::1`. `DATABASE_URL` sólo permite conectar al servidor local: cada ejecución crea
una base nueva, aplica migraciones y elimina exclusivamente esa base. No ejecuta integración destructiva sobre la base de origen.

```sh
pnpm install --frozen-lockfile
pnpm --filter @invitaciones/api db:generate
pnpm --filter '@invitaciones/client^...' build
pnpm exec playwright install --with-deps chromium
pnpm access-control-guide:capture
```

Definir `DATABASE_URL` fuera del repositorio o en `.env` ignorado antes de generar Prisma y capturar.
Mantener libres 5300, 5373, 5374 y 5375. Un puerto ocupado detiene el proceso sin terminar procesos ajenos.
El comando reutiliza `scripts/run-access-control-e2e.mjs --guide`, con configuración y journey separados de los E2E operativos.
Opcionalmente `GUIDE_SOURCE_COMMIT` registra el commit fuente en el inventario; no debe contener secretos.

Los datos se crean mediante UI, salvo el bootstrap mínimo heredado del harness: usuario administrativo y servicio.
La Organización, su administrador, coordinador, eventos, invitados, importación, emisión,
lote, revocación, activación y accesos de recepción pasan por operaciones reales. Cada evento tiene capacidad 30.
Se registran cinco invitados sin teléfono y seis folios; uno se revoca y otro se utiliza. Se verifica un ingreso
y cuatro pendientes por modalidad. Las fechas se fijan en noviembre del año siguiente, zona `America/Mexico_City`.
Recepción utiliza el Staff temporal existente; no se crea un rol ni una cuenta permanente de recepción.

La cámara virtual recibe los píxeles del SVG real descargado. El lector del producto decodifica el QR y la API
registra la entrada. No se interceptan respuestas ni se sustituyen componentes. Esto no certifica cámaras físicas,
impresión, red o aceptación presencial del piloto.

## Seguridad y publicación

- No se escriben imágenes sin máscara, estado del navegador, HTML de las pantallas, respuestas API, traces ni vídeos.
- Antes del PNG se enmascaran contraseñas, valores Staff, enlaces privados visibles, identificadores operativos y medios que pudieran contener QR.
- Las descargas con material funcional permanecen en el contexto temporal del navegador y se eliminan; no se copian a documentación.
- Los PNG se optimizan sin metadata. El inventario guarda rutas saneadas, resolución, sección comprobada, hash y rectángulos de máscara. Un digest del código de las cuatro apps y paquetes compartidos obliga a regenerar si cambia el producto.
- Un segundo control inspecciona los píxeles en memoria y oculta cualquier QR decodificable antes de escribir el PNG. El verificador exige inventario completo y exclusivo, hashes iguales, máscaras opacas (incluidas las obligatorias de contraseña, Staff y cámara) y ausencia de QR decodificable en la imagen completa y mosaicos superpuestos.
- Sólo después de validar se copian PNG e inventario a la carpeta versionada. Los servicios y la base propios se eliminan al finalizar, también si falla el journey. En Linux se terminan los grupos de procesos propios; Windows usa el árbol del PID propio.
- Los E2E operativos conservan captura, vídeo y trace desactivados. CI valida los recursos publicados y vuelve a renderizar las guías sin subir artefactos de operación.

```sh
pnpm access-control-guide:test
pnpm access-control-guide:verify
pnpm access-control-guide:render
```

`render` reutiliza sólo PNG verificados, genera recortes, HTML/PDF e índice y comprueba imágenes, desbordamiento, ancho móvil y número de páginas. `verify` comprueba también que cada recorte derive exactamente de su PNG con máscara y que los PDF sean carta con la paginación prevista.
Para actualizar el contenido editorial se modifica `scripts/access-control-guide/content.mjs` y se vuelve a ejecutar `render`.
Los HTML son fuentes editables portables; las referencias a imágenes son relativas. No hay fuentes remotas ni recursos de M01 reutilizados.

## Alcance y revisión

Los ejemplos no usan Croquis ni Mesas, que son opcionales en UX02. No se presenta una pantalla de acomodo sin haberla ejecutado.
El administrador de InvitacionesPremium prepara y activa; el coordinador registra/emite y crea Staff; recepción sólo escanea.
El administrador de la Organización también inicia sesión y comprueba su alcance sobre ambos eventos.
El Admin global sólo consulta agregados de ingreso; no recibe nombres ni opera como coordinador.

La hoja de usabilidad se ejecuta en un entorno de prueba con material controlado. El evaluador prepara los estados
necesarios y entrega el CSV y los pases aparte. No compartir el manual con el participante durante la prueba.
La comprensión por personas nuevas se comprobará con esa sesión; no se declara validación humana sin ejecutarla.
