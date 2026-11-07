/**
 * Geometría del logo DEKOPEN (datos puros: los usa el componente React y el generador de íconos).
 *
 * Marca «Hoja abierta»: la jamba fija y, junto a ella, la hoja que se abre hacia quien mira. DEK-OPEN
 * dicho con dos formas, sin dibujar una ventana completa. Se lee a 16 px, va a una tinta y sobre la
 * placa amarilla del ícono de la app. Retícula de 32.
 *
 * Logotipo: DEKOPEN en Funnel Display (OFL), peso 640, convertido a trazados para no depender de la
 * fuente. Altura de caja 100.
 */

export const MARK_VIEWBOX = 32

/** Jamba: el lado fijo. */
export const MARK_JAMB = 'M7 6.5A1.5 1.5 0 0 1 8.5 5h2A1.5 1.5 0 0 1 12 6.5v19a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 7 25.5v-19Z'

/** Hoja: gira sobre la jamba, por eso su lado libre se ve más bajo. */
export const MARK_LEAF = 'M14.5 6.4c0-1 .95-1.73 1.92-1.45l7.5 2.17c.64.19 1.08.78 1.08 1.45v14.86c0 .67-.44 1.26-1.08 1.45l-7.5 2.17a1.5 1.5 0 0 1-1.92-1.45V6.4Z'

/** Placa del ícono de la app. */
export const TILE_RADIUS = 7.5

export const WORDMARK_PATH =
  'M0 100V0H38.8Q55.1 0 66.9 6Q78.8 12.1 85.2 23.3Q91.6 34.5 91.6 50Q91.6 65.3 85.1 76.6Q78.6 87.8 66.8 93.9Q55 100 38.8 100ZM19.7 83.3H38.8Q54.8 83.3 63.3 74.2Q71.8 65.2 71.8 50Q71.8 34.7 63.3 25.7Q54.9 16.7 38.8 16.7H19.7ZM185.6 100H113.3V0H185.6V17.1H132.9V39.8H181.8V56.5H132.9V82.9H185.6ZM207.7 100V0H227.3V42.1H227.8L272.2 0H296.3L252.3 41.5L297.4 100H273.9L238.3 53.5L227.3 62.3V100ZM360 101.5Q344.7 101.5 333.2 95.1Q321.8 88.8 315.5 77.2Q309.1 65.6 309.1 50Q309.1 34.2 315.5 22.7Q321.8 11.1 333.2 4.8Q344.7 -1.5 360 -1.5Q375.5 -1.5 386.9 4.8Q398.3 11.1 404.6 22.6Q410.9 34.2 410.9 50Q410.9 65.6 404.6 77.2Q398.2 88.9 386.8 95.2Q375.4 101.5 360 101.5ZM360 84.3Q374.8 84.3 383 75Q391.2 65.7 391.2 50Q391.2 34.1 383 24.9Q374.9 15.7 360 15.7Q345.3 15.7 337.1 24.9Q328.8 34.1 328.8 50Q328.8 65.8 337.1 75.1Q345.3 84.3 360 84.3ZM432.6 100V0H479.6Q496.5 0 505.8 8.4Q515.1 16.9 515.1 31.6Q515.1 46.3 505.8 54.8Q496.4 63.3 479.6 63.3H452.2V100ZM452.2 46.3H478.5Q486.8 46.3 491.1 42.4Q495.5 38.5 495.5 31.6Q495.5 24.7 491.1 20.8Q486.8 17 478.5 17H452.2ZM606.8 100H534.4V0H606.8V17.1H554V39.8H602.9V56.5H554V82.9H606.8ZM722.8 100H701.7L648 28.3H647.5V100H628.8V0H649.3L703.6 72.9H704.1V0H722.8Z'
export const WORDMARK_WIDTH = 722.8
export const WORDMARK_HEIGHT = 100
