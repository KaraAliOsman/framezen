import type { AttachmentKind, TurnAttachment } from '@dekopen/shared'

/** Por qué un archivo no se pudo leer. Cada uno tiene su frase, con la salida posible. */
export type ReadProblemCode = 'too_big' | 'too_many' | 'legacy_office' | 'cad' | 'media' | 'archive' | 'locked' | 'photo_format' | 'empty' | 'unreadable'

export class ReadProblem extends Error {
  constructor(readonly code: ReadProblemCode) {
    super(code)
    this.name = 'ReadProblem'
  }
}

export interface ReadResult {
  attachment: TurnAttachment
  /** Imagen para la miniatura. */
  preview?: string
}

/** Un archivo en el compositor, antes de enviarse. */
export interface AttachmentDraft {
  id: string
  name: string
  status: 'reading' | 'ready' | 'error'
  kind?: AttachmentKind
  problem?: ReadProblemCode
  preview?: string
  attachment?: TurnAttachment
}

/** Lo que queda en la conversación después de enviar. */
export interface AttachmentView {
  name: string
  kind: AttachmentKind
  preview?: string
}
