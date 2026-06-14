/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  /** אופציונלי — אזור Functions (ברירת מחדל us-central1 בקוד) */
  readonly VITE_FUNCTIONS_REGION?: string
  /** אופציונלי — URL מלא ל־clockifyProxy (onRequest), אם שונה מברירת המחדל */
  readonly VITE_CLOCKIFY_PROXY_URL?: string
  /** קישור לחשבונית ירוקה / Morning בדף גבייה */
  readonly VITE_GREEN_INVOICE_URL?: string
  /** seed ל-Firestore — רק פיתוח; בפרודקשן false */
  readonly VITE_ENABLE_FIRESTORE_SEED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
