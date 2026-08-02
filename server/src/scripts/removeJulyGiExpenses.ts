/**
 * מחיקה חד-פעמית: הוצאות שנמשכו מחשבונית ירוקה בחודש יולי 2026.
 *
 * חשבונית ירוקה היא מקור האמת להכנסות בלבד, ויולי הוא החודש הראשון שבו
 * ההוצאות נכנסות דרך הסוכן. חודשים קודמים נשארים כהיסטוריה ואינם נגעים.
 *
 * ברירת המחדל היא הרצה יבשה. למחיקה בפועל יש להריץ עם --apply
 */
import '../config/loadEnv.js'
import { getAdminDb } from '../lib/firebaseAdmin.js'

const TARGET_MONTH = '2026-07'
const TARGET_SOURCE = 'green_invoice'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getAdminDb()
  if (!db) throw new Error('Firebase Admin not configured')

  const snap = await db
    .collection('financeExpenses')
    .where('billingMonth', '==', TARGET_MONTH)
    .where('source', '==', TARGET_SOURCE)
    .get()

  console.log(
    `${apply ? 'DELETING' : 'DRY RUN — would delete'} ${snap.size} expenses (${TARGET_MONTH}, source=${TARGET_SOURCE})\n`,
  )

  let sum = 0
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>
    sum += Number(d.amount ?? 0)
    console.log(
      `  ${doc.id}  ${String(d.amount).padStart(9)}  ${String(d.paidDate ?? '')}  ${String(d.name ?? d.supplierName ?? '')}`,
    )
  }
  console.log(`\n  total: ${Math.round(sum)}`)

  if (!apply) {
    console.log('\nNo changes made. Re-run with --apply to delete.')
    return
  }

  const batch = db.batch()
  for (const doc of snap.docs) batch.delete(doc.ref)
  await batch.commit()
  console.log(`\nDeleted ${snap.size} documents.`)
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
