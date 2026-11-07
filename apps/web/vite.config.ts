import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

const REGISTRY = path.resolve(import.meta.dirname, 'src/lib/i18n/registry').replaceAll('\\', '/')

/**
 * Cada `i18n/es.ts` se registra solo al cargarse. Así los textos viajan con su pantalla: el portal del
 * cliente no descarga los de ajustes, catálogo ni asistente. La carpeta da el id del espacio.
 */
function i18nSources() {
  return {
    name: 'dekopen-i18n-sources',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const file = id.split('?')[0].replaceAll('\\', '/')
      const match = /\/apps\/web\/src\/(.+)\/i18n\/es\.ts$/.exec(file)
      if (!match || !code.includes('export default es')) return null
      const relative = path.posix.relative(path.posix.dirname(file), REGISTRY)
      const from = relative.startsWith('.') ? relative : `./${relative}`
      return code.replace('export default es', `import { registerNamespace as __register } from '${from}'\n__register(${JSON.stringify(match[1])}, es as never)\nexport default es`)
    },
  }
}

export default defineConfig({
  plugins: [i18nSources(), react(), tailwindcss()],
  server: {
    // WEB_PORT / API_URL permiten levantar copias paralelas (QA, agentes) sin chocar con el dev principal.
    port: Number(process.env.WEB_PORT ?? 5180),
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
  build: {
    rolldownOptions: {
      output: {
        // El QR solo lo usan las etiquetas de taller y el AR de escritorio: que no viaje pegado a los datos de la cotización.
        codeSplitting: { groups: [{ name: 'qr-code', test: /node_modules[\\/](qrcode|dijkstrajs)[\\/]|documents[\\/]src[\\/](templates|workshop)[\\/]qr/ }] },
      },
    },
  },
  test: { name: 'web', environment: 'jsdom', testTimeout: 20000, include: ['src/**/*.test.ts?(x)', 'test/**/*.test.ts?(x)'] },
} as never)
