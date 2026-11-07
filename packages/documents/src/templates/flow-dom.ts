/**
 * Paginación medida sobre el HTML estático (Chromium antes de imprimir, «Imprimir» del navegador o el
 * HTML descargado): toma los bloques de todas las hojas de cada documento con plantilla
 * (`[data-dk-flow]`), mide su alto real con las fuentes ya cargadas y los vuelve a repartir con las
 * mismas reglas que `paginateFlow`: crea hojas copiando la última (cabecera y pie incluidos), borra las
 * que sobran y renumera «Página X de Y». La portada no se toca.
 *
 * Debe ser autocontenida: el servidor la serializa con String() y la ejecuta con `page.evaluate` (los
 * PDF se arman con el JavaScript del documento apagado). Por eso no usa funciones internas con nombre
 * ni nada fuera de su cuerpo. Es idempotente: correrla dos veces da lo mismo.
 */
export function flowDocumentPages(root: ParentNode | null | undefined): number {
  if (!root || typeof document === 'undefined') return 0
  const docs: Element[] = Array.from(root.querySelectorAll('[data-dk-flow]'))
  if ((root as Element).matches && (root as Element).matches('[data-dk-flow]')) docs.unshift(root as Element)
  let moved = 0
  for (const doc of docs) {
    for (const old of Array.from(doc.querySelectorAll('[data-dk-clone]'))) old.parentNode && old.parentNode.removeChild(old)
    const all = Array.from(doc.children).filter((n) => n.hasAttribute('data-dk-page')) as HTMLElement[]
    const segments: HTMLElement[][] = []
    let run: HTMLElement[] = []
    for (const p of all) {
      if (p.getAttribute('data-dk-page') === 'cover') {
        if (run.length) segments.push(run)
        run = []
      } else run.push(p)
    }
    if (run.length) segments.push(run)

    for (const pages of segments) {
      const blocks: HTMLElement[] = []
      for (const p of pages) {
        const body = p.querySelector('[data-dk-body]')
        if (!body) continue
        for (const child of Array.from(body.children)) if (child.hasAttribute('data-dk-block')) blocks.push(child as HTMLElement)
      }
      if (blocks.length === 0) continue
      // Alto del bloque (sin el aire previo, que es su margen superior y depende de si abre la hoja).
      const heights: number[] = []
      const spaces: number[] = []
      const heads: Record<string, { el: HTMLElement; h: number }> = {}
      for (const b of blocks) {
        const space = parseFloat(b.getAttribute('data-dk-space') || '0') || 0
        // Alto exacto con decimales: `offsetHeight` redondea y en una lista larga el error se acumula.
        const h = Math.max(0, b.getBoundingClientRect().height || b.offsetHeight)
        heights.push(h)
        // Un bloque oculto por el diseño (sin cajas) no ocupa aire; uno de alto cero sí lo conserva.
        spaces.push(h > 0 || b.getClientRects().length > 0 ? space : 0)
        const g = b.getAttribute('data-dk-group')
        if (g && b.hasAttribute('data-dk-thead')) heads[g] = { el: b, h }
      }
      for (const b of blocks) b.parentNode && b.parentNode.removeChild(b)

      let pi = 0
      let body = pages[0].querySelector('[data-dk-body]') as HTMLElement
      let budget = body.clientHeight
      let used = 0
      let count = 0
      let forceNew = false
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        const h = heights[i]
        const own = b.getAttribute('data-dk-own') === '1'
        const soft = b.getAttribute('data-dk-break') === 'soft'
        // Cadena «viaja con el siguiente»: título → ventana → subtotal se mueven juntos, no de a pares.
        let chain = 0
        if (b.hasAttribute('data-dk-keep')) {
          for (let j = i + 1; j < blocks.length; j++) {
            const nb = blocks[j]
            if (nb.hasAttribute('data-dk-break') || nb.getAttribute('data-dk-own') === '1') break
            chain += spaces[j] + heights[j]
            if (!nb.hasAttribute('data-dk-keep')) break
          }
        }
        const s = count ? spaces[i] : 0
        const fits = b.hasAttribute('data-dk-fit') && count > 0 && used + s + h + chain <= budget + 0.5
        const brk = own || (b.hasAttribute('data-dk-break') && !fits && !(soft && used < budget * 0.25))
        if (count > 0 && (forceNew || brk || used + s + h + chain > budget + 0.5)) {
          pi++
          if (pi >= pages.length) {
            const last = pages[pages.length - 1]
            const shell = last.cloneNode(true) as HTMLElement
            shell.classList.remove('dkd-page--lead')
            shell.removeAttribute('data-dk-lead')
            const shellBody = shell.querySelector('[data-dk-body]')
            if (shellBody) while (shellBody.firstChild) shellBody.removeChild(shellBody.firstChild)
            last.parentNode && last.parentNode.insertBefore(shell, last.nextSibling)
            pages.push(shell)
          }
          body = pages[pi].querySelector('[data-dk-body]') as HTMLElement
          budget = body.clientHeight
          used = 0
          count = 0
        }
        forceNew = false
        const g = b.getAttribute('data-dk-group')
        if (g && !b.hasAttribute('data-dk-thead') && count === 0 && heads[g]) {
          const clone = heads[g].el.cloneNode(true) as HTMLElement
          clone.setAttribute('data-dk-clone', '')
          clone.removeAttribute('data-dk-block')
          body.appendChild(clone)
          used += heads[g].h
          count++
        }
        body.appendChild(b)
        used += (count ? spaces[i] : 0) + h
        count++
        if (own) forceNew = true
        moved++
      }
      for (let j = pages.length - 1; j > pi; j--) {
        const extra = pages[j]
        extra.parentNode && extra.parentNode.removeChild(extra)
      }
      // Cierre equilibrado: misma regla que `balanceClosing` en flow.ts (mismas constantes y tipos).
      if (pi > 0) {
        const lastBody = pages[pi].querySelector('[data-dk-body]') as HTMLElement
        const prevBody = pages[pi - 1].querySelector('[data-dk-body]') as HTMLElement
        const prevList = Array.from(prevBody.children) as HTMLElement[]
        const lastList = Array.from(lastBody.children) as HTMLElement[]
        const room = lastBody.clientHeight
        let lastUsed = 0
        let prevUsed = 0
        for (let i = 0; i < lastList.length; i++) {
          const at = blocks.indexOf(lastList[i])
          lastUsed += (at >= 0 ? heights[at] : lastList[i].getBoundingClientRect().height) + (i && at >= 0 ? spaces[at] : 0)
        }
        for (let i = 0; i < prevList.length; i++) {
          const at = blocks.indexOf(prevList[i])
          prevUsed += (at >= 0 ? heights[at] : prevList[i].getBoundingClientRect().height) + (i && at >= 0 ? spaces[at] : 0)
        }
        if (lastList.length > 0 && lastUsed < room * 0.55) {
          let cut = prevList.length
          for (let i = prevList.length - 1; i > 0; i--) {
            const el = prevList[i]
            const type = el.getAttribute('data-dk-type') || ''
            const at = blocks.indexOf(el)
            if (at < 0 || el.hasAttribute('data-dk-group') || !(type === 'terms' || type === 'warranty' || type === 'custom_text')) break
            const size = heights[at] + spaces[at]
            lastUsed += size
            prevUsed -= size
            if (lastUsed > room * 0.92 || prevUsed < room * 0.4) break
            if (prevList[i - 1].getAttribute('data-dk-section') !== el.getAttribute('data-dk-section')) cut = i
          }
          const anchor = lastBody.firstChild
          for (let i = cut; i < prevList.length; i++) lastBody.insertBefore(prevList[i], anchor)
        }
      }
    }
    const final = Array.from(doc.children).filter((n) => n.hasAttribute('data-dk-page'))
    final.forEach((p, idx) => {
      for (const n of Array.from(p.querySelectorAll('[data-dk-pn]'))) n.textContent = String(idx + 1)
      for (const n of Array.from(p.querySelectorAll('[data-dk-pt]'))) n.textContent = String(final.length)
    })
    doc.setAttribute('data-dk-flowed', String(final.length))
  }
  return moved
}

/**
 * Script para el HTML del servidor (`?format=html`, descarga): repagina cuando cargaron las fuentes y
 * otra vez antes de imprimir. En el PDF el servidor ejecuta `flowDocumentPages` con `page.evaluate`.
 * Si se incluye en un HTML servido con CSP, su hash debe ir junto a `DOCUMENT_SCRIPT_HASH`.
 */
export const TEMPLATE_FLOW_SCRIPT = `(function(){var flow=${String(flowDocumentPages)};var run=function(){try{flow(document)}catch(e){}};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(run,run)}else{run()}window.addEventListener('beforeprint',run)})();`

/** Expresión lista para `page.evaluate` (Chromium sin JavaScript del documento). */
export const TRUSTED_TEMPLATE_FLOW = `(function(){try{return (${String(flowDocumentPages)})(document)}catch(e){return -1}})()`
