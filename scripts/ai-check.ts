/**
 * npm run ai:check          llamada real mínima al proveedor y estado en lenguaje claro.
 * npm run ai:check -- --full además prueba herramientas, razonamiento, JSON e imagen.
 *
 * Sale con código 0 solo si está conectado. Nunca imprime la clave. Usa `process.exitCode` y no
 * `process.exit`: en Windows, cortar con conexiones de fetch abiertas revienta dentro de libuv.
 */
import '../apps/server/src/env-bootstrap'
import { describeProbe, runCheck, runFullCheck } from '../apps/server/src/services/ai/check-report'

const { probe, config } = await runCheck()
console.log(describeProbe(probe))

if (probe.state !== 'connected' || !config) {
  process.exitCode = 1
} else if (process.argv.includes('--full')) {
  const steps = await runFullCheck(config)
  for (const step of steps) console.log(`${step.ok ? 'OK   ' : 'FALLA'} ${step.name}: ${step.ms} ms${step.detail ? ` · ${step.detail}` : ''}`)
  if (steps.some((s) => !s.ok)) process.exitCode = 1
}
