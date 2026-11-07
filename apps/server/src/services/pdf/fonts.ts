/**
 * Fuentes de los documentos embebidas como data URL (Chromium no sale a la red y el PDF
 * queda idéntico en cualquier máquina). Se leen una sola vez de node_modules con las
 * rutas de DOCUMENT_FONT_FILES y quedan en memoria.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { DOCUMENT_FONT_FILES, docFontFaceRules, documentFontFaces, type DocFontFamily, type DocFontFile } from '@dekopen/documents'
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

const fileUrls = new Map<string, string | undefined>()

/** data URL de un archivo de fuente de la lista cerrada de plantillas (se lee una sola vez). */
function templateFontUrl(file: DocFontFile): string | undefined {
  if (fileUrls.has(file.file)) return fileUrls.get(file.file)
  let url: string | undefined
  const path = resolveFont(file.file)
  if (path) {
    try {
      url = `data:font/woff2;base64,${readFileSync(path).toString('base64')}`
    } catch {
      url = undefined
    }
  }
  fileUrls.set(file.file, url)
  return url
}

/**
 * @font-face de las fuentes que usa una plantilla (subconjuntos latin y latin-ext: el turco, el alemán y
 * el francés imprimen sus letras). Las que falten usan la fuente de respaldo de la pila.
 */
export function templateFontCss(files: readonly DocFontFile[]): string {
  return docFontFaceRules(files, templateFontUrl)
}
