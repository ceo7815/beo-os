import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * שמירת מסמכי הוצאות בשרת הפיתוח המקומי.
 * אפשר לעקוף עם VITE_FINANCE_DOCS_TARGET.
 */
const FINANCE_DOCS_TARGET =
  process.env.VITE_FINANCE_DOCS_TARGET || 'http://127.0.0.1:8787'

/**
 * סנכרון חשבונית ירוקה (כולל הוראות קבע וריטיינרים) רץ בשרת המקומי בפיתוח.
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
      // צי סוכני AI (Beo-agents control) — לפני '/api' הכללי
      '/api/beo-agents': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/beo-agents/, '/api'),
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
