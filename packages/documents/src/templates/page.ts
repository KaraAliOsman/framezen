/**
 * Geometría física de la página de una plantilla en px CSS (96 dpi, igual en pantalla y en Chromium):
 * tamaño real (A4 210 × 297 mm, Carta 215,9 × 279,4 mm), márgenes de la plantilla y alto de la
 * cabecera y el pie que se reservan en cada hoja. La paginación reparte bloques en `bodyHeight`.
 */
import { PAGE_SIZE_MM, type DocPage } from '@dekopen/shared'

export const PX_PER_MM = 96 / 25.4

export const mmToPx = (mm: number): number => Math.round(mm * PX_PER_MM * 100) / 100

/** Alto de la cabecera corrida y del pie (px) y su separación con el cuerpo. */
export const CHROME = {
  headerHeight: 26,
  headerGap: 18,
  footerHeight: 16,
  footerGap: 14,
} as const

export interface PageGeometry {
  size: DocPage['size']
  landscape: boolean
  widthMm: number
  heightMm: number
  width: number
  height: number
  margins: { top: number; right: number; bottom: number; left: number }
  /** Ancho útil (sin márgenes). */
  contentWidth: number
  hasHeader: boolean
  hasFooter: boolean
  /** Alto del cuerpo en una hoja con cabecera corrida. */
  bodyHeight: number
  /** Alto del cuerpo en la hoja inicial sin portada (la identidad va en el cuerpo, sin cabecera corrida). */
  leadBodyHeight: number
  /** Alto útil de la portada (con o sin cabecera y pie, según `chromeOnCover`). */
  coverBodyHeight: number
}

export function pageGeometry(page: DocPage): PageGeometry {
  const sheet = PAGE_SIZE_MM[page.size] ?? PAGE_SIZE_MM.A4
  const landscape = page.orientation === 'landscape'
  const dims = landscape ? { width: sheet.height, height: sheet.width } : sheet
  const width = mmToPx(dims.width)
  const height = mmToPx(dims.height)
  const margins = {
    top: mmToPx(page.margins.top),
    right: mmToPx(page.margins.right),
    bottom: mmToPx(page.margins.bottom),
    left: mmToPx(page.margins.left),
  }
  const hasHeader = page.header !== 'none'
  const hasFooter = page.footer !== 'none' || page.pageNumbers !== 'none'
  const inner = height - margins.top - margins.bottom
  const header = hasHeader ? CHROME.headerHeight + CHROME.headerGap : 0
  const footer = hasFooter ? CHROME.footerHeight + CHROME.footerGap : 0
  return {
    size: page.size,
    landscape,
    widthMm: dims.width,
    heightMm: dims.height,
    width,
    height,
    margins,
    contentWidth: Math.floor(width - margins.left - margins.right),
    hasHeader,
    hasFooter,
    bodyHeight: Math.floor(inner - header - footer),
    leadBodyHeight: Math.floor(inner - footer),
    coverBodyHeight: Math.floor(page.chromeOnCover ? inner - header - footer : inner),
  }
}
