/**
 * Genera .data/catalog/base.json desde la carpeta de datos de marcas.
 *
 *   npx tsx packages/catalog/scripts/import.ts [carpeta]
 *
 * Carpeta: primer argumento o CATALOG_SOURCE_DIR (los datos de marcas no se versionan).
 */
import { DEFAULT_BASE_FILE, DEFAULT_SOURCE_DIR, formatImportReport, importBrandData, writeBaseCatalog, writeImportReport } from '../src/node'

const sourceDir = process.argv[2] ?? DEFAULT_SOURCE_DIR
if (!sourceDir) {
  console.error('Indica la carpeta de datos de marcas: npm run catalog:import -- "<carpeta>" (o define CATALOG_SOURCE_DIR).')
  process.exit(1)
}
const started = Date.now()
const { catalog, report } = importBrandData(sourceDir)
console.log(formatImportReport(report))
if (!catalog.lines.length) {
  console.error('\nNo se escribió el catálogo base porque no se importó ninguna línea.')
  process.exitCode = 1
} else {
  const file = writeBaseCatalog(catalog, DEFAULT_BASE_FILE)
  const reportFile = writeImportReport(report)
  console.log(`\nCatálogo base escrito en ${file}`)
  console.log(`Reporte completo en ${reportFile}`)
  console.log(`Listo en ${((Date.now() - started) / 1000).toFixed(1)} s`)
}
