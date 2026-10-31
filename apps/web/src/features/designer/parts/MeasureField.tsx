/**
 * NumberField sin carrera entre el foco y el formato.
 *
 * Al enfocar, NumberField cambia el texto visible («1.200» → «1200») en el siguiente render y
 * selecciona en el cuadro siguiente: si alguien escribe o pega justo en ese intervalo (un pegado
 * rápido, Playwright `fill`), el texto nuevo se suma al viejo («1200900» → 20.000 mm).
 * Seleccionamos todo al enfocar y otra vez en la microtarea siguiente, justo después de que React
 * aplica el texto y antes de cualquier tecla o pegado: escribir o pegar siempre reemplaza.
 */
import type { FocusEvent } from 'react'
import { NumberField, type NumberFieldProps } from '../../../ui/NumberField'

export function selectAllNow(event: FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget
  input.select()
  queueMicrotask(() => {
    if (document.activeElement === input) input.select()
  })
}

export function MeasureField({ onFocus, selectOnFocus = true, ...props }: NumberFieldProps) {
  return (
    <NumberField
      {...props}
      selectOnFocus={selectOnFocus}
      onFocus={(event) => {
        if (selectOnFocus) selectAllNow(event)
        onFocus?.(event)
      }}
    />
  )
}
