import { useMorningIntegration } from '../hooks/useMorningIntegration'
import { toastFsSuccess } from '../lib/fsToast'

/**
 * כפתור סנכרון לקוחות מחשבונית ירוקה — למודול הלקוחות.
 * חשבונית ירוקה היא מקור האמת ללקוחות (פעילים + לא פעילים).
 */
export function ClientsSyncButton() {
  const { status, loading, busy, syncClients, error } = useMorningIntegration()

  const handleSync = async () => {
    const result = await syncClients()
    if (result) {
      toastFsSuccess(
        `לקוחות סונכרנו — ${result.fetched} סה״כ · ${result.created} חדשים · ${result.updated} עודכנו · ${result.active} פעילים · ${result.inactive} לא פעילים`,
      )
    }
  }

  if (loading) return null

  const connected = status?.connected ?? false
  const firebaseReady = status?.firebaseReady ?? false

  if (!connected) {
    return (
      <span className="text-[12px] text-[var(--text-light)]">
        חשבונית ירוקה לא מחוברת — חבר בדף פיננסים
      </span>
    )
  }

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleSync}
        disabled={busy || !firebaseReady}
        className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        {busy ? 'מסנכרן לקוחות…' : 'סנכרן לקוחות מחשבונית ירוקה'}
      </button>
      {error ? (
        <span className="text-[11px] text-red-600">{error}</span>
      ) : null}
    </div>
  )
}
