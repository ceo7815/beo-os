import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { getDb } from './firebase'

/** מזהה קבוע לספק ביצוע ברירת המחדל */
export const HUB_SUPPLIER_ID = 'supplier_hub_systems'

export const HUB_SUPPLIER_NAME = 'האב מערכות'

const RESET_LS_KEY = 'hub_suppliers_reset_v2_done'

let resetInFlight = false

/**
 * מוחק את כל מסמכי `suppliers` ומייצר מחדש ספק יחיד "האב מערכות" במזהה קבוע.
 * רץ פעם אחת לכל דפדפן (localStorage) כדי לא למחוק בכל רענון.
 */
export async function resetSuppliersToHub(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    if (localStorage.getItem(RESET_LS_KEY) === '1') return
  }
  if (resetInFlight) return
  resetInFlight = true
  try {
    const db = getDb()
    const snap = await getDocs(collection(db, 'suppliers'))
    for (const d of snap.docs) {
      if (d.id === HUB_SUPPLIER_ID) continue
      await deleteDoc(d.ref)
    }
    await setDoc(
      doc(db, 'suppliers', HUB_SUPPLIER_ID),
      {
        name: HUB_SUPPLIER_NAME,
        phone: '',
        email: 'admin@hub.co.il',
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RESET_LS_KEY, '1')
    }
  } finally {
    resetInFlight = false
  }
}
