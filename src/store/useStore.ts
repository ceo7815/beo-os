import { create } from 'zustand'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { uuidOrNull } from '../lib/sbLive'
import type { Doc, HubStore, ToastType } from '../types'

function rowToDoc(row: Record<string, unknown>): Doc {
  return {
    id: String(row.id),
    projectId: row.project_id ? String(row.project_id) : '',
    title: String(row.title ?? ''),
    type: (row.type as Doc['type']) || 'note',
    content: String(row.content ?? ''),
    authorId: row.author_id ? String(row.author_id) : '',
    updatedAt: row.updated_at
      ? new Date(String(row.updated_at)).toISOString()
      : new Date().toISOString(),
  }
}

export const useHubStore = create<HubStore>((set, get) => ({
  docs: [],

  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  selectedProjectId: null,
  selectedClientId: null,

  toasts: [],

  pushToast: (message: string, type: ToastType) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    window.setTimeout(() => {
      get().dismissToast(id)
    }, 4200)
  },

  dismissToast: (id: string) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  addDoc: (data) => {
    void (async () => {
      if (!isSupabaseConfigured()) {
        get().pushToast('שמירת מסמכים דורשת חיבור ל-Supabase', 'error')
        return
      }
      try {
        const sb = requireSupabase()
        const { data: created, error } = await sb
          .from('docs')
          .insert({
            project_id: uuidOrNull(data.projectId),
            title: data.title,
            type: data.type,
            content: data.content ?? '',
            author_id: uuidOrNull(data.authorId),
          })
          .select('*')
          .single()
        if (error) throw error
        const doc = rowToDoc(created as Record<string, unknown>)
        set((s) => (s.docs.some((d) => d.id === doc.id) ? s : { docs: [...s.docs, doc] }))
        get().pushToast('המסמך נוסף', 'success')
      } catch (e) {
        console.error('addDoc', e)
        get().pushToast('שגיאה בשמירת המסמך', 'error')
      }
    })()
  },

  updateDoc: (id, data) => {
    void (async () => {
      try {
        const sb = requireSupabase()
        const patch: Record<string, unknown> = {}
        if (data.title !== undefined) patch.title = data.title
        if (data.type !== undefined) patch.type = data.type
        if (data.content !== undefined) patch.content = data.content
        if (data.projectId !== undefined) patch.project_id = uuidOrNull(data.projectId)
        if (data.authorId !== undefined) patch.author_id = uuidOrNull(data.authorId)
        if (Object.keys(patch).length === 0) return
        const { error } = await sb.from('docs').update(patch).eq('id', id)
        if (error) throw error
        set((s) => ({
          docs: s.docs.map((d) => (d.id === id ? { ...d, ...data, updatedAt: new Date().toISOString() } : d)),
        }))
        get().pushToast('המסמך נשמר', 'success')
      } catch (e) {
        console.error('updateDoc', e)
        get().pushToast('שגיאה בשמירת המסמך', 'error')
      }
    })()
  },

  patchDocContent: (id, content) => {
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id
          ? { ...d, content, updatedAt: new Date().toISOString() }
          : d,
      ),
    }))
    void (async () => {
      try {
        const sb = requireSupabase()
        const { error } = await sb.from('docs').update({ content }).eq('id', id)
        if (error) throw error
      } catch (e) {
        console.error('patchDocContent', e)
      }
    })()
  },

  deleteDoc: (id) => {
    void (async () => {
      try {
        const sb = requireSupabase()
        const { error } = await sb.from('docs').delete().eq('id', id)
        if (error) throw error
        set((s) => ({ docs: s.docs.filter((d) => d.id !== id) }))
        get().pushToast('המסמך נמחק', 'success')
      } catch (e) {
        console.error('deleteDoc', e)
        get().pushToast('שגיאה במחיקת המסמך', 'error')
      }
    })()
  },

  setSelectedProject: (id) => set({ selectedProjectId: id }),
  setSelectedClient: (id) => set({ selectedClientId: id }),
}))

export const useStore = useHubStore
