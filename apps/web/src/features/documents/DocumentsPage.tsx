/**
 * /documentos — galería de plantillas; con `?plantilla=<id>` abre el editor de esa plantilla (propia
 * o estilo DEKOPEN en modo lectura). Las fuentes de los documentos se cargan una vez aquí.
 */
import { useSearchParams } from 'react-router'
import { useT } from '../../lib/i18n'
import { usePageTitle } from '../../lib/usePageTitle'
import { documentTemplateFontCss } from './fonts'
import { TemplateEditor } from './editor/TemplateEditor'
import { TemplateGallery } from './gallery/TemplateGallery'
import es from './i18n/es'

const TEMPLATE_PARAM = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/

export default function DocumentsPage() {
  const t = useT(es)
  usePageTitle(t('page.title'))
  const [params] = useSearchParams()
  const editing = params.get('plantilla')
  return (
    <>
      <style>{documentTemplateFontCss()}</style>
      {editing && TEMPLATE_PARAM.test(editing) ? <TemplateEditor id={editing} /> : <TemplateGallery />}
    </>
  )
}
