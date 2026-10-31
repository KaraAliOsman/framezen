import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { changePct, forceBrand, isLargeChange, previewImport } from './importPreview'

const brand = SAMPLE_CATALOG.brands.find((b) => SAMPLE_CATALOG.lines.some((l) => l.brandId === b.id))!
const profile = SAMPLE_CATALOG.profiles.find((p) => Object.values(p.priceByColor).some((v) => v > 0) && p.role !== 'reinforcement')!
const color = Object.keys(profile.priceByColor)[0]
const colorName = SAMPLE_CATALOG.colors.find((c) => c.id === color)!.name
const before = profile.priceByColor[color]
const item = SAMPLE_CATALOG.items.find((i) => i.price > 0 && i.brandId === brand.id) ?? SAMPLE_CATALOG.items.find((i) => i.price > 0)!
const itemBrand = SAMPLE_CATALOG.brands.find((b) => b.id === item.brandId)!

const HEADER = 'ID;Marca;Tipo;Código;Descripción;Línea;Color;;;Precio'
const csv = (rows: string[]) => `﻿${[HEADER, ...rows].join('\r\n')}\r\n`

describe('vista previa de «MisPrecios»', () => {
  it('muestra el precio actual y el nuevo de lo que calza, y lista lo que no', () => {
    const text = csv([
      `1;${brand.name};Perfil · Marco;${profile.code};${profile.name};;${colorName};$;CLP;${before + 1000}`,
      `2;${itemBrand.name};Herraje;${item.code};${item.name};;;$;CLP;${item.price}`,
      `3;${brand.name};Herraje;NO-EXISTE-999;Manilla que no está en el catálogo;;;$;CLP;4500`,
      `4;${brand.name};Herraje;SIN-PRECIO;Bisagra sin precio;;;$;CLP;0`,
    ])
    const preview = previewImport(text, SAMPLE_CATALOG)
    expect(preview.rows).toBe(4)
    expect(preview.skipped).toBe(1)
    expect(preview.unmatched.map((r) => r.code)).toEqual(['NO-EXISTE-999'])
    const change = preview.changes.find((c) => c.id === profile.id && c.colorId === color)
    expect(change).toMatchObject({ before, after: before + 1000, family: 'profile', review: false })
    expect(preview.unchanged).toBeGreaterThanOrEqual(1) // el herraje ya tenía ese precio
    expect(preview.up).toBe(preview.changes.length)
    expect(preview.overrides.every((o) => Number.isInteger(o.price))).toBe(true)
  })

  it('marca para revisar los cambios de más de ±60 % y los pone primero', () => {
    const text = csv([
      `1;${brand.name};Perfil · Marco;${profile.code};${profile.name};;${colorName};$;CLP;${Math.round(before * 3)}`,
      `2;${itemBrand.name};Herraje;${item.code};${item.name};;;$;CLP;${item.price + 10}`,
    ])
    const preview = previewImport(text, SAMPLE_CATALOG)
    expect(preview.review).toBe(1)
    expect(preview.changes[0]).toMatchObject({ id: profile.id, review: true })
  })

  it('la marca elegida en pantalla manda sobre la columna Marca', () => {
    const text = csv([`1;Otra marca cualquiera;Perfil · Marco;${profile.code};${profile.name};;${colorName};$;CLP;${before + 500}`])
    expect(previewImport(text, SAMPLE_CATALOG, { brandId: brand.id }).changes.some((c) => c.id === profile.id)).toBe(true)
    expect(forceBrand([{ brand: 'X' } as never], 'Y')[0]).toMatchObject({ brand: 'Y' })
    expect(forceBrand([{ brand: 'X' } as never], undefined)[0]).toMatchObject({ brand: 'X' })
  })

  it('un archivo vacío o sin filas no rompe nada', () => {
    const preview = previewImport('', SAMPLE_CATALOG)
    expect(preview).toMatchObject({ rows: 0, matched: 0, changes: [], unmatched: [] })
  })

  it('variación porcentual y cambios grandes', () => {
    expect(changePct(1000, 1120)).toBe(12)
    expect(changePct(0, 500)).toBeNull()
    expect(isLargeChange(1000, 1700)).toBe(true)
    expect(isLargeChange(1000, 1500)).toBe(false)
    expect(isLargeChange(0, 99999)).toBe(false)
  })
})
