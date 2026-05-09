import { FirebaseError } from 'firebase/app'

/** הסבר קצר בעברית לפי קוד — ליד המקור מ-Firebase */
const FIRESTORE_HINT_HE: Record<string, string> = {
  'already-exists':
    'כפילות זמנית בלקוח Firestore (לרוב Web + מטמון). רעננו את הדף — הזריעה משתמשת ב־batch כדי למנוע זאת.',
  'permission-denied':
    'אין הרשאה: התחברו לחשבון ובדקו את חוקי האבטחה של Firestore לפרויקט.',
  'failed-precondition':
    'תנאי לא מתקיים (למשל חסר אינדקס — בדקו את הקונסול של Firebase).',
  unavailable: 'השירות לא זמין זמנית — נסו שוב בעוד רגע.',
  unauthenticated: 'ההתחברות פגה — התחברו מחדש.',
  'invalid-argument': 'נתונים לא חוקיים ל-Firestore.',
  'not-found': 'המסמך או האוסף לא נמצאו.',
  'functions/not-found':
    'הפונקציה בערוץ ה-Cloud Functions לא נמצאה — בדקו אזור (region) או שם פונקציה.',
  'functions/internal':
    'שגיאה פנימית בפונקציה — לעיתים תליית SMTP (פורט חסום), timeout בשרת, או שהפונקציה לא עודכנה. העדף RESEND_API_KEY ב־HTTPS; בדוק לוגים.',
}

function messageSuggestsPrematureSend(msg: string): boolean {
  return /send was called before connect/i.test(msg)
}

/**
 * טקסט מפורט להצגה למשתמש (שורה שנייה בטוסט / לוג).
 */
export function formatFirebaseErrorDetail(err: unknown): string {
  if (err instanceof FirebaseError) {
    let hint = FIRESTORE_HINT_HE[err.code] ?? ''
    if (!hint && messageSuggestsPrematureSend(err.message)) {
      hint =
        'Firestore נקרא לפני שהחיבור היה מוכן — רעננו את הדף או נסו שוב אחרי שנייה.'
    }
    const technical = `${err.code}: ${err.message}`
    return hint ? `${hint}\n${technical}` : technical
  }
  if (err instanceof Error && err.message) {
    if (messageSuggestsPrematureSend(err.message)) {
      return `${'Firestore נקרא לפני שהחיבור היה מוכן — רעננו את הדף או נסו שוב אחרי שנייה.'}\n${err.message}`
    }
    return err.message
  }
  return typeof err === 'string' ? err : JSON.stringify(err)
}
