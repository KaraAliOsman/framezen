/**
 * «De dónde sale el precio» en el idioma de la interfaz. Las cifras son las del motor
 * (`ItemPriceDetail`): aquí solo se ponen nombres. En español se usa tal cual `explainPrice` del
 * motor (mismos textos de siempre); en los demás idiomas (o con otra moneda) se arman las mismas
 * líneas, en el mismo orden y con los mismos montos.
 */
import { explainPrice, type ItemPriceDetail, type PriceExplanationLine } from '@dekopen/engine'
import type { Formatter, Locale } from '@dekopen/shared'
import { translate, type MessageKey, type MessageParams } from '../../../lib/i18n'
import es from '../i18n/es'

const FAMILIES = ['profiles', 'reinforcement', 'glass', 'hardware', 'accessories'] as const

/** Líneas del desglose (sin redondeos propios: los montos vienen del motor). */
export function explainPriceLocalized(price: ItemPriceDetail, fmt: Formatter): PriceExplanationLine[] {
  const locale: Locale = fmt.locale
  // En español con pesos chilenos, el texto del motor tal cual (idéntico al de siempre).
  if (locale === 'es' && fmt.currency === 'CLP') return explainPrice(price)
  const t = (key: MessageKey<typeof es>, params?: MessageParams) => translate(es, key, params, locale)
  const out: PriceExplanationLine[] = []
  for (const family of FAMILIES) {
    const amount = price.materials?.[family] ?? 0
    if (amount !== 0) out.push({ label: t(`explain.family.${family}`), amount, kind: 'part' })
  }
  if (price.waste !== 0) {
    const label = t(price.chargeFullBars ? 'explain.wasteOther' : 'explain.waste')
    const pct = price.wastePct > 0 ? t('explain.withDetail', { label, detail: fmt.pct(price.wastePct) }) : label
    out.push({ label: pct, amount: price.waste, kind: 'part' })
  }
  if (price.labor !== 0) {
    const labor = price.lines?.find((l) => l.group === 'labor')
    const base = t('explain.labor')
    const label = labor ? t('explain.withDetail', { label: base, detail: `${fmt.area(labor.qty)} × ${fmt.money(labor.unitCost)}` }) : base
    out.push({ label, amount: price.labor, kind: 'part' })
  }
  if (price.install !== 0) {
    const install = price.lines?.find((l) => l.group === 'install')
    const base = t('explain.install')
    const label = install && install.unit === 'm²' ? t('explain.withDetail', { label: base, detail: `${fmt.area(install.qty)} × ${fmt.money(install.unitCost)}` }) : base
    out.push({ label, amount: price.install, kind: 'part' })
  }
  out.push({ label: t('explain.cost'), amount: price.cost, kind: 'subtotal' })

  const rounding = !price.manual && typeof price.rounding === 'number' ? Math.round(price.rounding) : 0
  const profit = price.unitNet - price.cost - rounding
  if (profit >= 0) {
    const how = price.manual
      ? t('explain.marginReal', { pct: fmt.pct(price.marginPct) })
      : price.marginMode === 'markup'
        ? t('explain.markupTarget', { pct: fmt.pct(price.targetMarginPct) })
        : t('explain.marginReal', { pct: fmt.pct(price.targetMarginPct) })
    out.push({ label: t('explain.profit', { how }), amount: profit, kind: 'part' })
  } else {
    out.push({ label: t('explain.loss'), amount: profit, kind: 'part' })
  }
  if (rounding > 0) {
    out.push({ label: price.roundTo > 1 ? t('explain.roundingTo', { step: fmt.money(price.roundTo) }) : t('explain.rounding'), amount: rounding, kind: 'part' })
  }
  out.push({ label: t(price.manual ? 'explain.unitManual' : 'explain.unit'), amount: price.unitNet, kind: 'total' })
  if (price.qty !== 1) out.push({ label: t('explain.total', { count: price.qty }), amount: price.totalNet, kind: 'total' })
  return out
}
