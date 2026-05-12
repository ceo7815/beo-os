import { onAuthStateChanged } from 'firebase/auth'
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
  type QuerySnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { auth, db } from '../lib/firebase'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { PasswordVaultEntry, PasswordVaultWrite } from '../types'

const COLL = 'passwords_vault'

/** מזהה המשתמש ב-Firebase Auth הוא תמיד UID (מחרוזת ייחודית), לא כתובת האימייל להתחברות */

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

/** מאחד מספר תוצאות שאילתה — אותו מסמך יכול להופיע ביותר משאילתה אחת */
function mergeVaultSnaps(...snaps: (QuerySnapshot | null)[]): PasswordVaultEntry[] {
  const merged = new Map<string, Record<string, unknown>>()
  for (const snap of snaps) {
    if (!snap) continue
    for (const d of snap.docs) merged.set(d.id, d.data() as Record<string, unknown>)
  }
  const list = [...merged.entries()].map(([id, data]) => docToEntry(id, data))
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return list
}

export type UsePasswordVaultOpts = {
  /** uid מההקשר (חייב להתאים ל-auth.currentUser.uid כשמחוברים) */
  uid: string | undefined
  usersReady: boolean
  isVaultAdmin: boolean
}

export function usePasswordVault({ uid, usersReady, isVaultAdmin }: UsePasswordVaultOpts) {
  const [entries, setEntries] = useState<PasswordVaultEntry[]>([])
  const [loading, setLoading] = useState(true)
  const snapsRef = useRef<{
    uid: QuerySnapshot | null
    email: QuerySnapshot | null
    /** רשומות ששדה username (אימייל התחברות) תואם למשתמש — גם בלי visibleUserIds */
    usernameEmail: QuerySnapshot | null
  }>({
    uid: null,
    email: null,
    usernameEmail: null,
  })

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

    let cancelled = false
    let fsUnsubs: Array<() => void> = []
    let errReported = false

    const reportErr = (err: unknown) => {
      if (errReported) return
      errReported = true
      toastFsError('שגיאה בטעינת כספת הסיסמאות', err, 'passwordVault')
      setLoading(false)
    }

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      fsUnsubs.forEach((u) => u())
      fsUnsubs = []
      snapsRef.current = { uid: null, email: null, usernameEmail: null }
      errReported = false

      if (cancelled) return

      if (!firebaseUser?.uid || firebaseUser.uid !== uid) {
        setEntries([])
        setLoading(false)
        return
      }

      setLoading(true)

      if (isVaultAdmin) {
        const unsub = onSnapshot(
          query(collection(db, COLL)),
          (snap) => {
            if (cancelled) return
            const list = snap.docs.map((d) =>
              docToEntry(d.id, d.data() as Record<string, unknown>),
            )
            list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            setEntries(list)
            setLoading(false)
          },
          reportErr,
        )
        fsUnsubs.push(unsub)
        return
      }

      const vaultUid = firebaseUser.uid
      const vaultEmail = firebaseUser.email?.trim() ?? ''
      const useEmailQuery = vaultEmail.length > 0

      const emit = () => {
        if (cancelled) return
        const { uid: uSnap, email: eSnap, usernameEmail: ueSnap } = snapsRef.current
        if (!uSnap && !(useEmailQuery && eSnap) && !(useEmailQuery && ueSnap)) return
        setEntries(
          mergeVaultSnaps(
            uSnap,
            useEmailQuery ? eSnap : null,
            useEmailQuery ? ueSnap : null,
          ),
        )
        setLoading(false)
      }

      const qUid = query(collection(db, COLL), where('visibleUserIds', 'array-contains', vaultUid))
      fsUnsubs.push(
        onSnapshot(
          qUid,
          (snap) => {
            snapsRef.current.uid = snap
            emit()
          },
          reportErr,
        ),
      )

      if (useEmailQuery) {
        const qEmail = query(collection(db, COLL), where('visibleUserIds', 'array-contains', vaultEmail))
        fsUnsubs.push(
          onSnapshot(
            qEmail,
            (snap) => {
              snapsRef.current.email = snap
              emit()
            },
            reportErr,
          ),
        )
        const qUsernameEmail = query(collection(db, COLL), where('username', '==', vaultEmail))
        fsUnsubs.push(
          onSnapshot(
            qUsernameEmail,
            (snap) => {
              snapsRef.current.usernameEmail = snap
              emit()
            },
            reportErr,
          ),
        )
      }
    })

    return () => {
      cancelled = true
      authUnsub()
      fsUnsubs.forEach((u) => u())
    }
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
