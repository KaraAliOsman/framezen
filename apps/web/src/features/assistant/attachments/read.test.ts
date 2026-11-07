import { ATTACHMENT_LIMITS } from '@dekopen/shared'
import { describe, expect, it } from 'vitest'
import { joinPageText } from './pdf'
import { decodeText, extensionOf, fitTurn, readAttachment } from './read'
import { ReadProblem } from './types'

const file = (name: string, body: string | Uint8Array<ArrayBuffer> = 'x', type = '') => new File([body], name, { type })

async function problem(input: File): Promise<string> {
  try {
    await readAttachment(input)
    return 'ok'
  } catch (error) {
    return error instanceof ReadProblem ? error.code : 'other'
  }
}

describe('adjuntos', () => {
  it('reconoce la extensión sin distinguir mayúsculas', () => {
    expect(extensionOf('Plano FINAL.PDF')).toBe('pdf')
    expect(extensionOf('sin-extension')).toBe('')
  })

  it('lee texto, CSV y un archivo sin extensión', async () => {
    expect((await readAttachment(file('medidas.csv', 'V1;1500;1200'))).attachment).toMatchObject({ kind: 'spreadsheet', text: 'V1;1500;1200' })
    expect((await readAttachment(file('obra', 'V1 1500 x 1200'))).attachment).toMatchObject({ kind: 'text', text: 'V1 1500 x 1200' })
  })

  it('un .dxf de texto se lee como texto', async () => {
    expect((await readAttachment(file('corte.dxf', '0\nSECTION\n2\nENTITIES'))).attachment.kind).toBe('text')
  })

  it('acepta planillas de Windows sin UTF-8', () => {
    expect(decodeText(new Uint8Array([0x61, 0xf1, 0x6f]))).toBe('año')
  })

  it('no confunde un binario con texto', async () => {
    expect(decodeText(new Uint8Array([1, 2, 0, 3]))).toBeNull()
    expect(await problem(file('datos.bin', new Uint8Array([1, 2, 0, 3])))).toBe('unreadable')
  })

  it('dice por qué no lee cada formato, sin intentar adivinar', async () => {
    expect(await problem(file('antiguo.doc'))).toBe('legacy_office')
    expect(await problem(file('plano.dwg'))).toBe('cad')
    expect(await problem(file('audio.mp3'))).toBe('media')
    expect(await problem(file('video.bin', 'x', 'video/mp4'))).toBe('media')
    expect(await problem(file('fotos.zip'))).toBe('archive')
    expect(await problem(new File([], 'vacio.txt'))).toBe('empty')
  })

  it('recorta un texto largo y lo deja marcado', async () => {
    const { attachment } = await readAttachment(file('largo.txt', 'a'.repeat(ATTACHMENT_LIMITS.fileChars + 10)))
    expect(attachment.text).toHaveLength(ATTACHMENT_LIMITS.fileChars)
    expect(attachment.truncated).toBe(true)
  })

  it('el turno completo respeta los topes y marca lo recortado', () => {
    const big = { name: 'a.txt', kind: 'text' as const, text: 'a'.repeat(ATTACHMENT_LIMITS.fileChars) }
    const out = fitTurn([big, { ...big, name: 'b.txt' }, { ...big, name: 'c.txt' }])
    expect(out.reduce((n, f) => n + (f.text?.length ?? 0), 0)).toBe(ATTACHMENT_LIMITS.turnChars)
    expect(out).toHaveLength(2)
    expect(out[1]!.truncated).toBe(true)
  })

  it('las columnas de un PDF siguen siendo columnas', () => {
    const at = (str: string, x: number, y: number, width = 20) => ({ str, width, transform: [1, 0, 0, 1, x, y] })
    expect(joinPageText([at('V1', 10, 700), at('1500', 120, 700), at('V2', 10, 680), at('900', 120, 680)])).toBe('V1\t1500\nV2\t900')
  })
})
