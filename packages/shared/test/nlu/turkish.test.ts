/**
 * Turco: mayúsculas con İ/ı, sufijos de caso en sustantivos conocidos, verbo al final, ordinales
 * «2. kalemi» y porcentajes antepuestos «%10».
 */
import { describe, expect, it } from 'vitest'
import { foldText, strictText } from '../../src/nlu/text'
import { makeNlu, QUOTE_CTX } from './fixtures'

const nlu = makeNlu('tr')
const plan = (text: string) => {
  const r = nlu.parse(text, QUOTE_CTX)
  expect(r.status, `${text} → ${r.status} ${JSON.stringify(r.ignored)}`).toBe('ready')
  return r.plan!.map((c) => [c.tool, c.args])
}

describe('turco', () => {
  it('plegado: İ → i, I → i, ı → i en la clave de búsqueda; minúsculas turcas en la estricta', () => {
    expect(foldText('İÇ')).toBe('ic')
    expect(foldText('DIŞ')).toBe('dis')
    expect(foldText('ISI')).toBe('isi')
    expect(strictText('İÇ', true)).toBe('iç')
    expect(strictText('DIŞ', true)).toBe('dış')
  })

  it('texto en mayúsculas con İ/I', () => {
    expect(plan('YENİ TEKLİF OLUŞTUR')).toEqual([['create_quote', {}]])
    expect(plan('KATALOĞA GİT')).toEqual([['navigate', { to: 'catalog' }]])
    expect(plan('DİLİ İNGİLİZCE OLARAK DEĞİŞTİR')).toEqual([['set_ui_locale', { locale: 'en' }]])
  })

  it('iç/dış renkler (bicolor)', () => {
    const [[, args]] = plan('2. kalemin dışı ceviz içi beyaz olsun')
    expect(args).toMatchObject({ ref: 'V2', colorId: 'col-walnut', colorInId: 'col-white' })
  })

  it('verbo al final, ordinales y porcentaje antepuesto', () => {
    expect(plan('3. kalemi sil')).toEqual([['remove_window', { ref: 'V3' }]])
    expect(plan('2. kalemi 3 kez çoğalt')).toEqual([['duplicate_window', { ref: 'V2', copies: 3 }]])
    expect(plan('%12 indirim uygula')).toEqual([['set_discount', { percent: 12 }]])
    expect(plan('1500 x 1200 mm 2 kanatlı sürme pencere ekle')[0][1]).toMatchObject({ typology: 'sliding_2', width: 1500, height: 1200 })
  })

  it('sin letras turcas (teclado ASCII)', () => {
    expect(plan('kataloga git')).toEqual([['navigate', { to: 'catalog' }]])
    expect(plan('dili ingilizce olarak degistir')).toEqual([['set_ui_locale', { locale: 'en' }]])
  })

  it('una cláusula que termina en verbo y otra que empieza: dos órdenes', () => {
    expect(plan('V2 rengini ceviz yap ve teklifi e-posta ile gönder').map(([t]) => t)).toEqual(['update_window', 'send_quote'])
  })
})
