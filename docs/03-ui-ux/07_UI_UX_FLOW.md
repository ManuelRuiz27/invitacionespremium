# 07 — UI/UX Flow

## Estilo general

Premium, elegante y sobrio.

## Paneles

Client/Admin:

- dashboard visual con pocos datos;
- scorecards;
- cards;
- tablas limpias cuando aplique.

## Landing

Repo: `invitacionespremium-landing`.

La landing debe vender:

- SaaS para Planners y Organizaciones;
- experiencia premium;
- control de acceso.

Secciones:

- Hero
- Problema
- Solución
- Servicios: Flipbook / Flyer / QR pase físico
- Demo visual mock
- Precios
- Para planners
- Para organizaciones
- Preguntas frecuentes
- CTA registro/login

## Dashboard cliente

Primer vistazo:

- eventos próximos;
- eventos activos;
- créditos disponibles si aplica;
- deuda/línea si aplica;
- alertas visuales;
- botón crear evento;
- demo.

## Lista de eventos

Debe permitir alternar:

- cards;
- tabla.

## Wizard de evento

- Stepper horizontal en desktop/tablet.
- Stepper vertical en mobile.
- Autosave + guardado manual.
- Si sale incompleto, guarda borrador automáticamente.

### Flipbook/Flyer

1. Datos del evento
2. Contactos
3. Invitación
4. Confirmación de asistencia
5. Croquis/mesas opcional
6. Revisión
7. Activar

### QR pase físico

1. Datos del evento
2. Croquis/mesas opcional
3. Generar pases QR
4. Revisión
5. Activar

## Carga de contactos

Debe permitir:

- alta manual;
- CSV;
- descarga de formato CSV;
- edición inline;
- validación 150;
- preview antes de importar.

## Editor Flyer/Flipbook

- canvas visual;
- panel lateral de propiedades;
- dibujar hotspots sobre imagen;
- elegir acción del hotspot;
- preview mobile/tablet/desktop.

## Croquis

Debe tener:

- canvas central;
- herramientas de forma;
- panel lateral mesa/zona;
- lista de mesas;
- validación visual de capacidad;
- botón bloquear/desbloquear;
- botón pantalla completa.

## Asignación de mesas

Vistas:

- lista de asistentes + croquis;
- grupos + croquis.

## Staff tokens

Mostrar:

- tokens creados;
- copiar link;
- estado;
- alias staff;
- expiración al cierre;
- máximo 3.

## Evento activado

Pestañas:

- Resumen
- Croquis/Mesas solo vista + botón editar
- Staff

No mostrar pestañas:

- Invitados
- Invitación
- Confirmación de asistencia
- Scanner
- Álbum
- Reportes
- Auditoría

El Resumen incluye acceso a reportes bajo demanda.

## Scanner

Microapp en pantalla única:

- escanear;
- resultado;
- registrar entrada.

Resultado muestra:

- nombre de invitación/contacto;
- asistentes pendientes seleccionables;
- mesa;
- plano si existe;
- botón registrar entrada;
- error claro.

## Invitación pública

Equilibrio:

- visual primero;
- acción clara;
- animación/experiencia visual.

## QR público

Debe tener:

- recuadro visual grande;
- leyenda: `El día del evento, muestra este QR en la entrada del salón.`
- botón abrir QR en pantalla completa.

## Álbum público

Plantilla visual con:

- título;
- mensaje;
- grid/carrusel;
- botón externo.

## Alertas visuales MVP

- saldo insuficiente;
- deuda activa;
- evento listo para activar;
- confirmación cerrada;
- evento próximo;
- borrador vencido.

## Glosario UI de estados

Estados visibles:

- En preparación
- Listo para activar
- Activo
- Día del evento
- Cerrado
- Álbum publicado
- Archivado
- Cancelado

No mostrar términos técnicos como `draft`, `active`, `archived`.
