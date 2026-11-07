/**
 * Borradores de subida (en memoria del proceso): la foto ya limpia queda unos minutos para que la
 * persona ajuste giro, recorte, escala o costura y vea el resultado sin volver a subirla. Nada de
 * esto ocupa la cuota de imágenes; solo se guarda en `assets` al confirmar.
 *
 * Topes: 20 minutos de vida, 3 borradores por persona y 40 en total (se descartan los más viejos).
 * Supone una sola instancia, como los demás límites en memoria; si el borrador ya no está, la web
 * vuelve a enviar la foto (la conserva hasta guardar).
 */
import { randomBytes } from 'node:crypto'
import type { TextureAiSuggestion, TextureWarningCode } from '@dekopen/shared'
import type { SanitizedSource } from './pipeline'

export interface TextureDraft {
  id: string
  orgId: string
  userId: string
  source: SanitizedSource
  /** Nombre que puso la persona al subir (o el del archivo). */
  name?: string
  /** Sugerencia de la IA (se pide una sola vez por borrador: ajustar no vuelve a cobrar). */
  ai?: TextureAiSuggestion
  aiWarning?: TextureWarningCode
  createdAt: number
  expiresAt: number
}

export interface DraftStoreOptions {
  ttlMs?: number
  perUser?: number
  total?: number
  now?: () => number
}

export class TextureDraftStore {
  private readonly drafts = new Map<string, TextureDraft>()
  private readonly ttlMs: number
  private readonly perUser: number
  private readonly total: number
  private readonly now: () => number

  constructor(options: DraftStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 20 * 60_000
    this.perUser = options.perUser ?? 3
    this.total = options.total ?? 40
    this.now = options.now ?? Date.now
  }

  create(input: Omit<TextureDraft, 'id' | 'createdAt' | 'expiresAt'>): TextureDraft {
    this.sweep()
    const mine = [...this.drafts.values()].filter((d) => d.orgId === input.orgId && d.userId === input.userId).sort((a, b) => a.createdAt - b.createdAt)
    while (mine.length >= this.perUser) this.drafts.delete(mine.shift()!.id)
    while (this.drafts.size >= this.total) {
      const oldest = [...this.drafts.values()].sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!oldest) break
      this.drafts.delete(oldest.id)
    }
    const t = this.now()
    const draft: TextureDraft = { ...input, id: `txd_${randomBytes(12).toString('base64url')}`, createdAt: t, expiresAt: t + this.ttlMs }
    this.drafts.set(draft.id, draft)
    return draft
  }

  /** Solo la misma persona de la misma organización ve su borrador. Ajustar renueva el plazo. */
  get(id: string, orgId: string, userId: string): TextureDraft | null {
    const draft = this.drafts.get(id)
    if (!draft) return null
    if (draft.expiresAt <= this.now()) {
      this.drafts.delete(id)
      return null
    }
    if (draft.orgId !== orgId || draft.userId !== userId) return null
    draft.expiresAt = this.now() + this.ttlMs
    return draft
  }

  delete(id: string, orgId: string, userId: string): boolean {
    const draft = this.drafts.get(id)
    if (!draft || draft.orgId !== orgId || draft.userId !== userId) return false
    return this.drafts.delete(id)
  }

  get size(): number {
    return this.drafts.size
  }

  private sweep(): void {
    const t = this.now()
    for (const [id, draft] of this.drafts) if (draft.expiresAt <= t) this.drafts.delete(id)
  }
}
