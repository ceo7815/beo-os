import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { PasswordVaultEntry, PasswordVaultWrite } from '../types'

const COLL = 'passwords_vault'

function tsToIso(t: Timestamp | { toDate?: () => Date } | null | undefined): string {
  if (!t) return ''
  try {
    if (typeof (t as Timestamp).toDate === 'function') {
      return (t as Timestamp).toDate().toISOString()
    }
  } catch {
    /* ignore */
  }
  return ''
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function docToEntry(id: string, data: Record<string, unknown>): PasswordVaultEntry {
  const updatedAtRaw = data.updatedAt as Timestamp | undefined
  const loginRaw = data.loginType
  const loginType: PasswordVaultEntry['loginType'] = loginRaw === 'google' ? 'google' : 'password'
  return {
    id,
    title: String(data.title ?? ''),
    category: String(data.category ?? ''),
    username: String(data.username ?? ''),
    password: String(data.password ?? ''),
    loginType,
    url: String(data.url ?? ''),
    notes: String(data.notes ?? ''),
    visibleUserIds: parseStringArray(data.visibleUserIds),
    clientId: String(data.clientId ?? ''),
    updatedBy: String(data.updatedBy ?? ''),
    updatedAt: tsToIso(updatedAtRaw),
  }
}

export type UsePasswordVaultOpts = {
  uid: string | undefined
  /** לאחר סנכרון רשימת המשתמשים — נדרש כדי לדעת אם המשתמש אדמין */
  usersReady: boolean
  isVaultAdmin: boolean
}

export function usePasswordVault({ uid, usersReady, isVaultAdmin }: UsePasswordVaultOpts) {
  const [entries, setEntries] = useState<PasswordVaultEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setEntries([])
      setLoading(false)
      return
    }
    if (!usersReady) {
      setLoading(true)
      return
    }

    setLoading(true)
    const q = isVaultAdmin
      ? query(collection(db, COLL))
      : query(collection(db, COLL), where('visibleUserIds', 'array-contains', uid))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) =>
          docToEntry(d.id, d.data() as Record<string, unknown>),
        )
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        setEntries(list)
        setLoading(false)
      },
      (err) => {
        toastFsError('שגיאה בטעינת כספת הסיסמאות', err, 'passwordVault')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [uid, usersReady, isVaultAdmin])

  const addEntry = useCallback(
    async (payload: PasswordVaultWrite) => {
      if (!uid) return
      try {
        let visibleUserIds = [...new Set(payload.visibleUserIds.filter(Boolean))]
        if (!isVaultAdmin && !visibleUserIds.includes(uid)) {
          visibleUserIds = [...visibleUserIds, uid]
        }
        await addDoc(collection(db, COLL), {
          title: payload.title.trim(),
          category: payload.category.trim(),
          username: payload.username.trim(),
          password: payload.loginType === 'google' ? '' : payload.password,
          loginType: payload.loginType,
          url: payload.url.trim(),
          notes: payload.notes.trim(),
          visibleUserIds,
          clientId: payload.clientId.trim(),
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        })
        toastFsSuccess('הפריט נשמר בכספת')
      } catch (e) {
        toastFsError('לא ניתן לשמור', e, 'vault add')
      }
    },
    [uid, isVaultAdmin],
  )

  const updateEntry = useCallback(
    async (id: string, payload: PasswordVaultWrite) => {
      if (!uid) return
      try {
        const visibleUserIds = [...new Set(payload.visibleUserIds.filter(Boolean))]
        await updateDoc(doc(db, COLL, id), {
          title: payload.title.trim(),
          category: payload.category.trim(),
          username: payload.username.trim(),
          password: payload.loginType === 'google' ? '' : payload.password,
          loginType: payload.loginType,
          url: payload.url.trim(),
          notes: payload.notes.trim(),
          visibleUserIds,
          clientId: payload.clientId.trim(),
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        })
        toastFsSuccess('הפריט עודכן')
      } catch (e) {
        toastFsError('לא ניתן לעדכן', e, 'vault update')
      }
    },
    [uid],
  )

  const removeEntry = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, COLL, id))
      toastFsSuccess('הפריט נמחק')
    } catch (e) {
      toastFsError('לא ניתן למחוק', e, 'vault delete')
    }
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, PasswordVaultEntry>()
    for (const e of entries) m.set(e.id, e)
    return m
  }, [entries])

  return {
    entries,
    loading,
    addEntry,
    updateEntry,
    removeEntry,
    byId,
  }
}
