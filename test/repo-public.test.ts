/**
 * Higiene del repositorio PÚBLICO: ni claves, ni datos del negocio, ni bitácoras internas salen en git o
 * en la imagen Docker, y la documentación publicada no apunta a archivos que no se publican.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(args: string[], input?: string) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', input })
}

const hasGit = git(['rev-parse', '--git-dir']).status === 0

/** De las rutas dadas, las que .gitignore excluye (sin mirar el índice: vale para archivos que aún no existen). */
function gitIgnored(paths: string[]): Set<string> {
  const result = git(['check-ignore', '--no-index', '--stdin'], `${paths.join('\n')}\n`)
  // 0 = alguna ignorada, 1 = ninguna; otro código es un error de git.
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr || 'git check-ignore falló')
  return new Set(result.stdout.split(/\r?\n/).filter(Boolean))
}

const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development.local',
  '.env.test',
  '.env.example',
  'apps/web/.env',
  'apps/web/.env.local',
  'apps/web/.env.production',
  'apps/web/.env.production.local',
  'apps/server/.env',
  'apps/server/.env.test',
  'packages/catalog/.env.local',
]

const INTERNAL_NOTES = ['docs/build/ola1-api.md', 'docs/build/ola2-api.md', 'docs/build/auditoria-catalogo.md', 'docs/build/nueva-nota.md', 'docs/research/notas.md']

const PUBLIC_FILES = ['README.md', 'docs/SPEC.md', 'docs/DESIGN.md', 'apps/web/index.html', 'apps/web/src/main.tsx', 'packages/shared/src/api.ts', 'Dockerfile', '.dockerignore']

describe.skipIf(!hasGit)('.gitignore', () => {
  it('ningún .env* se versiona, en ninguna carpeta (Vite lee .env.[modo] y .env.[modo].local)', () => {
    const ignored = gitIgnored(ENV_FILES)
    expect(ENV_FILES.filter((path) => !ignored.has(path))).toEqual([])
  })

  it('las bitácoras y la investigación con datos del negocio quedan solo en local', () => {
    const ignored = gitIgnored(INTERNAL_NOTES)
    expect(INTERNAL_NOTES.filter((path) => !ignored.has(path))).toEqual([])
  })

  it('el código y la documentación pública sí se versionan', () => {
    expect([...gitIgnored(PUBLIC_FILES)]).toEqual([])
  })
})

/**
 * Coincidencia al estilo de .dockerignore (patternmatcher de Moby): el patrón se ancla a la raíz del
 * contexto, `**` cruza carpetas, `*` y `?` no, y excluir una carpeta excluye todo lo que tiene dentro.
 * La última regla que coincide gana (`!` vuelve a incluir).
 */
function dockerIgnored(path: string, rules: string[]): boolean {
  const toRegex = (pattern: string) => {
    let source = ''
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i]!
      if (char === '*' && pattern[i + 1] === '*') {
        i++
        if (pattern[i + 1] === '/') {
          i++
          source += '(?:.*/)?'
        } else source += '.*'
      } else if (char === '*') source += '[^/]*'
      else if (char === '?') source += '[^/]'
      else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
    return new RegExp(`^${source}(?:/.*)?$`)
  }
  let excluded = false
  for (const raw of rules) {
    const negate = raw.startsWith('!')
    const pattern = (negate ? raw.slice(1) : raw).replace(/^\/+|\/+$/g, '')
    if (toRegex(pattern).test(path)) excluded = !negate
  }
  return excluded
}

describe('.dockerignore', () => {
  const rules = readFileSync(resolve(ROOT, '.dockerignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  it('deja fuera de la imagen los .env*, .data y .scratch de cualquier carpeta (COPY apps ./apps)', () => {
    const secrets = [
      ...ENV_FILES,
      '.data/pg/PG_VERSION',
      'apps/server/.data/pg/PG_VERSION',
      'apps/server/.data/catalog/base.json',
      '.scratch/tools/x.mjs',
      'apps/web/.scratch/x.png',
    ]
    expect(secrets.filter((path) => !dockerIgnored(path, rules))).toEqual([])
  })

  it('sigue copiando lo que el build necesita', () => {
    const needed = ['package.json', 'package-lock.json', 'apps/web/index.html', 'apps/web/src/main.tsx', 'apps/server/src/index.ts', 'packages/engine/src/index.ts']
    expect(needed.filter((path) => dockerIgnored(path, rules))).toEqual([])
  })
})

describe.skipIf(!hasGit)('documentación pública', () => {
  const docs = ['README.md', 'docs/SPEC.md', 'docs/DESIGN.md', 'THIRD_PARTY_NOTICES.md']

  /** Enlaces relativos de Markdown y rutas `docs/…` citadas entre comillas invertidas. */
  function referencedPaths(markdown: string): string[] {
    const links = [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((target) => !/^(?:[a-z]+:|#)/i.test(target))
    const cited = [...markdown.matchAll(/`(docs\/[^`\s]+)`/g)].map((m) => m[1]!)
    return [...links, ...cited].map((path) => {
      const clean = path.replace(/^\.\//, '').replace(/#.*$/, '').replace(/\*+$/, '')
      // Una carpeta citada (`docs/research/`) se comprueba con un archivo de adentro.
      return clean.endsWith('/') ? `${clean}x.md` : clean
    })
  }

  it('no enlaza ni cita archivos que no se publican (darían 404 a quien clone el repo)', () => {
    const broken: string[] = []
    for (const doc of docs) {
      const paths = referencedPaths(readFileSync(resolve(ROOT, doc), 'utf8'))
      if (!paths.length) continue
      const ignored = gitIgnored(paths)
      for (const path of paths) if (ignored.has(path)) broken.push(`${doc} → ${path}`)
    }
    expect(broken).toEqual([])
  })

  it('no habla de la competencia ni del origen de los datos de marcas', () => {
    const mentions = docs.filter((doc) => /competidor/i.test(readFileSync(resolve(ROOT, doc), 'utf8')))
    expect(mentions).toEqual([])
  })
})
