/**
 * One-time GI expense import + reconcile (gentle batches for Firestore quota).
 * Run: npx tsx server/scripts/sync-expenses-once.ts
 */
import '../src/config/loadEnv.js'
import { runMorningExpenseSync } from '../src/lib/morningExpenseSync.js'

const fromDate = process.argv[2] ?? '2026-03-01'

console.log(`[sync-once] Starting GI expense sync from ${fromDate}…`)

try {
  const result = await runMorningExpenseSync({ fromDate })
  console.log('[sync-once] Done:', JSON.stringify(result, null, 2))
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  console.error('[sync-once] Failed:', msg)
  process.exit(1)
}
