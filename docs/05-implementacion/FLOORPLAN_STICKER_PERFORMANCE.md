# Baseline de performance — Croquis Sticker

Fecha: 2026-08-09

Este registro cubre las Fases 0–4. No valida Split View ni Seat persistente.

## Entorno

- Windows 11 Home `10.0.26200`.
- Intel Core i3-1215U.
- Node.js `22.18.0`, pnpm `11.15.1`.
- Chrome `151.0.7922.76` disponible para el profiling manual de release.
- Baseline automatizado: Vitest `4.1.10` + jsdom `30.0.1`, sin throttling.

## Baseline reproducible del renderer DOM de rollback

Comando:

```powershell
$env:FLOORPLAN_PROFILE='1'
pnpm --filter @invitaciones/client exec vitest run src/wizard/floorplan/floorplan-performance.test.tsx --reporter=verbose
```

Cada escenario monta el renderer DOM completo y registra nodos DOM y tiempo de montaje. Las duraciones son orientativas: jsdom no mide pintura, composición ni FPS de navegador.

| Escenario | Mesas | Sillas visuales | Nodos DOM | Montaje jsdom |
| --- | ---: | ---: | ---: | ---: |
| 50 asistentes | 10 | 0 | 52 | 149.9 ms |
| 600 asistentes | 60 | 0 | 302 | 245.3 ms |
| 1,800 asistentes | 180 | 0 | 902 | 683.0 ms |
| Límite visual | 200 | 0 | 1,002 | 654.1 ms |
| Boutique | 20 | 200 derivadas | 302 | 255.1 ms |

Las variaciones entre ejecuciones son esperables. El gate automatizado comprueba cardinalidad y mantiene el comando de profiling; no falla por un umbral temporal dependiente del equipo.

## Impacto del renderer Konva

- El DOM del plano permanece esencialmente constante porque las Mesas se dibujan dentro de Canvas.
- Con sillas ocultas, cada Mesa añade un grupo, una figura y un texto al scene graph; 200 Mesas no crean nodos de silla.
- `Mostrar sillas` es `false` por defecto. Al activarlo, crea exactamente `capacity` nodos visuales por Mesa y no crea IDs ni registros persistentes.
- Drag, resize y rotate consolidan el cambio al final de la interacción; no emiten mutaciones API por frame.
- Pan y pinch modifican el stage de Konva durante el gesto y consolidan el viewport al finalizar.
- Los volúmenes de 50/600/1,800 asistentes no añaden filas ni nodos de asistentes en Fases 0–4; solo se representa el número de Mesas correspondiente. La virtualización de asistentes pertenece a Split View.

## Perfil de producción de Konva — remediación F0–F4

Ejecución real del 9 de agosto de 2026 sobre build minificado de Vite 8.1.5, en Headless Chrome 151 (`Windows 11`, Intel Core i3-1215U). Cada interacción recorrió 90 frames mediante `requestAnimationFrame`, redibujando el stage real durante zoom, pan y drag. No se usó jsdom para estos resultados.

Comandos reproducibles:

```powershell
pnpm --filter @invitaciones/client build:floorplan-profile
pnpm --filter @invitaciones/client preview:floorplan-profile
# En Chrome: await window.runFloorplanProfile()
```

| Escenario | Nodos Konva | Montaje | Zoom FPS / p95 | Pan FPS / p95 | Drag FPS / p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 mesas | 35 | 65.3 ms | 61.0 / 18.4 ms | 60.1 / 17.5 ms | 60.1 / 17.4 ms |
| 60 mesas | 162 | 135.4 ms | 60.1 / 18.0 ms | 60.0 / 18.4 ms | 60.2 / 17.4 ms |
| 180 mesas | 422 | 501.3 ms | 54.0 / 20.1 ms | 60.1 / 19.0 ms | 60.1 / 18.5 ms |
| 200 mesas | 468 | 274.6 ms | 57.2 / 18.9 ms | 60.1 / 18.7 ms | 60.1 / 18.7 ms |
| 20 mesas + 200 sillas visuales | 268 | 83.4 ms | 60.5 / 18.0 ms | 60.1 / 18.0 ms | 60.1 / 18.1 ms |

La optimización que hizo viable estos volúmenes fue cachear cada sticker estático de Konva y desactivar trabajo de dibujo perfecto/sombra de stroke que no aporta al resultado visual. Antes de esa corrección, el mismo harness mostró aproximadamente 4–15 FPS entre 60 y 200 mesas; por eso el cache queda cubierto por el perfil y no por una afirmación teórica.

Estos valores demuestran el resultado únicamente en el entorno descrito. No constituyen una garantía universal de 60 FPS: el caso de zoom con 180 mesas midió 54.0 FPS aproximados y el de 200 mesas 57.2 FPS. El JSON íntegro está en `docs/05-implementacion/evidence/floorplan-performance-2026-08-09.json`.

## Gate manual de navegador

Antes de merge/release se debe repetir en Chrome sobre build de producción:

1. cargar 10, 60, 180 y 200 Mesas con sillas ocultas;
2. medir montaje, zoom, pan, selección y drag durante al menos 10 segundos por escenario;
3. medir 20 Mesas con sillas visibles;
4. registrar Performance trace, cantidad de nodos Konva, FPS aproximado y duración de cada interacción;
5. comprobar touch/pinch en un dispositivo real o con emulación táctil.

Este documento no afirma 60 FPS. El baseline automatizado no sustituye el profiling de pintura/composición en navegador.
