import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * חשבוניות הספק נשמרות תמיד על שרת הפרודקשן, גם בפיתוח.
 *
 * הפיתוח כבר עובד מול בסיס הנתונים האמיתי, ולכן שמירת הקבצים מקומית הייתה
 * יוצרת הוצאות שהמסמך שלהן קיים רק על מחשב אחד. הכתובת ניתנת לעקיפה
 * למי שרוצה לפתח מול שרת מקומי.
 */
const FINANCE_DOCS_TARGET =
  process.env.VITE_FINANCE_DOCS_TARGET || 'https://pos.hub.co.il'

/**
 * סנכרון חשבונית ירוקה (כולל הוראות קבע וריטיינרים) רץ בשרת המקומי בפיתוח.
 * לבדיקה מול פרודקשן: VITE_INTEGRATIONS_TARGET=https://pos.hub.co.il
 */
const INTEGRATIONS_TARGET =
  process.env.VITE_INTEGRATIONS_TARGET || 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // חייב להופיע לפני '/api' — Vite בוחר את ההתאמה הראשונה ברשימה
      '/api/finance-documents': {
        target: FINANCE_DOCS_TARGET,
        changeOrigin: true,
      },
      '/api/integrations': {
        target: INTEGRATIONS_TARGET,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
