import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDb } from './firebase'

/** מזהה קבוע לספק ביצוע ברירת המחדל */
export const HUB_SUPPLIER_ID = 'supplier_hub_systems'

export const HUB_SUPPLIER_NAME = 'האב מערכות'

let ensureInFlight = false

/**
 * מבטיח שמסמך ברירת המחדל "האב מערכות" קיים — ללא מחיקת ספקים אחרים.
 */
export async function ensureHubSupplierExists(): Promise<void> {
  if (ensureInFlight) return
  ensureInFlight = true
  try {
    const db = getDb()
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
  } finally {
    ensureInFlight = false
  }
}
