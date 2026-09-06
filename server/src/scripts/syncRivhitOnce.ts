/**
 * סנכרון חד־פעמי מריווחית → Supabase (לקוחות + הזמנות + מס-קבלה מ-15/08/2026).
 * שימוש: cd server && npx tsx src/scripts/syncRivhitOnce.ts
 */
import '../config/loadEnv.js'
import { getServiceSupabase } from '../lib/supabaseAdmin.js'
import { syncRivhitIntoBeo } from '../lib/rivhitSync.js'
import { rivhitConfigured } from '../lib/rivhitClient.js'

async function main() {
  if (!rivhitConfigured()) {
    console.error('חסר RIVHIT_API_TOKEN')
    process.exit(1)
  }
  const sb = getServiceSupabase()
  if (!sb) {
    console.error('חסר SUPABASE_SERVICE_ROLE_KEY — הרץ סנכרון מהמסך ב-Beo OS (כמנהל מחובר)')
    process.exit(2)
  }
  const fromDate = process.argv[2] || '15/08/2026'
  console.log('Sync from', fromDate, '…')
  const result = await syncRivhitIntoBeo(sb, { fromDate })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
