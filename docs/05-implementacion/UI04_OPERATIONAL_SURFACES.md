# UI-04 — Evento activo, compartir Invitaciones, Finanzas y Scanner

Estado: **READY FOR CODE DESPUÉS DE UI-03**  
Prioridad: **P1 del refactor visual Client**  
Fuente visual superior: `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`.

## 1. Objetivo

Completar la transición task-first en las superficies operativas posteriores a la activación:

- `/eventos/:eventId` fuera de Croquis;
- compartir Invitaciones;
- Staff panel cuando aplique;
- Finanzas Cliente;
- Scanner.

El Evento activo debe sentirse como un **centro de trabajo**, no como un dashboard de módulos/cards.

## 2. Lectura obligatoria

Codex debe leer, en orden:

1. `docs/INDEX.md`
2. `docs/04-tecnico/REPOSITORY_SOURCE_OF_TRUTH.md`
3. `docs/03-diseno/CLIENT_UI_VISUAL_SYSTEM.md`
4. `docs/03-ui-ux/07_UI_UX_FLOW.md`
5. `docs/04-tecnico/CLIENT_APP_CONTRACT.md`
6. `docs/04-tecnico/ACTIVE_EVENT_WORKSPACE_CONTRACT.md`
7. `docs/04-tecnico/STAFF_ACCESS_CONTRACT.md`
8. `docs/04-tecnico/SCANNER_CHECKIN_CONTRACT.md`
9. `docs/04-tecnico/FINANCE_CONTRACT.md`
10. `docs/04-tecnico/INVITATIONS_CONTRACT.md`
11. contratos de Álbum/Reportes sólo si se modifica su presentación contextual;
12. `docs/05-implementacion/14_CODEX_RULES.md`
13. `docs/05-implementacion/17_QA_OPEN_DECISIONS.md`
14. este ticket.

Para Croquis/Seating, sólo consultar sus contratos para preservar la frontera; no rediseñarlos.

## 3. Software archaeology obligatorio

Inspeccionar como mínimo:

- `apps/client/src/workspace/ActiveEventWorkspacePage.tsx`
- `apps/client/src/workspace/InvitationDistribution.tsx`
- `apps/client/src/workspace/StaffAccessPanel.tsx`
- `apps/client/src/workspace/SeatingWorkspace.tsx` **sólo para frontera/integración**;
- tests de ActiveEventWorkspace/InvitationDistribution/Staff;
- `apps/client/src/finance/**`;
- `apps/scanner/src/App.tsx`;
- `apps/scanner/src/pages/**`;
- `apps/scanner/src/components/**`;
- tests de Scanner;
- shared UI consumido por estas superficies.

Reportar qué componentes son card-first o copy-heavy y qué comportamiento debe permanecer intacto.

## 4. Invariantes

No cambiar:

- guards por estado;
- rutas;
- áreas funcionales autorizadas;
- ownership;
- distribución manual mediante `wa.me`/copy link;
- ausencia de estado `sent/delivered/read`;
- Staff permissions/tokens;
- lifecycle;
- Finance API/cálculos;
- Scanner API/check-in;
- PII restrictions;
- realtime;
- Seating/Croquis internals.

## 5. Workspace `/eventos/:eventId`

### Objetivo

La vista debe responder:

- qué Evento estoy operando;
- en qué estado se encuentra;
- qué necesita atención;
- qué acción puedo realizar ahora.

### Header

Priorizar:

- nombre como `h1`;
- fecha/hora;
- tipo/servicio sólo cuando ayudan;
- estado natural discreto;
- acción principal válida si existe.

`Volver a eventos` permanece accesible pero no domina.

No repetir estado en múltiples chips/cards/alerts.

## 6. Navegación local

Conservar áreas funcionales de `ACTIVE_EVENT_WORKSPACE_CONTRACT.md`.

Puede refactorizarse visualmente como tabs/enlaces compactos.

No:

- grid de cards para lanzar secciones;
- placeholders de funciones no disponibles;
- reabrir Wizard desde Evento activo.

## 7. Resumen

### Hechos principales

Mostrar datos autorizados en filas/texto compacto, no en una card por dato.

### Por hacer

Se autoriza una sección `Por hacer` sólo para condiciones que ya sean autoritativas y accionables con datos disponibles en las lecturas vigentes.

Ejemplos posibles si el dato existe inequívocamente:

- Invitaciones sin respuesta;
- Confirmación cerrada que requiere abrirse;
- acción de Álbum permitida;
- Staff ausente si el flujo realmente lo necesita.

No crear backend, read model, request fan-out o heurísticas nuevas para poblar la sección.

No inventar porcentaje de progreso/engagement.

## 8. Compartir Invitaciones

### Título visible

Preferir **Compartir invitaciones** frente a “Distribución”.

### Lista

Priorizar:

- persona/Contacto;
- Grupo cuando aporte;
- estado natural de respuesta;
- acción WhatsApp;
- acciones secundarias.

### WhatsApp

En estado y recurso autorizados:

- botón/acción **WhatsApp** es primaria;
- abre exactamente la URL generada conforme al contrato vigente;
- no ejecuta POST;
- no marca enviado;
- no muestra confirmación falsa de entrega.

### Acciones secundarias

- Copiar enlace;
- Abrir invitación.

Pueden vivir en una zona secundaria/menu si siguen claramente accesibles.

### Filtros

Búsqueda/filtros locales permanecen. Pueden compactarse para que la lista sea protagonista.

## 9. Staff

`StaffAccessPanel` conserva comportamiento exacto.

Visualmente:

- lista limpia de accesos activos/expirados;
- alias primero;
- estado/expiración cuando aporte;
- acción copiar link sólo donde esté permitida;
- crear Staff como CTA contextual.

No usar card por token salvo evidencia de que mejora mobile.

No agregar revocación manual ni nuevos permisos.

## 10. Integración de Mesas/Croquis

La navegación puede seguir abriendo **Mesas y distribución**.

Frontera absoluta:

- no editar `SeatingWorkspace.tsx` para estética de este ticket;
- no editar `packages/floorplan`;
- no cambiar paneles/drawers/resumen de Seating;
- no cambiar detailed seating.

Sólo se permite ajustar el contenedor padre si es imprescindible para que el nuevo workspace no aplique padding/wrappers incompatibles. Esa adaptación no puede alterar la composición interna de Seating.

## 11. Lifecycle y estados terminales

### ACTIVE / EVENT_DAY

Mantener mutaciones autorizadas y compartir Invitaciones.

### CLOSED

Consulta + acciones autorizadas de reapertura, Álbum, Reportes y archivo.

### ALBUM_PUBLISHED

Presentar estado/publicación/expiración y acciones autorizadas.

### ARCHIVED

Consulta limpia; no mostrar CTAs operativos inválidos.

### CANCELLED

Contexto de cancelación y datos históricos autorizados; sin acciones que aparenten reactivar operación.

Alerts sólo cuando explican una restricción o siguiente acción.

## 12. Finanzas Cliente

### Objetivo

Reducir ornamentación manteniendo precisión.

### Datos

Conservar exactamente:

- saldo comprado;
- deuda en créditos/MXN;
- línea límite/usada/disponible;
- movimientos;
- comprobantes.

### Composición

Preferir jerarquía tipográfica y divisores antes que una card por cifra.

Ejemplo:

```text
Créditos disponibles                     84

Línea de crédito
Usados                                  20 / 100

Movimientos
────────────────────────────────────────────
...
```

### Alertas

Mantener únicamente las contractuales:

- deuda > 0;
- línea suspendida;
- línea expirada;
- saldo comprado cero si el contrato lo muestra.

No inventar umbral de “saldo bajo”.

### Invariantes financieras

No recalcular en frontend, no cambiar MXN cents, no agregar mutaciones, no reinterpretar deuda/línea.

## 13. Scanner

### Objetivo

Scanner se percibe como microapp de una sola tarea.

### Estado inicial

Prioridad:

1. Evento/contexto mínimo;
2. cámara/acción escanear;
3. búsqueda exacta como alternativa.

No usar cards decorativas alrededor de cámara y búsqueda.

### Resultado de Invitación

Prioridad:

- identidad mínima permitida;
- pendientes seleccionables;
- Mesa/lugar según contrato vigente;
- **Registrar entrada**.

### Pase físico

Mantener semántica de pase físico y uso único. No forzar UI nominal de Invitación.

### Éxito

Mostrar:

- entrada registrada;
- contexto mínimo útil;
- CTA dominante **Escanear siguiente**.

### Error

Diferenciar contractualmente:

- token Staff inválido/expirado;
- Evento cerrado/cancelado/no operativo;
- QR inválido/de otro Evento;
- Invitación sin pendientes;
- Pase ya usado;
- sin conexión.

No mostrar un único error genérico si ya existe información para diferenciar.

### Navegación

No agregar shell Cliente, sidebar ni navegación global a Scanner.

## 14. Responsive

### Evento activo desktop

- header compacto;
- navegación local discreta;
- contenido principal sin card grid;
- listas de Invitaciones/Staff escaneables.

### Mobile

- navegación local scrollable o disclosure;
- CTA WhatsApp accesible;
- listas lineales;
- acciones secundarias compactas.

### Scanner

Mobile-first. Cámara y CTA deben ser utilizables con una mano cuando sea razonable y targets >=44 px.

## 15. Accesibilidad

- un `h1` en workspace;
- nav local etiquetada;
- botones con nombres claros;
- foco visible;
- feedback copyable no sólo color;
- dialogs/drawers con focus management;
- Scanner anuncia resultados/errores de manera adecuada;
- WhatsApp/copy no dependen de icon-only sin accessible name.

## 16. Tests obligatorios

### Workspace

1. guards de estado no cambian;
2. áreas funcionales por Servicio/configuración no cambian;
3. no se monta placeholder de áreas no funcionales;
4. estado técnico no aparece;
5. Croquis sigue montando sin llamadas/modificaciones nuevas;
6. estados terminales conservan restricciones.

### Compartir Invitaciones

7. correlación Contacto/Invitación no cambia;
8. WhatsApp sólo en estados permitidos;
9. cancelada no ofrece compartir;
10. closed/posteriores no ofrecen nuevos envíos;
11. copiar enlace conserva token exacto;
12. no aparece Enviada/Entregada/Leída;
13. error de una lectura reintenta agregado completo según contrato.

### Staff

14. máximo/estado/expiración no cambian;
15. acciones permitidas siguen por estado.

### Finanzas

16. Planner Organización ejecuta cero requests;
17. roles autorizados conservan tres lecturas;
18. cifras derivan exclusivamente de API;
19. alertas contractuales siguen correctas.

### Scanner

20. resolución token/evento no cambia;
21. scan/búsqueda siguen funcionando;
22. selección parcial/registro no cambia;
23. check-in duplicado sigue bloqueado;
24. PII no se amplía;
25. errores siguen diferenciados;
26. CTA siguiente reinicia correctamente el flujo.

## 17. QA visual

Evidencia reproducible para:

- Evento ACTIVE Flyer/Flipbook;
- EVENT_DAY;
- CLOSED;
- ARCHIVED;
- CANCELLED;
- Compartir Invitaciones con pendiente/confirmada/cancelada;
- Staff activo/expirado;
- Finanzas con saldo/deuda/línea;
- Scanner inicial;
- scan válido;
- múltiples Asistentes;
- éxito;
- QR inválido;
- Pase usado;
- mobile.

## 18. No-go

No tocar:

- Croquis internals;
- Seating internals;
- API/Prisma/OpenAPI;
- Finance logic;
- WhatsApp API;
- mensajería persistente;
- nuevos roles;
- nuevos tabs/módulos no autorizados.

## 19. Definition of Done

UI-04 termina cuando:

- Evento activo se percibe como centro de trabajo;
- resumen no es grid de cards;
- compartir Invitaciones prioriza WhatsApp sin inventar delivery;
- Staff es lista operacional limpia;
- Finanzas conserva precisión con menos ornamentación;
- Scanner prioriza cámara/resultado/registrar entrada;
- Croquis no fue rediseñado;
- dominio/permisos/seguridad permanecen intactos;
- tests y QA pasan.
