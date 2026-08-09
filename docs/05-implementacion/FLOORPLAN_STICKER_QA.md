# QA / Definition of Done — Croquis Sticker y Asientos Opcionales

Este documento complementa `FLOORPLAN_STICKER_SEATING_CONTRACT.md`.

## A. Regresión obligatoria del editor actual

- [ ] Círculos permanecen físicamente circulares en planos horizontal, vertical y cuadrado.
- [ ] Cuadrados permanecen físicamente cuadrados.
- [ ] Rectángulos conservan proporciones directas.
- [ ] Coordenadas persistidas siguen normalizadas.
- [ ] Rotación no altera el centro ni corrompe resize.
- [ ] Polígonos mantienen 3–64 puntos válidos y edición local correcta.
- [ ] Touch no provoca scroll accidental durante manipulación.
- [ ] Targets táctiles críticos mantienen al menos 44×44 px.
- [ ] Cancelar edición conserva fuente autoritativa sin mutación.
- [ ] Una edición activa no puede perderse al iniciar otra acción incompatible.
- [ ] Mutación confirmada + fallo de refresh no repite POST/PATCH/DELETE.
- [ ] Finalizar/Editar distribución conserva semántica y permisos.
- [ ] FileAsset del plano sigue siendo privado y Object URL se revoca.

## B. Inventario Sticker

- [ ] Crear múltiples Mesas por forma/capacidad en una sola operación de UI.
- [ ] No se crea entidad `Sticker` en dominio.
- [ ] Cada Mesa recibe ID autoritativo independiente del nombre visible.
- [ ] Renombrar Mesa no cambia ID.
- [ ] Bandeja identifica correctamente Mesas sin colocar.
- [ ] Click-to-place y drag-to-place producen coordenadas válidas.
- [ ] Auto-place no genera formas fuera del plano.
- [ ] 200 Mesas pueden visualizarse y manipularse sin bloqueo perceptible del hilo principal.

## C. Canvas/Konva

- [ ] Paridad visual con FloorplanShape existente antes de retirar overlay anterior.
- [ ] `onDragMove`/transform equivalente no persiste continuamente en API.
- [ ] Fin de interacción persiste una sola actualización estable salvo retry contractual.
- [ ] Zoom no altera coordenadas persistidas.
- [ ] Pan no altera coordenadas persistidas.
- [ ] Reset/Fit View recupera plano completo.
- [ ] Pinch zoom funciona en touch.
- [ ] Selección sigue accesible por alternativa DOM/teclado cuando corresponda.

## D. Snap y productividad

- [ ] Snap puede activarse/desactivarse.
- [ ] Desactivar snap permite precisión libre.
- [ ] Guías no se persisten como entidades.
- [ ] Align/distribute conserva IDs y datos de capacidad.
- [ ] Undo/redo no duplica mutaciones.

## E. Color y accesibilidad

- [ ] Cambio de color actualiza el sticker inmediatamente.
- [ ] Colores recientes conservan últimos cinco valores útiles.
- [ ] Contraste del texto se calcula, no se decide únicamente por umbral visual arbitrario.
- [ ] Estado seleccionada/completa/error/read-only no depende exclusivamente del color.

## F. Sillas visuales

- [ ] Default: ocultas.
- [ ] Mostrar sillas no activa asignación individual.
- [ ] Modo visual simple puede derivarse exclusivamente de capacidad.
- [ ] Distribución respeta forma circular/cuadrada/rectangular.
- [ ] Ocultar sillas reduce nodos visuales sin modificar capacidad ni asignaciones.
- [ ] Evento masivo puede operar con sillas ocultas sin costo visual innecesario.

## G. Seat capability — solo cuando exista

- [ ] Eventos existentes siguen en modo Mesa tras migración.
- [ ] Activación es explícita y no accidental.
- [ ] Se generan lugares iniciales consistentes con capacidad.
- [ ] Cada Seat tiene ID estable.
- [ ] Mover/renumerar Seat no cambia ID.
- [ ] Dos asistentes no pueden ocupar el mismo Seat, incluso bajo concurrencia.
- [ ] Un Seat ocupado no se elimina silenciosamente.
- [ ] Asignar Seat conserva asociación con Mesa.
- [ ] Desactivar Seat mode aplica la política documentada sin perder asociación de Mesa.
- [ ] Capacidad y número de lugares activos no pueden divergir según la autoridad acordada.
- [ ] Auditoría no registra PII innecesaria.

## H. Split View

- [ ] Abre desde una Mesa seleccionada mediante acción visible; doble clic no es obligatorio.
- [ ] Búsqueda responde con ~1,800 asistentes sin renderizar todas las filas simultáneamente.
- [ ] Filtro por Grupo funciona sin cambiar modelo de Grupo.
- [ ] Tabs Sin asignar/Asignados se actualizan tras éxito autoritativo.
- [ ] Bulk assignment valida capacidad.
- [ ] En Seat mode, bulk assignment ocupa solo lugares válidos/libres.
- [ ] Drag a Seat no permite doble ocupación.
- [ ] Quitar asignación devuelve el asistente al estado correspondiente sin perder integridad.

## I. Responsive

- [ ] Desktop: canvas dominante + panel contextual usable.
- [ ] Tablet landscape: canvas y paneles touch-safe.
- [ ] Mobile: no comprime artificialmente layout desktop; usa bottom sheet/pantalla dedicada.
- [ ] Orientación y resize del viewport no desplazan entidades persistidas.

## J. Live / Scanner

- [ ] Vista operativa bloquea drag/resize/rotate.
- [ ] Realtime existente actualiza proyección o invalida/refresca según contrato actual.
- [ ] Recuperación REST sigue siendo autoridad tras reconexión/evento realtime.
- [ ] Evento sin Seat muestra Mesa y funciona normalmente.
- [ ] Evento con Seat puede mostrar Mesa + Asiento como dato adicional.
- [ ] QR válido no se rechaza únicamente por ausencia de Seat salvo que una regla de negocio futura explícita lo ordene.
- [ ] Feedback de scanner combina icono + texto + color.
- [ ] Cierre/cancelación conservan bloqueos actuales.

## K. Performance

Medir al menos:

- 50 asistentes / 5–10 Mesas;
- 600 asistentes / ~60 Mesas;
- 1,800 asistentes / ~180 Mesas;
- 200 Mesas con sillas ocultas;
- escenario boutique con 20 Mesas y sillas visibles/asignables.

No aceptar `60fps` como afirmación sin profiling reproducible. Registrar dispositivo/browser, cantidad de nodos, FPS aproximado y duración de interacciones críticas.

## L. Gates de repositorio

Antes de merge:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Si cambia API/Prisma/OpenAPI, además ejecutar generación del SDK, `generate:check`, validación Prisma, migraciones y pruebas de integración correspondientes.
