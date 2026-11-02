# CALCA-BLOCKER-05 — Selección escalable de Mesas por nombre

**Resultado: PASS del ticket.** La recertificación CALCA-06 y la autorización comercial siguen pendientes.

Base: `main`, `6e9a850abb7f8acd0278169d7e4901f832bfb566`. Alcance: selector Planner y contención del renderer; sin cambios API/DB/SDK/dominio, Scanner, semántica de asignación ni algoritmo BLOCKER-04.

## Causa y cambio

La nube genérica de botones «Mesas y zonas» se expandía con 100/200 Shapes. La grid del canvas admitía un ancho mínimo intrínseco determinado por el Stage anterior; al seleccionar una Mesa y reducirse la columna, ese tamaño y su pintura podían interferir con controles fuera de su área.

Planner ahora usa `TableNameSelector`, un Autocomplete MUI alimentado por los TABLE ya cargados. Filtra localmente por nombre, permite teclado/puntero/touch, limita la lista a `min(320px, 40dvh)` con scroll interno y conserva targets de al menos 44 px. No hay endpoint de búsqueda, paginación ni dependencia nueva. La lista aparece en portal sólo mientras está abierta y se desmonta al cerrar.

El valor procede exclusivamente de `selectedTableId`/`selectedTable`; elegir llama al mismo `selectTable` del canvas. Un Seat sigue determinando su padre por el callback vigente. Limpiar/cerrar utiliza `clearSelection` y conserva las reglas existentes de Scope, selección de personas y lugares. No se asigna una persona por elegir nombre. DECORATIVE_ZONE nunca entra en las opciones.

La nueva prop presentacional `showShapeList={false}` oculta la nube sólo en Planner. Su default conserva la lista de Builder/Admin y demás consumidores. La Surface limita ancho mínimo, usa una track `minmax(0, 1fr)` y aplica contención de pintura/overflow en el host. No se añaden z-index arbitrarios ni se cambia la resolución espacial de Seats.

En el baseline, 1024 px aún usaba el panel desktop (`down(md)`); se usa el Drawer ya existente hasta `lg` para cumplir el recorrido tablet sin comprimir el canvas en dos columnas. A 1440 se conserva el panel lateral. No se rediseña su contenido, anchor móvil, permisos ni mutaciones. El selector permanece fuera del Drawer y no es un modal de pantalla completa.

Los nombres activos exactos repetidos no están autorizados por el índice único parcial `floorplan_shape_active_name_key`. La reproducción utiliza nombres humanos largos con prefijo repetido. El componente además tiene keys/equality por ID y un ordinal defensivo para nombres idénticos sintéticos; eso no amplía el contrato persistente.

## QA y reproducción

Comandos focalizados:

```powershell
pnpm --filter @invitaciones/client exec vitest run src/workspace/ActiveEventWorkspacePage.test.tsx src/workspace/TableNameSelector.test.tsx
pnpm --filter @invitaciones/floorplan test
pnpm --filter @invitaciones/admin exec vitest run src/events/admin-event-preparation.test.tsx
pnpm exec turbo run lint typecheck build --filter=@invitaciones/floorplan... --filter=@invitaciones/client... --filter=@invitaciones/admin... --filter=@invitaciones/scanner... --concurrency=1
```

Client **56/56**, Floorplan **134/134**, Admin **149/149**. Lint/typecheck/build de dependencias y consumidores **18/18**. Se conserva el warning heredado de bundle >500 kB. El nuevo test compartido comprueba que la nube se omita en Planner y siga montándose por default; la suite incluye las regresiones DOM/Konva de BLOCKER-04.

Publicación de guías **PASS en su primer run**: journey UX02, 39 PNG verificados por inventario/hashes/máscaras y sin QR decodificable, PDF de 14/21/2 páginas con assertions de imágenes, paginación, overflow y ancho móvil; cinco tests de tooling. Se conservan los nuevos PDF Admin/Salón y se restaura Usabilidad porque sólo cambiaba metadata CreationDate/ModDate. La verificación final coteja el mismo runtime del producto y los artefactos; no se altera el verificador ni sus crops.

El primer run Client termina en 55 PASS / 1 FAIL: `openOnFocus` reabría el selector al restaurar foco después de cerrar el Drawer. Se retira esa opción y el segundo run pasa 56/56 sin cambiar assertions ni timeouts. Typecheck, Floorplan y Admin pasan inicialmente. El primer lint del harness rechaza declarar `navigator` como global porque ya es builtin; el lint final pasa tras retirar sólo esa declaración.

El primer journey nativo se detiene por un selector del arnés que incluía el Drawer oculto de navegación del shell, además del de asignación. Se acota a los test IDs de asignación, sin alterar producto. El segundo pasa las seis combinaciones de escala/viewport y 34 comprobaciones geométricas; se detiene al exigir que la petición lazy ya estuviera interceptada inmediatamente después de aparecer el fallback. El arnés pasa a esperar esa señal con el timeout existente antes de comprobar DOM. Cada intento se conserva por separado; no se convierten los pasos no ejecutados en PASS por inferencia.

El tercero confirma también el fallback DOM desktop y llega al tablet; su assertion de marcador no incluía elementos bajo `aria-hidden` mientras el Drawer legítimo estaba abierto. Se permite sólo la lectura del atributo del marcador bajo el modal, sin forzar interacción con el fondo. Los pasos de interacción siguen siendo nativos y se cierra el Drawer antes de operar canvas/selector.

El cuarto confirma los ocho escenarios gráficos y llega a asignar por TABLE con DB correcta; se detiene porque el guion buscaba «Cambiar mesa» en lugar del botón vigente «Cambiar mesa de 1». Se corrige únicamente el selector del arnés. Los logs y resultados anteriores permanecen separados de la ejecución final.

El quinto pasa 36 geometrías, los ocho escenarios gráficos, doce selecciones de lugares y los consumidores TABLE/SEAT desktop. En SEAT tablet, después del movimiento ya confirmado en DB, intenta cerrar el Drawer durante la transición de salida del diálogo; sus controles aún estaban bajo `aria-hidden`. El arnés espera la desaparición del diálogo y la visibilidad del botón antes de hacer el mismo tap de cierre, con los timeouts vigentes. La ejecución final añade el punto normalizado exacto de BLOCKER-04 y sus vecinos más próximos a la fixture vertical de 50 lugares. Se mantienen las assertions de IDs, geometría y autoridad; no se aumentan timeouts ni reintentos ni se cambia el producto por esos ajustes del arnés.

## Matriz de escala y capturas

| Mesas | 1440                  | 1024×768            | Selecciones distintas por viewport |
| ----- | --------------------- | ------------------- | ---------------------------------: |
| 50    | nombre/teclado/canvas | nombre/touch/Drawer |                                  3 |
| 100   | nombre/teclado/canvas | nombre/touch/Drawer |                                  3 |
| 200   | nombre/teclado/canvas | nombre/touch/Drawer |                                 10 |

La reproducción registra el rectángulo del canvas, su intersección de pintura con el host, selector, resumen y los resultados `elementFromPoint` sobre el resumen y el botón Ajustar. El resumen no se sustituye por un marcador ficticio: se activa mediante pointer/touch nativo. Incluye transición 1440→1024→1440 y dos probes de fallback DOM con 200 Mesas.

**Reproducción final PASS, salida 0**: seis combinaciones de escala/viewport, dos fallback DOM, 32 ciclos de nombres y 36 geometrías. Los frames completos del renderer están dentro de su host, no sólo su intersección de pintura. Los 72 hit tests devuelven el control esperado, sin `CANVAS`; solapamiento con selector/resumen = 0, poppers residuales = 0 y overflow horizontal = false. Los diez ciclos de 200 Mesas por viewport seleccionan diez IDs distintos.

TABLE desktop y SEAT desktop/tablet completan asignar, mover y quitar por UI, con lectura de ambos IDs en PostgreSQL. Las doce selecciones de la fixture de 50 lugares incluyen el punto original `(0.33150371, 0.37560058)` y los cuatro vecinos más cercanos a 2.0736x; el valor del selector sigue siempre la Mesa padre. `Quitar Mesa` termina con ambos IDs nulos. Finance/check-in y dos Asistentes ficticios confirmados permanecen consistentes al final; se eliminan exclusivamente los recursos propios.

React: valor derivado del estado existente, acciones en callbacks, keys/equality por ID, sin efecto de sincronización duplicado, listeners globales ni almacenamiento persistido nuevos. Se conserva MUI y no se agrega virtualización. La lectura `includeHidden` se usa sólo para verificar un atributo del canvas bajo un Drawer abierto; no autoriza clicks en el fondo.

- [100 / 1024: selector abierto](evidence/calca-blocker05/attempts/reproduction/100-1024-selector-open.png).
- [100 / 1024: después de seleccionar y cerrar](evidence/calca-blocker05/attempts/reproduction/100-1024-after-selection-close.png).
- [200 / 1440: selector abierto](evidence/calca-blocker05/attempts/reproduction/200-1440-selector-open.png).
- [200 / 1440: Mesa seleccionada](evidence/calca-blocker05/attempts/reproduction/200-1440-after-selection.png).
- [200 / 1024: Drawer cerrado](evidence/calca-blocker05/attempts/reproduction/200-1024-after-drawer-close.png).

Método y reproducción: [README](evidence/calca-blocker05/README.md). Resultados finales: [results.json](evidence/calca-blocker05/attempts/reproduction/results.json), [qa.json](evidence/calca-blocker05/qa.json). No se ejecuta `qa:full`, DT09 ni CALCA-06 completo; este documento no autoriza piloto comercial ni declara flakiness cero.

## Fuera de alcance

No se modifica el diálogo de destinos de asignación, las listas del Builder, UI legacy ni P2 históricos: texto decorativo, botones heredados de 42 px, proximidad de lugares que requiere zoom/selección por nombre y pulido de etiquetas/contraste. La recertificación CALCA-06 sigue siendo un ticket separado.
