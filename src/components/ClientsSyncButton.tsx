import { useState } from 'react'
import { syncRivhitFromDate } from '../lib/rivhitFinanceApi'
import { ApiError } from '../lib/apiClient'
import { toastFsSuccess, toastFsError } from '../lib/fsToast'

/**
 * סנכרון לקוחות + מסמכים מריווחית (מ־15/08/2026) — מחליף את חשבונית ירוקה.
 */
export function ClientsSyncButton() {
  const [busy, setBusy] = useState(false)

  const handleSync = async () => {
    if (
      !window.confirm(
        'למשוך מריווחית ל־Beo OS לקוחות ומסמכים מתאריך 15/08/2026 בלבד?',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const res = await syncRivhitFromDate('15/08/2026')
      const r = res.result
      toastFsSuccess(
        `ריווחית · לקוחות ${r.customers.created + r.customers.updated}/${r.customers.fetched} · הזמנות ${r.workOrders.created + r.workOrders.updated} · חשבוניות/קבלות ${r.taxReceipts.created + r.taxReceipts.updated}`,
      )
      if (r.errors.length) {
        console.warn('rivhit sync', r.errors)
        toastFsError(`${r.errors.length} אזהרות בסנכרון`, new Error(r.errors[0] ?? 'sync'))
      }
      // ריענון מלא כדי שהרשימה תיטען מחדש
      window.setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      toastFsError(
        e instanceof ApiError ? e.message : 'סנכרון ריווחית נכשל',
        e instanceof Error ? e : new Error(String(e)),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSync()}
      disabled={busy}
      className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
    >
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
      {busy ? 'מושך מריווחית…' : 'סנכרן מריווחית מ־15.08.2026'}
    </button>
  )
}
