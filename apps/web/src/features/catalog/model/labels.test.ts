import { describe, expect, it } from 'vitest'
import { sourceSentence } from './labels'

describe('fuente de una línea', () => {
  it('nunca muestra la orden de trabajo de un tercero, ni con un catálogo generado antes', () => {
    expect(sourceSentence({ source: 'Pauta de la distribuidora + OT N° 385 verificada al 0,1 mm' })).toBe('Pauta de la distribuidora, verificada por Framezen')
    expect(sourceSentence({ source: 'Pauta de la distribuidora + OT N° 385 (un caso verificado)' })).toBe(
      'Pauta de la distribuidora, verificada por Framezen en una ventana real',
    )
    expect(sourceSentence({ source: 'Pauta de la distribuidora + OT N°385 verificada · lista del 31-10-2026' })).toBe(
      'Pauta de la distribuidora, verificada por Framezen · lista del 31-10-2026',
    )
  })

  it('deja igual las fuentes de siempre', () => {
    expect(sourceSentence({ source: 'Pauta de la distribuidora, verificada por Framezen' })).toBe('Pauta de la distribuidora, verificada por Framezen')
    expect(sourceSentence({ source: 'plantilla genérica' })).toBe('Plantilla típica de Framezen')
    expect(sourceSentence({ source: 'Pauta de la distribuidora   ·   lista del 31-10-2026' })).toBe('Pauta de la distribuidora · lista del 31-10-2026')
    expect(sourceSentence({ source: '  ' })).toBeNull()
  })
})
