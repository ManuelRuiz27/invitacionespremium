/**
 * Tokens semánticos de layout para InvitacionesPremium.
 *
 * Fuente de verdad dimensional compartida entre Admin, Client, Scanner,
 * públicos y Landing. No sustituyen al sistema de spacing de MUI (base 8 px);
 * los valores en unidades MUI (múltiplos de 8 px) están anotados como referencia.
 *
 * Uso: importar desde '@invitaciones/ui' y referenciar en sx props o styled.
 */

export const layoutTokens = {
  /** Ancho de la navegación lateral en desktop. */
  sidebar: {
    width: 240 // px — unifica 232 (ResponsiveAppShell) y 256 (AdminShell)
  },

  /** Anchos máximos de contenido según propósito. */
  content: {
    /** Formularios de entrada de datos (un campo por fila o dos columnas). */
    maxWidthForm: 760,
    /** Páginas de detalle, lectura y paneles informativos. */
    maxWidthDetail: 1060,
    /** Dashboards, tablas y listas que aprovechan el ancho disponible. */
    maxWidthDashboard: 1440
  },

  /**
   * Padding horizontal del área de contenido principal por breakpoint.
   * En unidades MUI spacing (1 = 8 px):
   *   xs → 16 px | sm → 24 px | lg → 32 px
   */
  contentPx: { xs: 2, sm: 3, lg: 4 } as const,

  /**
   * Padding vertical del área de contenido principal por breakpoint.
   * xs → 16 px | md → 32 px
   */
  contentPy: { xs: 2, md: 4 } as const,

  /** Gap vertical entre secciones operativas. xs → 24 px | md → 32 px */
  sectionGap: { xs: 3, md: 4 } as const,

  /** Gap entre controles o campos de un formulario. → 16 px */
  controlGap: 2 as const,

  /** Targets táctiles mínimos (px). */
  tapTarget: {
    /** Mínimo WCAG / HIG para cualquier control interactivo. */
    min: 44,
    /** Acciones primarias en móvil. */
    primary: 48
  }
} as const;
