/**
 * Contrato de tokens de DEKOPEN («Huincha») para código TS/JS. Los valores viven en
 * `apps/web/src/styles.css`; aquí solo están los nombres y las constantes que necesita el JS
 * (motion/react, gráficos, meta theme-color, el portal que fuerza el tema claro).
 */

/** Variables CSS que cambian con el tema. Quien fije un tema en línea (p. ej. el portal) debe copiar todas. */
export const THEME_TOKENS = [
  // Superficies
  '--dk-frame',
  '--dk-frame-hover',
  '--dk-canvas',
  '--dk-surface',
  '--dk-sunken',
  '--dk-raised',
  '--dk-hover',
  '--dk-pressed',
  '--dk-inverse',
  '--dk-thumb',
  '--dk-track',
  '--dk-scrim',
  '--dk-plate',
  '--dk-nav-active',
  '--dk-nav-active-fg',
  '--dk-tabbar',
  // Bordes
  '--dk-divider',
  '--dk-divider-strong',
  '--dk-control',
  '--dk-control-hover',
  // Texto
  '--dk-fg-strong',
  '--dk-fg',
  '--dk-fg-muted',
  '--dk-fg-faint',
  '--dk-fg-inverse',
  '--dk-fg-on-accent',
  // Señal (amarillo huincha)
  '--dk-signal',
  '--dk-signal-hover',
  '--dk-signal-pressed',
  '--dk-on-signal',
  '--dk-signal-wash',
  // Tinta y foco (accent = tinta)
  '--dk-accent',
  '--dk-accent-hover',
  '--dk-accent-pressed',
  '--dk-accent-subtle',
  '--dk-accent-subtle-strong',
  '--dk-accent-ink',
  '--dk-accent-line',
  '--dk-focus',
  '--dk-focus-ring',
  '--dk-selection',
  // Selección dentro del lienzo
  '--dk-select',
  '--dk-select-ring',
  // Estados
  '--dk-success',
  '--dk-success-bg',
  '--dk-success-line',
  '--dk-success-solid',
  '--dk-on-success-solid',
  '--dk-warning',
  '--dk-warning-bg',
  '--dk-warning-line',
  '--dk-warning-solid',
  '--dk-on-warning-solid',
  '--dk-danger',
  '--dk-danger-bg',
  '--dk-danger-line',
  '--dk-danger-solid',
  '--dk-on-danger-solid',
  '--dk-info',
  '--dk-info-bg',
  '--dk-info-line',
  // Gráficos
  '--dk-chart-1',
  '--dk-chart-2',
  '--dk-chart-3',
  '--dk-chart-4',
  '--dk-chart-5',
  '--dk-chart-6',
  // Dibujo y marca
  '--dk-frame-line',
  '--dk-dimension',
  '--dk-dimension-text',
  '--dk-brand-glass',
  '--sketch-glass-opacity',
  '--sketch-glint-opacity',
  // Elevación
  '--dk-highlight',
  '--dk-shadow-xs',
  '--dk-shadow-raised',
  '--dk-shadow-plate',
  '--dk-shadow-float',
  '--dk-shadow-pop',
  '--dk-shadow-primary',
  // Alias heredados v4 (se recalculan desde los de arriba, pero se listan para fijarlos igual)
  '--paper-0',
  '--paper-50',
  '--paper-100',
  '--paper-200',
  '--paper-350',
  '--paper-600',
  '--paper-900',
  '--ink-50',
  '--ink-100',
  '--ink-500',
  '--ink-600',
  '--ink-700',
  '--ok-50',
  '--ok-600',
  '--ok-800',
  '--warn-50',
  '--warn-600',
  '--warn-800',
  '--bad-50',
  '--bad-600',
  '--bad-800',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

/** Color de la barra del navegador (`<meta name="theme-color">`) = marco de cada tema. */
export const THEME_META_COLOR = { original: '#1b1d28', light: '#f0f0f3', dark: '#0d0e12' } as const

/** Colores de la marca (fijos, no cambian con el tema). */
export const BRAND_COLORS = {
  /** Amarillo huincha: la señal. Siempre con texto tinta. */
  signal: '#ffd21f',
  /** Tinta de la marca: texto y formas sobre la señal. */
  ink: '#15161d',
  /** Fondo del ícono de la app. */
  iconTile: '#ffd21f',
} as const

/** Series de gráficos (usa siempre estas variables; nunca hex sueltos). Distintas de los estados. */
export const CHART_COLORS = [
  'var(--dk-chart-1)',
  'var(--dk-chart-2)',
  'var(--dk-chart-3)',
  'var(--dk-chart-4)',
  'var(--dk-chart-5)',
  'var(--dk-chart-6)',
] as const

/** Movimiento para motion/react (los mismos valores que las variables CSS). Duraciones en segundos. */
export const MOTION = {
  fast: 0.1,
  menu: 0.14,
  panel: 0.18,
  sheet: 0.24,
  exit: 0.11,
  /** Entrada: rápida al principio, se posa sin rebote. */
  ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
  /** Cambios de estado en el sitio (selección, tamaño). */
  easeStandard: [0.2, 0, 0, 1] as [number, number, number, number],
  /** Paneles y hojas. */
  easeDrawer: [0.32, 0.72, 0, 1] as [number, number, number, number],
  /** Salidas. */
  easeExit: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const

/** Alturas de control (px). 36 escritorio, 44 en pantallas táctiles; filas de lista 44 y 56 las de dos líneas. */
export const CONTROL_HEIGHT = { xs: 26, sm: 30, md: 36, lg: 44, touch: 44, row: 44, rowDouble: 56 } as const
