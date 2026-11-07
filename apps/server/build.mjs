import { cpSync, rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/index.js',
  sourcemap: true,
  jsx: 'automatic',
  plugins: [
    {
      // Los paquetes del monorepo (@dekopen/*, TypeScript fuente) van dentro del bundle;
      // las dependencias reales de npm y los módulos de Node quedan externos.
      name: 'bundle-workspace-only',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === 'entry-point') return undefined
          if (args.path.startsWith('.') || isAbsolute(args.path)) return undefined
          if (args.path.startsWith('@dekopen/')) return undefined
          return { path: args.path, external: true }
        })
      },
    },
  ],
  // `require` para dependencias CJS dentro del bundle ESM. Con alias: el código del bundle también
  // importa `createRequire` (p. ej. las fuentes de los PDF) y un nombre repetido rompe el arranque.
  banner: { js: "import { createRequire as __fzCreateRequire } from 'node:module'; const require = __fzCreateRequire(import.meta.url);" },
})

// Las migraciones SQL viajan junto al bundle (el servidor las aplica solo al arrancar).
rmSync('dist/migrations', { recursive: true, force: true })
cpSync('migrations', 'dist/migrations', { recursive: true })
console.log('server built → dist/index.js (+ dist/migrations)')
