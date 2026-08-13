import { useEffect, useRef } from 'react'
import type { DocumentData, QuerySnapshot } from 'firebase/firestore'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db, canUseLegacyFirestore } from '../lib/firebase'
import { HUB_SUPPLIER_ID } from '../lib/hubSupplier'
import {
  notifyHubBackground,
  clearHubTabUnread,
  requestHubNotificationPermissionLater,
  truncateNotifyText,
} from '../lib/hubNotifications'

function actorFromDoc(data: DocumentData): { id: string; name: string } | null {
  const rawId =
    data.lastActorUserId ??
    data.createdByUserId ??
    data.lastEventByUserId ??
    data.createdBy
  const rawName =
    data.lastActorUserName ??
    data.createdByUserName ??
    data.lastEventByUserName ??
    ''
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
    return null
  }
  const id = String(rawId)
  const name =
    typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : 'משתמש'
  return { id, name }
}

/**
 * מונע בועות שווא אחרי רענון: אחרי listen, ה־snapshot הראשון מהשרת מכיל docChanges
 * שמסמנים מסמכים כ־"added" ביחס למטמון ריק — לא שינוי אמיתי בזמן אמת.
 */
function skipHubRealtimeHydrationSnap(snap: QuerySnapshot, serverBaselineDone: boolean): boolean {
  if (snap.metadata.fromCache) return true
  return !serverBaselineDone
}

/** מאזינים ל־Firestore ושולחים התראות רקע + מונה בטאב */
export function HubRealtimeNotifications() {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        clearHubTabUnread()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    requestHubNotificationPermissionLater()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    let serverBaselineDone = false
    const unsub = onSnapshot(
      collection(db, 'leads'),
      (snap) => {
        if (skipHubRealtimeHydrationSnap(snap, serverBaselineDone)) {
          if (!snap.metadata.fromCache) serverBaselineDone = true
          return
        }
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue
          const data = ch.doc.data()
          const actor = actorFromDoc(data)
          if (!actor || actor.id === uid) continue
          const name = String(data.name ?? '').trim() || 'ליד'
          if (ch.type === 'added') {
            notifyHubBackground({
              title: `${actor.name} · ליד חדש`,
              body: name,
              tag: `lead-${ch.doc.id}-add`,
            })
          } else {
            notifyHubBackground({
              title: `${actor.name} · עודכן ליד`,
              body: name,
              tag: `lead-${ch.doc.id}-mod`,
            })
          }
        }
      },
      (err) => console.error('HubRealtimeNotifications leads', err),
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    let serverBaselineDone = false
    const unsub = onSnapshot(
      collection(db, 'clients'),
      (snap) => {
        if (skipHubRealtimeHydrationSnap(snap, serverBaselineDone)) {
          if (!snap.metadata.fromCache) serverBaselineDone = true
          return
        }
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue
          const data = ch.doc.data()
          const actor = actorFromDoc(data)
          if (!actor || actor.id === uid) continue
          const name = String(data.name ?? '').trim() || 'לקוח'
          if (ch.type === 'added') {
            notifyHubBackground({
              title: `${actor.name} · לקוח חדש`,
              body: name,
              tag: `client-${ch.doc.id}-add`,
            })
          } else {
            notifyHubBackground({
              title: `${actor.name} · עודכן לקוח`,
              body: name,
              tag: `client-${ch.doc.id}-mod`,
            })
          }
        }
      },
      (err) => console.error('HubRealtimeNotifications clients', err),
    )
    return () => unsub()
  }, [uid])

  const prevTaskSig = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    let serverBaselineDone = false
    const unsub = onSnapshot(
      collection(db, 'tasks'),
      (snap) => {
        if (skipHubRealtimeHydrationSnap(snap, serverBaselineDone)) {
          if (!snap.metadata.fromCache) {
            prevTaskSig.current.clear()
            for (const d of snap.docs) {
              const x = d.data()
              prevTaskSig.current.set(
                d.id,
                `${String(x.assigneeId ?? '')}|${String(x.createdBy ?? '')}`,
              )
            }
            serverBaselineDone = true
          }
          return
        }
        for (const ch of snap.docChanges()) {
          const id = ch.doc.id
          const data = ch.doc.data()
          const assigneeId = String(data.assigneeId ?? '')
          const createdBy = String(data.createdBy ?? '')
          const lastEv = String(data.lastEventByUserId ?? '')
          const actorName =
            String(data.lastEventByUserName ?? '').trim() || 'משתמש'
          const titleStr = String(data.title ?? '').trim() || 'משימה'
          const desc = truncateNotifyText(String(data.description ?? ''), 160)

          if (ch.type === 'removed') {
            prevTaskSig.current.delete(id)
            continue
          }

          const prevEntry = prevTaskSig.current.get(id)
          const prevAssignee = prevEntry?.split('|')[0] ?? ''

          if (ch.type === 'added') {
            prevTaskSig.current.set(id, `${assigneeId}|${createdBy}`)
            if (assigneeId === uid && createdBy !== uid) {
              notifyHubBackground({
                title: `${actorName} · משימה חדשה אליך`,
                body: desc ? `${titleStr}\n${desc}` : titleStr,
                tag: `task-${id}-new`,
              })
            }
            continue
          }

          prevTaskSig.current.set(id, `${assigneeId}|${createdBy}`)

          const imAssignee = assigneeId === uid
          if (!imAssignee) continue
          if (!lastEv || lastEv === uid) continue

          const wasAssignee = prevAssignee === uid
          const reassignedToMe = !wasAssignee && assigneeId === uid

          if (reassignedToMe) {
            notifyHubBackground({
              title: `${actorName} · הוקצתה לך משימה`,
              body: desc ? `${titleStr}\n${desc}` : titleStr,
              tag: `task-${id}-reassign`,
            })
          } else if (wasAssignee) {
            notifyHubBackground({
              title: `${actorName} · עודכנה משימה שלך`,
              body: titleStr,
              tag: `task-${id}-edit`,
            })
          }
        }
      },
      (err) => console.error('HubRealtimeNotifications tasks', err),
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    let serverBaselineDone = false
    const unsub = onSnapshot(
      collection(db, 'collectionTracking'),
      (snap) => {
        if (skipHubRealtimeHydrationSnap(snap, serverBaselineDone)) {
          if (!snap.metadata.fromCache) serverBaselineDone = true
          return
        }
        for (const ch of snap.docChanges()) {
          if (ch.type !== 'added') continue
          const data = ch.doc.data()
          const actor = actorFromDoc(data)
          if (!actor || actor.id === uid) continue
          const cid = String(data.clientId ?? ch.doc.id)
          notifyHubBackground({
            title: `${actor.name} · לקוח נוסף למעקב גבייה`,
            body: `לקוח: ${cid}`,
            tag: `ctrack-${ch.doc.id}`,
          })
        }
      },
      (err) => console.error('HubRealtimeNotifications collectionTracking', err),
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    let serverBaselineDone = false
    const unsub = onSnapshot(
      collection(db, 'campaigns'),
      (snap) => {
        if (skipHubRealtimeHydrationSnap(snap, serverBaselineDone)) {
          if (!snap.metadata.fromCache) serverBaselineDone = true
          return
        }
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue
          const data = ch.doc.data()
          const actor = actorFromDoc(data)
          if (!actor || actor.id === uid) continue
          const name = String(data.name ?? '').trim() || 'קמפיין'
          if (ch.type === 'added') {
            notifyHubBackground({
              title: `${actor.name} · קמפיין חדש`,
              body: name,
              tag: `camp-${ch.doc.id}-add`,
            })
          } else {
            notifyHubBackground({
              title: `${actor.name} · עודכן קמפיין`,
              body: name,
              tag: `camp-${ch.doc.id}-mod`,
            })
          }
        }
      },
      (err) => console.error('HubRealtimeNotifications campaigns', err),
    )
    return () => unsub()
  }, [uid])

  useEffect(() => {
    if (!uid) return
    if (!canUseLegacyFirestore()) return
    let serverBaselineDone = false
    const unsub = onSnapshot(
      collection(db, 'suppliers'),
      (snap) => {
        if (skipHubRealtimeHydrationSnap(snap, serverBaselineDone)) {
          if (!snap.metadata.fromCache) serverBaselineDone = true
          return
        }
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') continue
          const data = ch.doc.data()
          const actor = actorFromDoc(data)
          if (!actor || actor.id === uid) continue
          if (ch.doc.id === HUB_SUPPLIER_ID) continue
          const name = String(data.name ?? '').trim() || 'ספק'
          if (ch.type === 'added') {
            notifyHubBackground({
              title: `${actor.name} · ספק חדש`,
              body: name,
              tag: `sup-${ch.doc.id}-add`,
            })
          } else {
            notifyHubBackground({
              title: `${actor.name} · עודכן ספק`,
              body: name,
              tag: `sup-${ch.doc.id}-mod`,
            })
          }
        }
      },
      (err) => console.error('HubRealtimeNotifications suppliers', err),
    )
    return () => unsub()
  }, [uid])

  return null
}
