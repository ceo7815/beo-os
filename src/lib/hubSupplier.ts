import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { BRAND } from './brand'
import { canUseLegacyFirestore, db } from './firebase'

/** מזהה קבוע לספק ביצוע ברירת המחדל */
export const HUB_SUPPLIER_ID = BRAND.defaultSupplierId

export const HUB_SUPPLIER_NAME = BRAND.defaultSupplierName

let ensureInFlight = false

/**
 * מבטיח שמסמך ברירת המחדל של החברה קיים — ללא מחיקת ספקים אחרים.
 */
export async function ensureHubSupplierExists(): Promise<void> {
  if (!canUseLegacyFirestore()) return
  if (ensureInFlight) return
  ensureInFlight = true
  try {
    await setDoc(
      doc(db, 'suppliers', HUB_SUPPLIER_ID),
      {
        name: HUB_SUPPLIER_NAME,
        phone: '',
        email: '',
        createdAt: serverTimestamp(),
      },
      { merge: true },
    )
  } finally {
    ensureInFlight = false
  }
}
