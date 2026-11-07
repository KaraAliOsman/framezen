/**
 * Generador de la tabla `facefit-table.ts`. No corre en la suite normal (tarda): se ejecuta a
 * mano tras cambiar una forma, una expresión o un estilo de ojo:
 *   GENERATE_FACEFIT=1 npx vitest run apps/web/src/features/assistant/avatar/engine/facefit.generate.test.ts
 * e imprime la tabla lista para pegar.
 */
import { writeFileSync } from 'node:fs'
import { AVATAR_SHAPES } from '@dekopen/shared'
import { it } from 'vitest'
import { faceCases, fitSlack, referenceMargins, solveFaceFit } from './facefit'
import { SHAPE_PROFILES } from './shapes'

it.skipIf(!process.env.GENERATE_FACEFIT)(
  'genera la tabla de ajuste de cara',
  () => {
    const cases = faceCases()
    const required = referenceMargins(cases)
    const lines: string[] = []
    for (const id of AVATAR_SHAPES) {
      const fit = solveFaceFit(SHAPE_PROFILES[id], cases, required)
      const slack = fitSlack(SHAPE_PROFILES[id], fit, cases, required)
      lines.push(`  ${id}: { s: ${fit.s}, ox: ${fit.ox}, oy: ${fit.oy} }, // holgura ${slack.toFixed(4)}`)
    }
    const table = `export const FACE_FITS: Record<AvatarShape, FaceFit> = {\n${lines.join('\n')}\n}\n`
    if (process.env.GENERATE_FACEFIT_OUT) writeFileSync(process.env.GENERATE_FACEFIT_OUT, table)
    else console.log(table)
  },
  600_000,
)
