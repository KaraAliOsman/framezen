/**
 * Papeles de obra y de carpeta: portada, levantamiento, instalación con acta de recepción. No traen
 * tolerancias ni cláusulas escritas por DEKOPEN: lo que dependa del taller queda para escribir a mano.
 */
import { Box, DocHeader, DocRoot, Sheet, Signatures, WindowBand, WindowSketch, WriteField } from './common'
import { chunk, otLabel, quoteTitle, uniqueFooter, windowOperable, windowTitle } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'
import type { WorkshopWindow } from '@dekopen/engine'

// ─────────────────────────────────────────────────────────────────────────────
// Portada
// ─────────────────────────────────────────────────────────────────────────────

/** Documentos que se imprimen para fabricar, en orden de carpeta. */
const FOLDER_DOCS = ['work-order', 'cuts', 'cut-order', 'glass-plan', 'hardware', 'reinforcement', 'assembly', 'labels'] as const

/** Portada de la carpeta de obra: quién, qué y cuándo, la lista de ventanas y el índice. */
export function CoverDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('cover.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const units = data.windows.reduce((s, x) => s + x.qty, 0)
  const area = data.windows.reduce((s, x) => s + (x.bom.area ?? 0) * x.qty, 0)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="cover" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('cover.kicker')} w={w} />
        <h2 className="fzw-cover-title">{data.quote.title}</h2>
        <dl className="fzw-saw">
          {data.quote.clientName ? (
            <div>
              <dt>{t('cover.client')}</dt>
              <dd>{data.quote.clientName}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('cover.windows')}</dt>
            <dd>{w.f.int(data.windows.length)}</dd>
          </div>
          <div>
            <dt>{t('cover.units')}</dt>
            <dd>{w.f.int(units)}</dd>
          </div>
          <div>
            <dt>{t('cover.area')}</dt>
            <dd>{w.f.m2(area)}</dd>
          </div>
          {data.workOrder.dueDate ? (
            <div>
              <dt>{t('common.delivery')}</dt>
              <dd>{w.f.shortDate(data.workOrder.dueDate)}</dd>
            </div>
          ) : null}
        </dl>
        {data.workOrder.notes ? <p className="fzw-notes-text" style={{ marginTop: '3mm' }}>{data.workOrder.notes}</p> : null}

        <h2 className="fzw-h">{t('cover.list')}</h2>
        <table className="fzw-table fzw-table-dense">
          <thead>
            <tr>
              <th>{t('cover.ref')}</th>
              <th>{t('cover.window')}</th>
              <th className="num">{t('cover.size')}</th>
              <th className="num">{t('workOrder.qty')}</th>
            </tr>
          </thead>
          <tbody>
            {data.windows.map((window) => {
              const { title, subtitle } = windowTitle(window, w)
              return (
                <tr key={window.ref}>
                  <td>
                    <span className="fzw-mid">{window.ref}</span>
                  </td>
                  <td>
                    <span className="fzw-cell-title">{title}</span>
                    {subtitle ? <div className="fzw-cell-sub">{subtitle}</div> : null}
                  </td>
                  <td className="num fzw-nowrap">{w.f.size(window.design.width, window.design.height)}</td>
                  <td className="num">
                    <span className="fzw-mid">{w.f.int(window.qty)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h2 className="fzw-h">{t('cover.index')}</h2>
        <ul className="fzw-index">
          {FOLDER_DOCS.map((kind) => (
            <li key={kind}>
              <Box label={t(`docs.${kind}.title`)} w={w} />
              {t(`docs.${kind}.title`)}
            </li>
          ))}
        </ul>
      </Sheet>
    </DocRoot>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Levantamiento en obra
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Levantamiento en obra: una ficha por ventana para medir el vano antes de fabricar, a tres alturas
 * y tres anchos, con diagonales, plomo y nivel. La medida pedida va al lado para comparar.
 */
export function SurveyDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('survey.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const pages = chunk(data.windows, 2)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="survey" w={w}>
      {pages.map((windows, i) => (
        <Sheet key={i} footer={footer} footRight={t('assembly.sheet', { index: i + 1, total: pages.length })}>
          <DocHeader data={data} kicker={t('survey.kicker')} w={w} />
          {i === 0 ? (
            <div className="fzw-grid-2" style={{ marginBottom: '3mm' }}>
              <WriteField label={t('survey.who')} />
              <WriteField label={t('survey.when')} />
            </div>
          ) : null}
          {windows.map((window) => (
            <SurveyCard key={window.ref} window={window} data={data} w={w} />
          ))}
        </Sheet>
      ))}
      {pages.length === 0 ? (
        <Sheet footer={footer}>
          <DocHeader data={data} kicker={t('survey.kicker')} w={w} />
          <p className="fzw-muted">{t('assembly.empty')}</p>
        </Sheet>
      ) : null}
    </DocRoot>
  )
}

function SurveyCard({ window, data, w }: { window: WorkshopWindow; data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  return (
    <article className="fzw-card fzw-plan-card">
      <WindowBand window={window} small w={w} />
      <div className="fzw-card-grid">
        <div className="fzw-drawing">
          <WindowSketch window={window} catalog={data.catalog} width={180} height={140} dimensions="none" />
          <span className="fzw-small fzw-muted">{t('common.interiorView')}</span>
        </div>
        <table className="fzw-table fzw-survey">
          <thead>
            <tr>
              <th>{t('survey.measure')}</th>
              <th>{t('survey.p1')}</th>
              <th>{t('survey.p2')}</th>
              <th>{t('survey.p3')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="fzw-cell-title">{t('survey.width')}</td>
              <td />
              <td />
              <td />
            </tr>
            <tr>
              <td className="fzw-cell-title">{t('survey.height')}</td>
              <td />
              <td />
              <td />
            </tr>
            <tr>
              <td className="fzw-cell-title">{t('survey.diagonals')}</td>
              <td />
              <td />
              <td className="fzw-survey-off" />
            </tr>
            <tr>
              <td className="fzw-cell-title">{t('survey.sill')}</td>
              <td />
              <td className="fzw-survey-off" />
              <td className="fzw-survey-off" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="fzw-survey-checks">
        <span>
          <Box label={t('survey.plumb')} w={w} /> {t('survey.plumb')}
        </span>
        <span>
          <Box label={t('survey.level')} w={w} /> {t('survey.level')}
        </span>
        <span>
          <Box label={t('survey.old')} w={w} /> {t('survey.old')}
        </span>
        <span>
          <Box label={t('survey.access')} w={w} /> {t('survey.access')}
        </span>
        <WriteField label={t('survey.wall')} className="fzw-grow" />
      </div>
      <div className="fzw-lines" style={{ marginTop: '1mm' }}>
        <div />
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Instalación y acta
// ─────────────────────────────────────────────────────────────────────────────

/** Controles de obra, en el orden en que se hacen. La regulación solo si la ventana tiene hojas que abren. */
const INSTALL_CHECKS = ['plumb', 'fix', 'seal', 'operate', 'clean'] as const

/** Hoja de instalación por ventana y acta de recepción para que firme el cliente. */
export function InstallationDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('install.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const units = data.windows.reduce((s, x) => s + x.qty, 0)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="installation" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('install.kicker')} meta={t('common.units', { count: units })} w={w} />
        <div className="fzw-grid-2" style={{ marginBottom: '3mm' }}>
          <WriteField label={t('install.team')} />
          <WriteField label={t('install.date')} />
        </div>
        <table className="fzw-table fzw-check">
          <thead>
            <tr>
              <th>{t('install.window')}</th>
              {INSTALL_CHECKS.map((id) => (
                <th key={id} className="unit">
                  {t(`install.${id}`)}
                </th>
              ))}
              <th>{t('install.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {data.windows.flatMap((window) => {
              const { title } = windowTitle(window, w)
              return Array.from({ length: Math.max(1, Math.round(window.qty)) }, (_, u) => (
                <tr key={`${window.ref}-${u}`} className="fzw-install-row">
                  <td>
                    <span className="fzw-mid">{window.ref}</span>
                    {window.qty > 1 ? <span className="fzw-small fzw-muted">{` ${t('cuts.unitShort', { n: u + 1 })}`}</span> : null}
                    <div className="fzw-cell-sub">
                      {title} · {w.f.size(window.design.width, window.design.height)}
                    </div>
                  </td>
                  {INSTALL_CHECKS.map((id) => (
                    <td key={id} className="unit">
                      <Box large na={id === 'operate' && !windowOperable(window)} label={`${t(`install.${id}`)} ${window.ref}`} w={w} />
                    </td>
                  ))}
                  <td />
                </tr>
              ))
            })}
          </tbody>
        </table>
      </Sheet>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('install.actaKicker')} w={w} />
        <h2 className="fzw-cover-title">{t('install.actaTitle')}</h2>
        <dl className="fzw-saw">
          {data.quote.clientName ? (
            <div>
              <dt>{t('cover.client')}</dt>
              <dd>{data.quote.clientName}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('cover.work')}</dt>
            <dd>{data.quote.title}</dd>
          </div>
          <div>
            <dt>{t('cover.units')}</dt>
            <dd>{w.f.int(units)}</dd>
          </div>
        </dl>
        <p style={{ margin: '4mm 0' }}>{t('install.actaText')}</p>
        <table className="fzw-table fzw-table-dense">
          <thead>
            <tr>
              <th>{t('install.window')}</th>
              <th className="unit">{t('install.ok')}</th>
              <th>{t('install.pending')}</th>
            </tr>
          </thead>
          <tbody>
            {data.windows.map((window) => (
              <tr key={window.ref} className="fzw-install-row">
                <td>
                  <span className="fzw-mid">{window.ref}</span>
                  <span className="fzw-small fzw-muted">{` × ${w.f.int(window.qty)}`}</span>
                  <div className="fzw-cell-sub">{windowTitle(window, w).title}</div>
                </td>
                <td className="unit">
                  <Box large label={`${t('install.ok')} ${window.ref}`} w={w} />
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fzw-ot-side" style={{ marginTop: '5mm' }}>
          <span className="fzw-small fzw-cell-title">{t('install.observations')}</span>
          <div className="fzw-lines">
            <div />
            <div />
            <div />
          </div>
        </div>
        <Signatures labels={[t('install.signInstaller'), t('install.signClient')]} w={w} />
        <div className="fzw-grid-2" style={{ marginTop: '4mm' }}>
          <WriteField label={t('install.clientName')} />
          <WriteField label={t('install.clientId')} />
        </div>
      </Sheet>
    </DocRoot>
  )
}

