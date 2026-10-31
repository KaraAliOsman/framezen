# Avisos de terceros

Framezen incluye código de terceros bajo las licencias que se indican aquí. Cada aviso
se reproduce completo, como piden sus licencias.

---

## bloub — motor de animación de la mascota

- Proyecto: bloub (https://github.com/jeremy-prt/bloub), versión 0.1.1, commit
  `b4bb3c1b5f93c7b87a2e8d620f667c4093d97749`.
- Autor: Jérémy Perret.
- Licencia: MIT (texto completo abajo).
- Dónde se usa: `apps/web/src/features/assistant/avatar/` (Marco, el asistente).

### Qué se adaptó

Se portó el motor de animación de bloub (TypeScript sin framework; el original usa Vue)
a React 19 + SVG + `requestAnimationFrame`, y se modificó:

- `engine/math.ts`: curvas de easing, ruido periódico `loopNoise`, PRNG `mulberry32` y
  redondeo `r2`.
- `engine/face.ts`: ojos-cápsula proyectados sobre una esfera (`eyePoses`), vida en
  reposo (deriva de mirada, micro deriva y respiración) y calendario de parpadeo
  determinista. Cambio: el calendario se repite cada 900 s con búsqueda binaria (el
  original deja de parpadear a los 15 minutos) y tiene un modo mínimo para movimiento
  reducido.
- `engine/shape.ts`: perfil radial de 64 muestras, morph por interpolación de radios,
  trazado Catmull-Rom → cúbicas y cápsula SVG.
- `engine/decor.ts`: arcos 3D con orden de profundidad, constantes de los tres puntos y
  de la pastilla. Cambio: anillos, tonos, tamaños y velocidades propios de Marco.
- `engine/expressions.ts`: modelo de expresiones y su fundido. Se conservan «atento» y
  «feliz»; «escuchando» y «preocupado» son nuevas.
- `engine/poses.ts`: reescrito a partir de `states.ts` (reposo, puntos, guiño, trabajando,
  aprobación); conserva la pose del guiño, el pulso de los puntos (suavizado) y el pop de
  la pastilla.
- `engine/engine.ts`: `sample(t)` puro con setters fechados, fundido desde la pose
  congelada y mirada externa (`Look`). Cambios: sin formas personalizadas ni tabla de
  ajuste de ojos, ojos opacos recortados por la silueta (en vez de agujeros), color de
  pastilla, escala de ojos para tamaños chicos, desfase de vida por instancia y modo de
  movimiento reducido.
- `engine/gaze.ts`: regla de seguimiento del cursor (máximos de guiñada y cabeceo del
  original) sin el giro hacia un panel lateral; se agregan objetivos explícitos y la
  negación suave con la cabeza.
- `MarcoAvatar.tsx` y `paint.ts`: port del componente `BloubBot.vue` (árbol SVG, bucle de
  animación con delta acotado, seguimiento del puntero que ignora el táctil, ids de
  máscara únicos) con pintado imperativo y pausa fuera de pantalla.

`engine/director.ts`, `engine/still.ts`, `runtime.ts`, `labels.ts` y `MarcoShowcase.tsx` son
código propio de Framezen.

### Diseño propio

El diseño de Marco y de Framezen es propio: nombre, color tinta de la marca, ojos blancos,
pose de reposo que mira al usuario, estados del asistente (escuchando, pensando,
trabajando, listo, aprobación, error), anillos y pastilla ámbar. No reproduce el aspecto
del avatar que bloub recrea, y no se usan imágenes, nombres ni marcas de bloub ni de
terceros. Como aclara el propio README de bloub, su licencia MIT cubre el código, no el
diseño que imita.

### Licencia

```
MIT License

Copyright (c) 2026 Jérémy Perret

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
