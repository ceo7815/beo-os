/**
 * ברירת מחדל: **ללא** seed אוטומטי — מקור האמת הוא רק מה שיש ב-Firestore (הנתונים האמיתיים שלכם).
 *
 * להפעלת מילוי דמו (פיתוח בלבד): ב-.env.local
 *   VITE_ENABLE_FIRESTORE_SEED=true
 */
export function isFirestoreAutoSeedEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_FIRESTORE_SEED === 'true'
}
