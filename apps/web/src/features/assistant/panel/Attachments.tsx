/**
 * Archivos en el asistente: las fichas del compositor (con su estado de lectura) y lo que queda a
 * la vista en el mensaje enviado. Sin tamaños ni topes: solo el nombre y, si algo salió mal, qué
 * pasó y cómo seguir.
 */
import { File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, LoaderCircle, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { ATTACHMENT_LIMITS, type AttachmentKind } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import type { AttachmentDraft, AttachmentView } from '../attachments/types'
import es from '../i18n/es'

const KIND_ICONS: Record<AttachmentKind, LucideIcon> = {
  image: ImageIcon,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  text: FileIcon,
}

function Thumb({ kind, preview, className }: { kind?: AttachmentKind; preview?: string; className?: string }) {
  const Icon = kind ? KIND_ICONS[kind] : FileIcon
  if (preview) return <img src={preview} alt="" className={cn('shrink-0 rounded-xs object-cover', className)} />
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-xs bg-hover text-fg-muted', className)}>
      <Icon strokeWidth={1.75} className="size-4" />
    </span>
  )
}

function draftDetail(draft: AttachmentDraft, t: ReturnType<typeof useT<typeof es>>): string {
  if (draft.status === 'reading') return t('attachments.reading')
  if (draft.status === 'error') return t(`attachments.problem.${draft.problem ?? 'unreadable'}`, { count: ATTACHMENT_LIMITS.files })
  const file = draft.attachment
  if (file?.truncated) return file.pages && file.readPages ? t('attachments.partialPages', { read: file.readPages, total: file.pages }) : t('attachments.partial')
  return file?.pages ? t('attachments.pages', { count: file.pages }) : ''
}

export function AttachmentDrafts({ drafts, onRemove }: { drafts: readonly AttachmentDraft[]; onRemove(id: string): void }) {
  const t = useT(es)
  if (!drafts.length) return null
  return (
    <ul className="flex max-h-[148px] flex-col gap-1 overflow-y-auto px-2 pt-2" aria-label={t('attachments.list')}>
      {drafts.map((draft) => {
        const detail = draftDetail(draft, t)
        const failed = draft.status === 'error'
        return (
          <li key={draft.id} className="flex min-w-0 items-center gap-2 rounded-sm bg-hover/60 py-1 pr-1 pl-1.5">
            {draft.status === 'reading' ? (
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center text-fg-muted">
                <LoaderCircle strokeWidth={1.75} className="size-4 animate-spin" />
              </span>
            ) : failed ? (
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center text-warning">
                <TriangleAlert strokeWidth={1.75} className="size-4" />
              </span>
            ) : (
              <Thumb kind={draft.kind} preview={draft.preview} className="size-8" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-table text-fg">{draft.name}</span>
              {detail ? <span className={cn('block text-meta', failed ? 'text-warning' : 'text-fg-muted')}>{detail}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => onRemove(draft.id)}
              aria-label={t('attachments.remove', { name: draft.name })}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg touch:size-10"
            >
              <X aria-hidden strokeWidth={1.75} className="size-3.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Archivos dentro de un mensaje enviado. */
export function AttachmentList({ files }: { files: readonly AttachmentView[] }) {
  return (
    <ul className="flex max-w-full flex-wrap justify-end gap-1">
      {files.map((file, i) =>
        file.preview ? (
          <li key={i}>
            <img src={file.preview} alt={file.name} title={file.name} className="max-h-40 max-w-[220px] rounded-panel object-cover" />
          </li>
        ) : (
          <li key={i} className="flex max-w-full min-w-0 items-center gap-2 rounded-panel bg-hover px-2 py-1.5">
            <Thumb kind={file.kind} className="size-6 bg-transparent" />
            <span className="min-w-0 truncate text-table text-fg">{file.name}</span>
          </li>
        ),
      )}
    </ul>
  )
}
