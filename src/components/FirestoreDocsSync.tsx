import { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/backend'
import { subscribeTable } from '../lib/sbLive'
import { useHubStore } from '../store/useStore'
import type { Doc } from '../types'

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

/** סנכרון טבלת `docs` ל-Zustand */
export function FirestoreDocsSync() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user || !isSupabaseConfigured()) {
      useHubStore.setState({ docs: [] })
      return
    }
    return subscribeTable(
      'docs',
      (rows) => {
        useHubStore.setState({ docs: rows.map(rowToDoc) })
      },
      (err) => {
        console.error('docs', err)
        useHubStore.getState().pushToast('שגיאה בטעינת מסמכים', 'error')
      },
    )
  }, [user])

  return null
}
