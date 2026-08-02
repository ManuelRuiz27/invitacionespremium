# Contrato del Cliente público

## Alcance y arquitectura

`CODEX-122` implementa exclusivamente la experiencia pública de `apps/client`:

```text
/invitacion/:invitationToken
/album/:albumToken
```

Ambas rutas son árboles hermanos del árbol autenticado. No se montan dentro de `AuthProvider`,
`ProtectedRoute`, `RoleRoute` ni `ClientShell`; por ello no consultan `/auth/me`, Eventos o Finanzas y no
presentan navegación operativa. El wildcard público es neutro y no redirige a `/eventos`. Las rutas
privadas conservan todos sus guards.

Los tokens viven únicamente en el parámetro de ruta y closures efímeros. No se escriben en Web Storage,
cookies, IndexedDB, cache persistente, TanStack Query, logs ni mensajes. `index.html` aplica
`referrer=no-referrer`. No existe service worker ni Cache Storage.

## SDK y transporte

`packages/api-client` toma sus tipos exclusivamente de `generated/schema.ts` y expone:

```http
GET   /public/invitations/:invitationToken
POST  /public/invitations/:invitationToken/confirm
POST  /public/invitations/:invitationToken/reject
PATCH /public/invitations/:invitationToken/assistants
GET   /public/invitations/:invitationToken/qr.svg
GET   /public/invitations/:invitationToken/assets/:fileAssetId/content
GET   /public/albums/:albumToken
GET   /public/albums/:albumToken/photos/:photoId/content
```

El requester público codifica cada segmento, propaga `AbortSignal`, usa `credentials: omit` y admite
JSON, `Blob`, texto, errores JSON/no JSON y `204`. No participa en expiración de sesión ni modifica cache
privada. Los validadores comprueban las formas mínimas discriminadas de Invitación, mutación y Álbum;
un `200` incompleto o incompatible se rechaza como `UNEXPECTED_API_RESPONSE` antes de llegar a React.

## Aislamiento y concurrencia en memoria

Cada ruta mantiene un coordinador efímero con token, generación, estado montado y controllers por tipo
de operación. Antes de cualquier `setState`, la respuesta demuestra que el componente sigue montado,
el token y la generación siguen vigentes, el request no fue abortado y su controller continúa siendo el
último registrado. Cambiar de token o desmontar aborta lectura, retry, mutación y reconciliación; además
cierra diálogos y limpia errores/notices anteriores.

Los reintentos siguen `latest-wins`: iniciar uno aborta el anterior y sólo la generación más reciente
puede presentar resultado. `confirm`, `reject` y `updateAssistants` reciben un `AbortSignal` específico y
una referencia síncrona bloquea dos envíos de la misma intención antes de que React pinte `busy`. Un
aborto por navegación se descarta sin mensaje.

## Estados de Invitación

La unión discriminada OpenAPI dirige la presentación:

- `AVAILABLE`: Evento público, fecha, Flyer/Flipbook, Hotspots, respuesta, nombres nominales y acciones;
- `CANCELLED`: solo el mensaje de Invitación o Evento autorizado por la API;
- `CLOSED`: “Este evento ha finalizado.” y, si existe, la proyección del Álbum;
- error/no encontrado: “Esta invitación no está disponible.” sin distinguir expiración, eliminación,
  pertenencia o token inválido.

La UI no presenta `clientId`, `contactId`, teléfonos, nonces, storage keys, checksum, finanzas ni IDs que
no sean necesarios para enviar de vuelta un acompañante conservado.

## Flyer, Flipbook y Hotspots

Los assets se obtienen solo mediante un `contentPath` con forma exacta del endpoint público y token
actual. El frontend extrae el UUID permitido, solicita bytes, crea un Object URL y lo revoca al reemplazar
o desmontar. Flyer, página Flipbook y foto muestran `No pudimos cargar este contenido.` y permiten
reintentar únicamente ese asset; el retry aborta el intento anterior y revoca cualquier URL reemplazada.
Nunca construye storage keys ni usa proxies externos.

Flyer conserva proporción y superpone coordenadas relativas. Flipbook ordena por la posición recibida,
carga la página actual, ofrece anterior/siguiente, flechas y swipe, y mantiene Hotspots en la página
correspondiente. `prefers-reduced-motion: reduce` elimina la transición del Flipbook y fija en cero la
duración de los diálogos RSVP, QR y preview, sin quitar swipe, teclado ni estados.

Acciones: `RSVP` abre Confirmación; `QR_AREA` abre QR o explica su indisponibilidad; `LOCATION`,
`GIFT_REGISTRY` y `EXTERNAL_LINK` solo abren HTTPS. Todo enlace externo usa `noopener noreferrer` y
`referrerPolicy=no-referrer`. No se usa `dangerouslySetInnerHTML`.

## Confirmación nominal

Los textos visibles son “Aún no has confirmado”, “Asistencia confirmada” y “No asistirás”. El principal
es obligatorio e inmutable. El payload contiene exclusivamente acompañantes adicionales:

- conservar UUID mantiene identidad;
- editar conserva UUID y cambia nombre;
- agregar omite UUID;
- retirar omite del payload el UUID existente.

La UI limita entradas a `additionalAssistantLimit`; backend sigue siendo autoridad para capacidad,
pertenencia y estados. Rechazar exige confirmación explícita y no elimina nombres localmente. Una
Invitación confirmada puede modificar acompañantes mientras `confirmation.open` sea verdadero.

Después de toda mutación se vuelve a resolver la Invitación. Ante error de red o `5xx`, se consulta el
estado autoritativo y se compara estado/conjunto nominal: si coincide, se acepta; de lo contrario la
intención queda disponible para reintento, sin duplicación ni persistencia. Mutación y reconciliación
conservan el token/generación originales; si cambia la ruta, ambos resultados se descartan. Editar el
formulario, cerrarlo o cambiar de token limpia el error anterior.

## QR

El botón “Ver mi QR” y el Hotspot operativo existen únicamente con `qr.available === true`. El SVG se
solicita bajo demanda, se presenta como Blob/Object URL y nunca se inserta como HTML. El diálogo de MUI
contiene foco, cierra con Escape, ofrece vista de pantalla completa, presenta la leyenda obligatoria y
revoca el URL al cerrar. Un fallo muestra `No pudimos preparar el QR.`, `Reintentar` y `Cerrar`; el
reintento mantiene abierto el diálogo, aborta el intento previo y solicita exclusivamente el SVG.

## Álbum

Una proyección `AVAILABLE` solo navega si `contentPath` coincide exactamente con
`/api/v1/public/albums/:albumToken`. Se decodifica una vez y se vuelve a codificar en la ruta frontend;
URLs externas, query, fragment, traversal y paths arbitrarios se rechazan. `RESTRICTED` muestra
“Álbum disponible solo para asistentes” sin CTA.

La ruta de Álbum resuelve exclusivamente su token. Aplica colores `#RRGGBB` validados, nombre público,
título, agradecimiento, hasta 35 fotos autorizadas y botón HTTPS opcional. Las fotos se activan por
intersección, preservan proporción y se abren en diálogo con flechas, swipe, Escape, foco y posición. Cada
preview reutiliza el Object URL del grid cuando sigue disponible. Un pool LRU mantiene como máximo ocho
Object URLs de fotos: al exceder el límite revoca las más antiguas, conserva la seleccionada cuando está
en el pool y revoca todas al abandonar el Álbum. No existe cache persistente. Token inválido, vencimiento,
despublicación, archivo o recurso ajeno comparten “Este álbum no está disponible.”

## Errores y accesibilidad

Los códigos RSVP, storage y QR se traducen a mensajes públicos estables. Solo `operationId` puede aparecer
como referencia secundaria. Ningún error imprime el token o detalles internos.

Cada vista mantiene un solo `h1`, landmarks, jerarquía de encabezados, botones reales, labels, regiones
vivas, foco visible, targets táctiles y navegación completa por teclado. Los diálogos MUI proporcionan
focus trap y Escape. Los `alt` son neutrales y no contienen PII.

## Pruebas y límites

Las pruebas cubren requester sin cookies, codificación, abortos, JSON/Blob/errores, rutas sin sesión,
cancelación, Flyer/Flipbook, Hotspots HTTPS, Confirmación individual/familiar, edición y rechazo, QR bajo
demanda, revocación, `contentPath`, estados de Álbum, tema, galería, teclado y preview. Promesas diferidas
demuestran carreras entre tokens, retries latest-wins, abort de las tres mutaciones, reconciliación
obsoleta, retry de QR/assets, doble clic, reduced motion y límite/revocación del pool con 35 fotos.

No se implementan gestión autenticada del Álbum, Scanner, check-in, StaffTokens, Admin, Landing,
Socket.IO frontend, PWA, analytics ni `CODEX-130`.
