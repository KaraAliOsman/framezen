/**
 * Fuentes de los documentos embebidas como data URL (Chromium no sale a la red y el PDF
 * queda idéntico en cualquier máquina). Se leen una sola vez de node_modules con las
 * rutas de DOCUMENT_FONT_FILES y quedan en memoria.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DOCUMENT_FONT_FILES, documentFontFaces, type DocFontFamily } from '@framezen/documents'
import { findRepoRoot } from '../../config'

let cachedCss: string | undefined
let cachedMissing: DocFontFamily[] = []

/** Resuelve un especificador de paquete probando desde este módulo, el cwd y la raíz del repo. */
function resolveFont(spec: string): string | undefined {
  const bases = [import.meta.url, join(process.cwd(), 'noop.js'), join(findRepoRoot(), 'noop.js')]
  for (const base of bases) {
    try {
      return createRequire(base).resolve(spec)
    } catch {
      // probamos la siguiente base
    }
  }
  return undefined
}

/** @font-face con las tres familias de los documentos (las que falten usan la fuente de respaldo). */
export function documentFontCss(): string {
  if (cachedCss !== undefined) return cachedCss
  const urls: Partial<Record<DocFontFamily, string>> = {}
  const missing: DocFontFamily[] = []
  for (const family of Object.keys(DOCUMENT_FONT_FILES) as DocFontFamily[]) {
    const file = resolveFont(DOCUMENT_FONT_FILES[family])
    if (!file) {
      missing.push(family)
      continue
    }
    try {
      urls[family] = `data:font/woff2;base64,${readFileSync(file).toString('base64')}`
    } catch {
      missing.push(family)
    }
  }
  cachedMissing = missing
  cachedCss = documentFontFaces(urls)
  return cachedCss
}

/** Familias que no se pudieron leer (diagnóstico). */
export function missingDocumentFonts(): DocFontFamily[] {
  documentFontCss()
  return cachedMissing
}
