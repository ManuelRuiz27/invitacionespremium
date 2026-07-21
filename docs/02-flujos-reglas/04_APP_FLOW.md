# 04 — App Flow

## Flujo Planner

1. Se registra desde landing.
2. Entra al dashboard.
3. Puede ver demo.
4. Compra créditos o recibe línea de crédito.
5. Crea evento mediante wizard.
6. Configura datos del evento.
7. Carga contactos manualmente o por CSV.
8. Configura invitación Flyer o Flipbook.
9. Configura Confirmación de asistencia.
10. Activa croquis/mesas si aplica.
11. Revisa evento.
12. Activa evento.
13. Envía invitaciones por WhatsApp manual/export.
14. Recibe confirmaciones.
15. Asigna mesas si croquis está activo.
16. Genera tokens staff.
17. El día del evento monitorea operación desde Resumen.
18. Cierra evento.
19. Publica álbum si aplica.
20. Genera reporte PDF bajo demanda.
21. Archiva o elimina lógicamente.

## Flujo Organización

1. Platform Admin crea Organización.
2. Platform Admin crea Admin de Organización.
3. Admin entra por login.
4. Compra créditos o usa línea.
5. Crea Planner de Organización si lo necesita.
6. Admin o Planner crea eventos.
7. Los créditos pertenecen a la Organización.
8. Admin puede ver todos los eventos.
9. Planner de Organización solo ve eventos que creó.

## Flujo Admin de Organización

1. Login.
2. Ve eventos de la Organización.
3. Compra créditos.
4. Ve deuda/línea si existe.
5. Activa eventos.
6. Crea Planner interno si lo necesita.
7. Ve reportes.

## Flujo Planner de Organización

1. Login.
2. Ve sus eventos.
3. Crea evento.
4. Opera evento.
5. Activa evento usando créditos de Organización.
6. No compra créditos.
7. No ve deuda.

## Flujo Contacto público

1. Recibe WhatsApp:
   `Hola [Nombre], [Mensaje emotivo], mira nuestra invitación digital y confirma aquí: [link]`
2. Abre link único.
3. Ve invitación.
4. Confirma asistencia o rechaza.
5. Si confirma, registra nombres de acompañantes/familia nominal según aplique.
6. Al confirmar, ve QR.
7. Puede abrir QR en pantalla completa.
8. Puede modificar respuesta mientras Confirmación de asistencia esté abierta.
9. Después del evento, ve álbum si su Invitación tuvo al menos un Asistente ingresado.

## Flujo Staff por token

1. Recibe link token.
2. Abre microapp scanner sin login.
3. Valida token.
4. Escanea QR.
5. Ve Contacto/Invitación y Asistentes pendientes.
6. Selecciona quién entra.
7. Registra entrada.
8. Si hay croquis, ve plano y mesa.
9. No ve teléfonos.
10. No ve reportes.

## Flujo QR pase físico

1. Cliente crea evento QR pase físico.
2. Croquis/mesas son opcionales.
3. Genera pases QR individuales.
4. Cada pase tiene número y QR SVG.
5. Si hay mesa, el pase muestra mesa.
6. Al escanear, se registra uso.
7. Segundo escaneo queda bloqueado.
8. Reporte PDF bajo demanda.

## Flujo álbum post-evento

1. Planner puede crear álbum antes del cierre.
2. Publica manualmente.
3. Hasta 35 fotos JPG/PNG.
4. Link externo opcional.
5. Token de álbum distinto al token de invitación.
6. Visible durante 30 días.
7. Oculto al archivar.
8. Invitación sin asistencia ve: `Álbum disponible solo para asistentes`.

## Flujo demo

1. Vive dentro del dashboard cliente.
2. Usa seeds de API.
3. No consume créditos.
4. No activa evento real.
5. No genera tokens reales.
6. No envía invitaciones reales.
