import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:8787'

/**
 * שמירת מסמכי הוצאות בשרת הפיתוח המקומי.
 * אפשר לעקוף עם VITE_FINANCE_DOCS_TARGET.
 */
const FINANCE_DOCS_TARGET =
  process.env.VITE_FINANCE_DOCS_TARGET || API_TARGET

/**
 * סנכרון חשבונית ירוקה (כולל הוראות קבע וריטיינרים) רץ בשרת המקומי בפיתוח.
 */
const INTEGRATIONS_TARGET =
  process.env.VITE_INTEGRATIONS_TARGET || API_TARGET

/**
 * צי Beo-agents — ברירת מחדל לשרת החי.
 * לעקוף לצי מקומי: BEO_AGENTS_TARGET=http://127.0.0.1:8788
 */
const BEO_AGENTS_TARGET =
  process.env.BEO_AGENTS_TARGET || 'https://agents.beosystem.com'

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
      // צי סוכני AI (Beo-agents) — לפני '/api' הכללי
      '/api/beo-agents': {
        target: BEO_AGENTS_TARGET,
        changeOrigin: true,
        secure: true,
        timeout: 180_000,
        proxyTimeout: 180_000,
        rewrite: (path) => path.replace(/^\/api\/beo-agents/, '/api'),
      },
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
})
