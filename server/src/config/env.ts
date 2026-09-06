import './loadEnv.js'

function readString(key: string, fallback = ''): string {
  const v = process.env[key]
  return typeof v === 'string' ? v.trim() : fallback
}

function readPort(key: string, fallback: number): number {
  const raw = readString(key)
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback
}

function readOrigins(raw: string): string[] {
  if (!raw)
    return [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5175',
    ]
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function readInt(key: string, fallback = 0): number {
  const raw = readString(key)
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export const env = {
  nodeEnv: readString('NODE_ENV', 'development'),
  isDev: readString('NODE_ENV', 'development') !== 'production',
  host: readString('SERVER_HOST', '127.0.0.1'),
  port: readPort('SERVER_PORT', 8787),
  corsOrigins: readOrigins(
    readString('CORS_ORIGINS') ||
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5183,http://127.0.0.1:5183,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175',
  ),
  supabaseUrl: readString('SUPABASE_URL') || readString('VITE_SUPABASE_URL'),
  supabaseAnonKey: readString('SUPABASE_ANON_KEY') || readString('VITE_SUPABASE_ANON_KEY'),
  /** service_role — רק בשרת, ל-/api/bot-data (לא בדפדפן) */
  supabaseServiceRoleKey: readString('SUPABASE_SERVICE_ROLE_KEY'),
  firebaseServiceAccountPath: readString('FIREBASE_SERVICE_ACCOUNT_PATH'),
  /** JSON גולמי — לפרודקשן ב-xCloud (משתנה סביבה אחד) */
  firebaseServiceAccountJson: readString('FIREBASE_SERVICE_ACCOUNT_JSON'),
  /** Base64 של JSON — נוח להדבקה בפאנל xCloud */
  firebaseServiceAccountB64: readString('FIREBASE_SERVICE_ACCOUNT_B64'),
  morning: {
    env: readString('MORNING_ENV', 'sandbox') as 'sandbox' | 'production',
    keyId: readString('MORNING_KEY_ID'),
    keySecret: readString('MORNING_KEY_SECRET'),
  },
  sync: {
    fromDate: readString('SYNC_FROM_DATE', '2026-03-01'),
    overlapDays: Math.max(1, readPort('SYNC_OVERLAP_DAYS', 7)),
  },
  /** מפתח API ל-/api/bot-data (בוטים/סוכנים חיצוניים - למשל ceo-digital-ai) */
  botApiKey: readString('BOT_API_KEY'),
  /** טוקן API של ריווחית אונליין (מסך הגדרות ממשקים → הצג API) */
  rivhitApiToken: readString('RIVHIT_API_TOKEN'),
  /**
   * סוגי מסמך בחשבון ריווחית (אופציונלי — אם 0, מזוהים אוטומטית מ-Document.TypeList).
   */
  rivhitWorkOrderType: readInt('RIVHIT_WORK_ORDER_TYPE', 0),
  rivhitTaxReceiptType: readInt('RIVHIT_TAX_RECEIPT_TYPE', 0),
  rivhitCreditNoteType: readInt('RIVHIT_CREDIT_NOTE_TYPE', 0),
  /** מיילים שמורשים כמנהל (מופרד בפסיקים) */
  adminEmails: (readString('ADMIN_EMAILS') || 'ceo@beosystem.com,ceo@beosystem.co.il')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /**
   * תיקיית חשבוניות הספק. בפרודקשן זהו נפח קבוע של Docker — הקבצים חייבים
   * לשרוד בנייה מחדש של הקונטיינר.
   */
  financeDocsDir: readString('FINANCE_DOCS_DIR', './data/finance-documents'),
  /**
   * מפתחות + מצב סנכרון של חשבונית ירוקה על דיסק השרת.
   * כך סטטוס/חיבור לא תלויים במכסת Firestore Admin.
   */
  morningDataDir: readString('MORNING_DATA_DIR', './data/morning'),
} as const

/**
 * Resource API host — מסמכים / לקוחות / הוצאות.
 * החל מיוני 2026: רק api.greeninvoice.co.il (לא www.greeninvoice.co.il).
 * @see https://www.greeninvoice.co.il/help-center/api-updates-26/
 */
export const MORNING_BASE_URLS = {
  sandbox: 'https://sandbox.d.greeninvoice.co.il/api/v1',
  production: 'https://api.greeninvoice.co.il/api/v1',
} as const

/**
 * OAuth 2.0 IdP host — קבלת access token (נפרד מ-Resource API).
 * לפי דוקומנטציית Morning / מפתחים מעודכנת (API 2.0).
 */
export const MORNING_AUTH_URLS = {
  sandbox: 'https://api.sandbox.morning.dev/idp/v1/oauth/token',
  production: 'https://api.morning.co/idp/v1/oauth/token',
} as const

/** האם הוגדרו מפתחות Morning במשתני סביבה (fallback ל-Firestore) */
export function morningEnvConfigured(): boolean {
  return Boolean(env.morning.keyId && env.morning.keySecret)
}

/** @deprecated שם ישן — נשמר לתאימות עם health route */
export function morningConfigured(): boolean {
  return morningEnvConfigured()
}
