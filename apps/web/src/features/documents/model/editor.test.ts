import { describe, expect, it } from 'vitest'
import { getDocPreset, type DocOp, type DocTemplate } from '@dekopen/shared'
import { HISTORY_LIMIT, MERGE_WINDOW_MS, canRedo, canUndo, createEditorState, editorReducer, type EditorAction, type EditorState } from './editor'

const luz = (): DocTemplate => getDocPreset('hogar')
const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state)
const rename = (name: string): DocOp => ({ op: 'rename', name })
const apply = (ops: DocOp[], at = 0, mergeKey?: string): EditorAction => ({ type: 'apply', ops, at, mergeKey })

describe('editor de plantillas · historial por operación', () => {
  it('aplica una operación, la deshace y la rehace (una entrada por operación)', () => {
    const base = luz()
    let state = createEditorState(base)
    expect(canUndo(state)).toBe(false)
    state = run(state, apply([rename('Mi propuesta')]))
    expect(state.template.name).toBe('Mi propuesta')
    expect(state.past).toHaveLength(1)
    expect(state.pendingOps).toEqual([rename('Mi propuesta')])
    state = run(state, { type: 'undo' })
    expect(state.template.name).toBe(base.name)
    expect(canRedo(state)).toBe(true)
    state = run(state, { type: 'redo' })
    expect(state.template.name).toBe('Mi propuesta')
    expect(canRedo(state)).toBe(false)
  })

  it('una edición nueva descarta lo que se podía rehacer', () => {
    let state = createEditorState(luz())
    state = run(state, apply([rename('A')], 0), { type: 'undo' }, apply([rename('B')], 10_000))
    expect(state.template.name).toBe('B')
    expect(canRedo(state)).toBe(false)
  })

  it('junta lo que se escribe seguido en una sola entrada (misma llave dentro de la ventana)', () => {
    let state = createEditorState(luz())
    state = run(state, apply([rename('M')], 1000, 'rename'), apply([rename('Mi')], 1000 + 100, 'rename'), apply([rename('Mi p')], 1000 + 200, 'rename'))
    expect(state.past).toHaveLength(1)
    expect(state.template.name).toBe('Mi p')
    state = run(state, { type: 'undo' })
    expect(state.template.name).toBe(luz().name)
  })

  it('no junta si pasó la ventana, si cambia la llave o si no hay llave', () => {
    let state = createEditorState(luz())
    state = run(state, apply([rename('A')], 1000, 'rename'), apply([rename('B')], 1000 + MERGE_WINDOW_MS + 1, 'rename'))
    expect(state.past).toHaveLength(2)
    state = run(createEditorState(luz()), apply([rename('A')], 0), apply([rename('B')], 10))
    expect(state.past).toHaveLength(2)
  })

  it('el historial tiene tope', () => {
    let state = createEditorState(luz())
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) state = run(state, apply([rename(`N${i}`)], i * 10_000))
    expect(state.past).toHaveLength(HISTORY_LIMIT)
  })

  it('una operación inválida no cambia nada y deja los problemas para mostrarlos', () => {
    const base = luz()
    const items = base.sections.find((s) => s.type === 'items')!
    let state = createEditorState(base)
    state = run(state, apply([{ op: 'removeSection', sectionId: items.id }]))
    expect(state.template).toBe(base)
    expect(state.past).toHaveLength(0)
    expect(state.issues.some((i) => i.severity === 'error')).toBe(true)
    state = run(state, { type: 'clearIssues' })
    expect(state.issues).toHaveLength(0)
  })

  it('una operación que no cambia nada no ensucia el historial', () => {
    const base = luz()
    const state = run(createEditorState(base), apply([rename(base.name)]))
    expect(state.template).toBe(base)
    expect(state.past).toHaveLength(0)
  })

  it('una sección agregada o duplicada queda elegida; si se quita, la selección se limpia', () => {
    const base = luz()
    const warranty = base.sections.find((s) => s.type === 'warranty')
    let state = createEditorState(base)
    state = run(state, apply([{ op: 'addSection', section: { type: 'custom_text' } }]))
    const added = state.template.sections.find((s) => !base.sections.some((o) => o.id === s.id))
    expect(added?.type).toBe('custom_text')
    expect(state.selectedId).toBe(added!.id)
    state = run(state, apply([{ op: 'removeSection', sectionId: added!.id }], 5000))
    expect(state.selectedId).toBeNull()
    if (warranty) {
      state = run(state, { type: 'select', id: warranty.id }, apply([{ op: 'toggleSection', sectionId: warranty.id, enabled: false }], 9000))
      expect(state.selectedId).toBe(warranty.id)
      expect(state.template.sections.find((s) => s.id === warranty.id)?.enabled).toBe(false)
    }
  })

  it('un reemplazo (propuesta de la IA) se puede deshacer pero no se puede expresar como operaciones', () => {
    const base = luz()
    const proposal: DocTemplate = { ...getDocPreset('memoria'), id: base.id, name: base.name }
    let state = run(createEditorState(base), { type: 'replace', template: proposal, reason: 'ai', at: 1 })
    expect(state.template).toBe(proposal)
    expect(state.pendingOps).toBeNull()
    expect(state.past[0].cause).toEqual({ kind: 'replace', reason: 'ai' })
    state = run(state, { type: 'undo' })
    expect(state.template).toBe(base)
    // Reemplazar por lo mismo no hace nada.
    expect(run(createEditorState(base), { type: 'replace', template: structuredClone(base), reason: 'reset', at: 2 }).past).toHaveLength(0)
  })

  it('«rebase» rehace tus operaciones sobre la versión de otra persona', () => {
    const base = luz()
    const theirs: DocTemplate = { ...base, name: 'Cambio de otra persona', description: 'x' }
    const mine: DocOp[] = [{ op: 'setColor', role: 'accent', value: '#B4531F' }]
    const state = run(createEditorState(base), apply(mine), { type: 'rebase', server: theirs, ops: mine })
    expect(state.template.name).toBe('Cambio de otra persona')
    expect(state.template.theme.palette.accent.toUpperCase()).toBe('#B4531F')
    expect(state.rebased).toBe(true)
    expect(state.pendingOps).toEqual(mine)
    expect(state.past).toHaveLength(0)
    expect(run(state, { type: 'dismissRebased' }).rebased).toBe(false)
  })

  it('«load» parte limpio y conserva la selección sólo si la sección sigue existiendo', () => {
    const base = luz()
    const id = base.sections[2].id
    let state = run(createEditorState(base), { type: 'select', id })
    expect(run(state, { type: 'load', template: base }).selectedId).toBe(id)
    state = run(state, { type: 'load', template: { ...base, sections: base.sections.filter((s) => s.id !== id) } })
    expect(state.selectedId).toBeNull()
    expect(state.past).toHaveLength(0)
  })

  it('«saveStarted» vacía las operaciones pendientes', () => {
    const state = run(createEditorState(luz()), apply([rename('A')]), { type: 'saveStarted' })
    expect(state.pendingOps).toEqual([])
  })

  it('un texto de la empresa entra al historial sin tocar la plantilla', () => {
    const start = createEditorState(getDocPreset('hogar'))
    const typed = editorReducer(start, { type: 'text', field: 'warranty', before: 'A', after: 'B', at: 1 })
    expect(typed.template).toBe(start.template)
    expect(canUndo(typed)).toBe(true)
    const undone = editorReducer(typed, { type: 'undo' })
    expect(undone.template).toBe(start.template)
    expect(undone.future[0].cause).toEqual({ kind: 'text', field: 'warranty', before: 'A', after: 'B' })
    expect(editorReducer(undone, { type: 'redo' }).past).toHaveLength(1)
  })
})
