import { describe, expect, it } from 'vitest'
import { distinctInitials, initials } from './format'

describe('initials', () => {
  it('personas: primera letra del nombre y del último apellido', () => {
    expect(initials('Ana Pérez')).toBe('AP')
    expect(initials('María José Fuentes')).toBe('MF')
    expect(initials('Camila')).toBe('CA')
    expect(initials('  rosa   martínez ')).toBe('RM')
    expect(initials('Ñuble')).toBe('ÑU')
  })

  it('empresas: no cuenta el sufijo societario ni las palabras de una letra', () => {
    expect(initials('Constructora Los Aromos SpA')).toBe('CA')
    expect(initials('Constructora Los Aromos Limitada')).toBe('CA')
    expect(initials('Ventanas Martínez Ltda.')).toBe('VM')
    expect(initials('Inmobiliaria Pérez y Cía. Ltda.')).toBe('IP')
    expect(initials('Vidrios del Sur S.A.')).toBe('VS')
    expect(initials('Vidrios del Sur S. A.')).toBe('VS')
    expect(initials('Taller Soto E.I.R.L.')).toBe('TS')
    expect(initials('Juan A. Pérez')).toBe('JP')
  })

  it('un sufijo al principio es parte del nombre y nunca queda vacío', () => {
    expect(initials('Spa Los Aromos')).toBe('SA')
    expect(initials('SpA')).toBe('SP')
    expect(initials('')).toBe('·')
    expect(initials(' — ')).toBe('·')
    expect(initials('A')).toBe('A')
  })

  it('desempata con `avoid` y `distinctInitials` (marcas con el mismo comienzo)', () => {
    expect(initials('Winsa', { avoid: ['WI'] })).toBe('WA')
    expect(distinctInitials(['Winhouse', 'Winsa', 'Rehau'])).toEqual(['WI', 'WA', 'RE'])
    expect(distinctInitials(['Ana Pérez', 'Andrés Pérez'])).toEqual(['AP', 'AN'])
    const many = distinctInitials(['Winhouse', 'Winsa', 'Windows', 'Winko'])
    expect(new Set(many).size).toBe(4)
  })
})
