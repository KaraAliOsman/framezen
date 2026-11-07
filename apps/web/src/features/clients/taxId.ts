/**
 * Documento tributario del cliente. En Chile (empresa que cobra en CLP, el caso por defecto) es el
 * RUT: se formatea 12.345.678-5 y se avisa —sin bloquear— si el dígito verificador no calza. En
 * otros países el campo es el mismo dato (`client.rut`) pero se guarda tal cual se escribe, sin
 * validar con reglas chilenas (un CNPJ o una partita IVA no tienen dígito módulo 11).
 */
import { useMemo } from 'react'
import { useOrgCurrency, useT } from '../../lib/i18n'
import es from './i18n/es'
import { formatRut, rutHint, rutStatus, type RutStatus } from './rut'

export interface TaxIdRules {
  /** RUT chileno (formato y aviso de dígito verificador). */
  chile: boolean
  label: string
  placeholder: string
  addLabel: string
  missingLabel: string
  /** Formato al confirmar (RUT con puntos y guion; en otros países, solo se recortan espacios). */
  normalize: (value: string) => string
  /** Aviso suave o null. */
  hint: (value: string | null | undefined) => string | null
  status: (value: string | null | undefined) => RutStatus
}

/** Reglas puras según la moneda de la empresa (sin moneda conocida = Chile, el valor por defecto). */
export function isChileanTaxId(currency: string | undefined | null): boolean {
  return !currency || currency.toUpperCase() === 'CLP'
}

export function useTaxIdRules(): TaxIdRules {
  const t = useT(es)
  const currency = useOrgCurrency()
  const chile = isChileanTaxId(currency)
  return useMemo<TaxIdRules>(
    () =>
      chile
        ? {
            chile,
            label: t('fields.rut'),
            placeholder: t('placeholders.rut'),
            addLabel: t('add.rut'),
            missingLabel: t('list.missing.rut'),
            normalize: (value) => formatRut(value),
            hint: (value) => rutHint(value, t.locale),
            status: rutStatus,
          }
        : {
            chile,
            label: t('fields.taxId'),
            placeholder: t('placeholders.taxId'),
            addLabel: t('add.taxId'),
            missingLabel: t('list.missing.taxId'),
            normalize: (value) => value.trim(),
            hint: () => null,
            status: (value) => (value?.trim() ? 'valid' : 'empty'),
          },
    [chile, t],
  )
}
