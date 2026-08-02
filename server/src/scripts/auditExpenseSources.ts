/**
 * סקירה בלבד: התפלגות ההוצאות לפי מקור, חודש ומצב הגשה של הסוכן.
 * אינה משנה דבר — נועדה לוודא מה קיים לפני שינוי מודל.
 */
import '../config/loadEnv.js'
import { getAdminDb } from '../lib/firebaseAdmin.js'

async function main() {
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')

  const snap = await db.collection('financeExpenses').get()
  const bySource = new Map<string, { count: number; sum: number }>()
  const byAgentStatus = new Map<string, number>()
  const byMonth = new Map<string, { count: number; sum: number }>()

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>
    const source = String(d.source ?? 'manual')
    const amount = Number(d.amount ?? 0)
    const month = String(d.billingMonth ?? '?')

    const s = bySource.get(source) ?? { count: 0, sum: 0 }
    bySource.set(source, { count: s.count + 1, sum: s.sum + amount })

    const m = byMonth.get(month) ?? { count: 0, sum: 0 }
    byMonth.set(month, { count: m.count + 1, sum: m.sum + amount })

    if (d.agentStatus != null) {
      const k = String(d.agentStatus)
      byAgentStatus.set(k, (byAgentStatus.get(k) ?? 0) + 1)
    }
  }

  console.log(`total expenses: ${snap.size}\n`)
  console.log('by source:')
  for (const [k, v] of [...bySource].sort())
    console.log(`  ${k.padEnd(16)} ${String(v.count).padStart(4)}  ${Math.round(v.sum)}`)
  console.log('\nby billingMonth:')
  for (const [k, v] of [...byMonth].sort())
    console.log(`  ${k.padEnd(16)} ${String(v.count).padStart(4)}  ${Math.round(v.sum)}`)
  console.log('\nagentStatus (only docs that have one):')
  if (byAgentStatus.size === 0) console.log('  none')
  for (const [k, v] of [...byAgentStatus].sort()) console.log(`  ${k.padEnd(16)} ${v}`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
