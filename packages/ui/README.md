# @invitaciones/ui

Tema y componentes presentacionales compartidos. No contiene reglas de negocio, ownership, llamadas API ni entidades de dominio.

Componentes disponibles:

- `AppThemeProvider` y tema/tokens centralizados;
- `ResponsiveAppShell`;
- `PageHeader`;
- `MetricCard`;
- `StatusChip`;
- `EmptyState`, `LoadingState` y `ErrorState`;
- `AppFrame`, conservado para compatibilidad con los shells existentes.

El sistema usa Material UI, foco visible, contraste suficiente y reducción de movimiento. Las apps
aportan navegación, permisos y datos; este paquete permanece puramente presentacional.
