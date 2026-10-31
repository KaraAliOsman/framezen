/**
 * Ajuste fino al imprimir documentos de taller: si una hoja se pasa a una página más solo por
 * unas pocas filas (hasta 90 mm, un tercio de hoja), se compacta (clase `fzw-tight` y, si no basta,
 * `fzw-tighter`) para no dejar una hoja con una o dos filas. Si ni así cabe, queda como estaba.
 *
 * Los documentos de taller fluyen con @page (no se paginan a mano), así que la única forma
 * exacta de saberlo es medir en el navegador:
 * - servidor (PDF y ?format=html): `WORKSHOP_FIT_SCRIPT` va en el HTML y corre antes de imprimir;
 * - web (vista previa e «Imprimir»): `DocRoot` la llama en un efecto.
 *
 * Mide con offsetTop/offsetHeight (no les afecta `transform`) y con una sonda del alto de la
 * página en las mismas coordenadas (sirve también con `zoom`). Debe ser autocontenida: se
 * serializa con String() para el script del servidor (sin funciones internas con nombre).
 */
export function fitWorkshopSheets(root: ParentNode | null | undefined): void {
  if (!root || typeof document === 'undefined') return
  const docs: Element[] = Array.from(root.querySelectorAll('.fzw-doc[data-fit]'))
  if ((root as Element).matches && (root as Element).matches('.fzw-doc[data-fit]')) docs.unshift(root as Element)
  for (const doc of docs) {
    for (const node of Array.from(doc.children)) {
      const sheet = node as HTMLElement
      if (!sheet.classList || !sheet.classList.contains('fzw-sheet')) continue
      sheet.classList.remove('fzw-tight', 'fzw-tighter')
      // En pantalla la hoja es flex (pie abajo) y los márgenes no se colapsan; al imprimir es un
      // bloque. Se mide como bloque para que las alturas sean las del papel.
      const display = sheet.style.display
      sheet.style.display = 'block'
      // Alto útil de la página (sin márgenes de @page: 11 + 13 mm), holgura por página que
      // sigue (encabezado de tabla repetido y filas que no se parten) y cuánto «vale» una hoja.
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:1px;height:calc(var(--fzw-page-h) - 24mm)'
      sheet.appendChild(probe)
      const page = probe.offsetHeight
      probe.style.height = '14mm'
      const slack = probe.offsetHeight
      probe.style.height = '90mm'
      const worth = probe.offsetHeight
      sheet.removeChild(probe)
      if (!(page > 0)) {
        sheet.style.display = display
        if (!sheet.getAttribute('style')) sheet.removeAttribute('style')
        continue
      }
      const levels = ['', 'fzw-tight', 'fzw-tighter']
      let target = 0
      let keep = false
      for (let i = 0; i < levels.length; i++) {
        if (levels[i]) sheet.classList.add(levels[i] as string)
        const first = sheet.firstElementChild as HTMLElement | null
        let last = sheet.lastElementChild as HTMLElement | null
        while (last && last.tagName === 'FOOTER') last = last.previousElementSibling as HTMLElement | null
        if (!first || !last) break
        // Simula el corte de páginas: los bloques que no se parten (`break-inside: avoid`, como los
        // grupos de barras de Cortes) pasan enteros a la hoja siguiente y dejan su hueco. Un
        // contenedor con `data-fit-flow` que sí se puede partir se mide por sus hijos, y un título
        // con `break-after: avoid` viaja pegado al bloque que lo sigue.
        const units: HTMLElement[] = []
        for (let child: HTMLElement | null = first; child; child = child.nextElementSibling as HTMLElement | null) {
          if (child.tagName === 'FOOTER') continue
          const cs = typeof getComputedStyle === 'function' ? getComputedStyle(child) : null
          const whole = !!cs && /avoid/.test(String(cs.breakInside || ''))
          if (!whole && child.hasAttribute('data-fit-flow') && child.firstElementChild) {
            for (let inner = child.firstElementChild as HTMLElement | null; inner; inner = inner.nextElementSibling as HTMLElement | null) units.push(inner)
          } else units.push(child)
        }
        let pages = 1
        let pageEnd = page
        let shift = 0
        let height = 0
        for (let u = 0; u < units.length; u++) {
          const unit = units[u] as HTMLElement
          const cs = typeof getComputedStyle === 'function' ? getComputedStyle(unit) : null
          let avoid = !!cs && /avoid/.test(String(cs.breakInside || ''))
          let end = unit
          if (cs && /avoid/.test(String(cs.breakAfter || '')) && u + 1 < units.length) {
            end = units[u + 1] as HTMLElement
            avoid = true
            u++
          }
          const top = unit.offsetTop - first.offsetTop + shift
          const size = end.offsetTop + end.offsetHeight - unit.offsetTop
          const bottom = top + size
          while (top >= pageEnd && size > 0 && pages < 200) {
            pageEnd += page - slack
            pages++
          }
          if (avoid && bottom > pageEnd && top > pageEnd - (page - slack) && size <= page - slack) {
            shift += pageEnd - top
            height = pageEnd + size
            pageEnd += page - slack
            pages++
            continue
          }
          while (bottom > pageEnd && pages < 200) {
            pageEnd += page - slack
            pages++
          }
          height = Math.max(height, bottom)
        }
        if (i === 0) {
          if (pages === 1) break
          // Lo que cae en la última hoja.
          const rest = height - (pageEnd - (page - slack))
          if (rest > worth) break
          target = pages - 1
          continue
        }
        if (pages <= target) {
          keep = true
          break
        }
      }
      if (!keep) sheet.classList.remove('fzw-tight', 'fzw-tighter')
      sheet.style.display = display
      if (!sheet.getAttribute('style')) sheet.removeAttribute('style')
    }
  }
}

/**
 * Script del HTML del servidor: ajusta las hojas cuando ya cargaron las fuentes (antes de que
 * Chromium imprima) y otra vez justo antes de imprimir desde el navegador.
 */
export const WORKSHOP_FIT_SCRIPT = `(function(){var fit=${String(fitWorkshopSheets)};var run=function(){try{fit(document)}catch(e){}};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(run,run)}else{run()}window.addEventListener('beforeprint',run)})();`
