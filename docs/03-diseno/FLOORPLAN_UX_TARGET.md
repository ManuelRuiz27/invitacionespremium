# Meta visual y de interacción — Croquis Sticker

Estado: referencia UX subordinada a `docs/04-tecnico/FLOORPLAN_STICKER_SEATING_CONTRACT.md`.

## Principios

1. El plano del lugar es la capa base; la Planner distribuye objetos sobre él.
2. Las Mesas se perciben como stickers manipulables, no como registros técnicos.
3. La interfaz debe funcionar primero para asignación por Mesa y revelar asientos individuales solo cuando el Evento lo requiera.
4. Desktop y tablet deben priorizar el canvas; mobile usa paneles a pantalla completa o bottom sheets.
5. No mostrar IDs, enums, coordenadas, grados ni términos internos.

## Flujo visual objetivo

### 1 — Inventario

Pantalla limpia antes del canvas:

```text
Inventario de mesas

Forma        Cantidad    Capacidad
Redonda         40          10
Rectangular     10          12
Cuadrada         5           8

Total: 55 mesas
[Crear 55 mesas]
```

La Planner puede agregar configuraciones adicionales sin repetir formularios mesa por mesa.

### 2 — Distribución

Canvas central con plano real. Bandeja inferior/lateral con Mesas aún no colocadas.

```text
[toolbar]
                 PLANO
      ○1      ○2       ○3
             ▭4

Mesas sin colocar (17)
[6] [7] [8] [9] ...
```

Acciones rápidas: zoom, ajustar vista, snap, undo/redo, mostrar sillas.

### 3 — Mesa seleccionada

Click/tap selecciona. Aparece toolbar contextual y panel discreto.

```text
Mesa 1
Capacidad 10
8 / 10 asignados

[Nombre]
[Color]
[Asignar invitados]
[Duplicar]
[Más…]
```

El color avanzado vive detrás de `Personalizado…`. Mostrar recientes antes que un color wheel completo.

### 4 — Sillas visuales

`Mostrar sillas` no cambia reglas de asignación. Solo representa capacidad.

Si la capability `Por asiento` está activada, las sillas persistentes pueden comunicar libres/ocupadas.

### 5 — Asignación

Modo Mesa:

```text
Mesa 1 · 8/10

Sin asignar | Asignados
[Buscar] [Grupo]
□ Ana
□ Luis
□ María

[Asignar 3 a Mesa 1]
```

Modo asiento:

```text
        ○ Ana
    ○           ○ Luis
  ○     Mesa 1      ○
    ○           ○
        ○ María

Invitados sin asiento
□ Carlos
□ Sofía
```

Bulk assignment sigue disponible; drag a silla es precisión opcional.

### 6 — Resumen

KPIs legibles y tabla de Mesas. No usar anillos o color como único indicador.

```text
620 asistentes
603 con Mesa
17 sin Mesa
36 lugares disponibles
```

### 7 — Día del Evento

Croquis read-only. Estado de ocupación/check-in actualizado en vivo. Una Mesa puede mostrar `7/10 ingresaron`.

Scanner:

```text
✓ ACCESO VÁLIDO
MESA 2
ASIENTO 7   ← solo si existe
Ana Martínez
```

## Responsive

### Desktop
- canvas ocupa la mayor parte de pantalla;
- panel contextual lateral;
- bandeja de stickers lateral o inferior;
- asignación en split view.

### Tablet
- canvas dominante;
- panel contextual colapsable;
- targets touch >= 44×44;
- pinch zoom y pan.

### Mobile
- canvas full-screen cuando se manipula;
- toolbar mínima;
- bottom sheets para propiedades;
- asignación en pantalla dedicada;
- no intentar comprimir el layout desktop.

## Estados visuales mínimos

Cada Mesa puede comunicar con texto + forma + color:

- normal;
- seleccionada;
- completa;
- con lugares;
- sobrecupo si contractualmente puede existir;
- read-only;
- con asignación individual habilitada.

## Referencia renderizada

Archivo: `docs/03-diseno/assets/floorplan-sticker-flow-target.svg`.

El render representa intención de jerarquía, flujo, densidad y comportamiento. No congela literalmente colores, copy, métricas, tamaños ni componentes si contradicen los tokens vigentes o contratos normativos.
