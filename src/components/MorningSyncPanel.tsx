import { useState } from 'react'
import { useMorningIntegration, type MorningEnv } from '../hooks/useMorningIntegration'
import { toastFsSuccess } from '../lib/fsToast'
import { useHubStore } from '../store/useStore'

function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MorningSyncPanel() {
  const { status, loading, busy, error, connect, sync, resetIncomes, refresh } =
    useMorningIntegration()
  const pushToast = useHubStore((s) => s.pushToast)

  const [showConnect, setShowConnect] = useState(false)
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [env, setEnv] = useState<MorningEnv>('production')

  const handleConnect = async () => {
    const ok = await connect(keyId.trim(), keySecret.trim(), env)
    if (ok) {
      toastFsSuccess('התחברות לחשבונית ירוקה בוצעה בהצלחה')
      setShowConnect(false)
      setKeyId('')
      setKeySecret('')
    }
  }

  const handleSync = async () => {
    const result = await sync()
    if (result) {
      const parts = [`נמשכו ${result.fetched}`, `יובאו ${result.imported}`]
      if (result.removed > 0) parts.push(`הוסרו ${result.removed}`)
      if (result.unmatchedClients > 0) {
        parts.push(`${result.unmatchedClients} ללא התאמת לקוח`)
      }
      if (result.clients) {
        parts.push(
          `לקוחות: ${result.clients.created} חדשים · ${result.clients.updated} עודכנו`,
        )
      }
      toastFsSuccess(`סנכרון הושלם — ${parts.join(' · ')}`)
    }
  }

  const handleReset = async () => {
    const confirmed = window.confirm(
      'פעולה זו תמחק לצמיתות את כל ההכנסות הקיימות במערכת. להמשיך?',
    )
    if (!confirmed) return
    const deleted = await resetIncomes()
    if (deleted !== null) {
      pushToast(`נמחקו ${deleted} הכנסות — אפשר לסנכרן מחדש`, 'success')
    }
  }

  const cardClass =
    'rounded-2xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:p-5'

  if (loading) {
    return (
      <section className={cardClass}>
        <p className="text-[13px] text-[var(--text-mid)]">טוען מצב חיבור…</p>
      </section>
    )
  }

  const firebaseReady = status?.firebaseReady ?? false
  const connected = status?.connected ?? false
  const ss = status?.syncState

  return (
    <section className={cardClass}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                connected
                  ? 'bg-[#ECFDF5] text-[#047857]'
                  : 'bg-[var(--surface-muted)] text-[var(--text-mid)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? 'bg-[#10B981]' : 'bg-[var(--text-light)]'
                }`}
              />
              {connected ? 'מחובר' : 'לא מחובר'}
            </span>
            {connected ? (
              <span className="text-[11px] font-semibold text-[var(--text-light)]">
                {status?.env === 'sandbox' ? 'סביבת בדיקות' : 'ייצור'}
              </span>
            ) : null}
          </div>
          <h2 className="mt-1.5 text-[15px] font-extrabold text-[var(--text-dark)]">
            חשבונית ירוקה · סנכרון הכנסות
          </h2>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[var(--text-mid)]">
            {connected
              ? `מושך מסמכים מ־${status?.fromDate ?? '—'} עד היום · לקוחות + הכנסות בלבד`
              : 'מקור האמת להכנסות. התחברו עם מפתח API כדי למשוך מסמכים.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {connected ? (
            <>
              <button
                type="button"
                onClick={handleSync}
                disabled={busy || !firebaseReady}
                className="rounded-[10px] bg-[var(--orange)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
              >
                {busy ? 'מסנכרן…' : 'משוך הכל'}
              </button>
              <button
                type="button"
                onClick={() => setShowConnect(true)}
                disabled={busy || status?.credentialsFromEnv}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[12px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                החלף מפתח
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowConnect(true)}
              disabled={!firebaseReady}
              className="rounded-[10px] bg-[var(--orange)] px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              התחבר לחשבונית ירוקה
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[12px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            רענן
          </button>
        </div>
      </div>

      {!loading && status && !firebaseReady ? (
        <div className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#92400E]">
          השרת אינו מחובר ל-Firebase Admin. בפיתוח:{' '}
          <code className="rounded bg-[#FEF3C7] px-1">FIREBASE_SERVICE_ACCOUNT_PATH</code>{' '}
          ב-<code className="rounded bg-[#FEF3C7] px-1">server/.env.local</code>.
          בפרודקשן (xCloud): הוסף{' '}
          <code className="rounded bg-[#FEF3C7] px-1">FIREBASE_SERVICE_ACCOUNT_B64</code>{' '}
          ל-Environment ועשה Deploy מחדש.
          {status.firebaseReason ? (
            <span className="mt-1 block opacity-80">{status.firebaseReason}</span>
          ) : null}
        </div>
      ) : null}

      {!loading && !status && error ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--text-mid)]">
          סטטוס חשבונית ירוקה לא זמין זמנית. אפשר להמשיך בעבודה בהוצאות
          ובהתאמות, ולסנכרן הכנסות מאוחר יותר.
        </div>
      ) : null}

      {error && status ? (
        <div className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[12px] text-[#B91C1C]">
          {error}
        </div>
      ) : null}

      {connected && ss ? (
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatBox label="סנכרון אחרון" value={formatDateTime(ss.lastSyncAt)} />
            <StatBox label="מסמכים יובאו" value={String(ss.lastImported ?? 0)} />
            <StatBox
              label="טווח"
              value={`${ss.lastFromDate ?? '—'} → ${ss.lastToDate ?? '—'}`}
            />
            <StatBox
              label="ללא התאמת לקוח"
              value={String(ss.lastUnmatchedClients ?? 0)}
              warn={(ss.lastUnmatchedClients ?? 0) > 0}
            />
          </div>
          {ss.lastClientsFetched !== undefined ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatBox
                label="לקוחות סה״כ"
                value={String(ss.lastClientsFetched ?? 0)}
              />
              <StatBox
                label="חדשים"
                value={String(ss.lastClientsCreated ?? 0)}
              />
              <StatBox
                label="פעילים"
                value={String(ss.lastClientsActive ?? 0)}
              />
              <StatBox
                label="לא פעילים"
                value={String(ss.lastClientsInactive ?? 0)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {connected ? (
        <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            className="text-[11px] font-semibold text-[#DC2626] underline-offset-2 transition hover:underline disabled:opacity-50"
          >
            מחק את כל ההכנסות הקיימות (איפוס)
          </button>
        </div>
      ) : null}

      {showConnect ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          onClick={() => !busy && setShowConnect(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <h3 className="text-[16px] font-extrabold text-[var(--text-dark)]">
              חיבור לחשבונית ירוקה
            </h3>
            <p className="mt-1 text-[12px] text-[var(--text-mid)]">
              הזינו מזהה מפתח וסוד מהגדרות ← API בחשבונית ירוקה.
            </p>

            <label className="mt-4 block text-[12px] font-semibold text-[var(--text-mid)]">
              מזהה מפתח (Key ID)
              <input
                type="text"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-[13px]"
                placeholder="••••••••-••••-••••"
                autoComplete="off"
              />
            </label>

            <label className="mt-3 block text-[12px] font-semibold text-[var(--text-mid)]">
              סוד (Secret)
              <input
                type="password"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-[13px]"
                placeholder="••••••••••••••••"
                autoComplete="off"
              />
            </label>

            <label className="mt-3 block text-[12px] font-semibold text-[var(--text-mid)]">
              סביבה
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as MorningEnv)}
                className="mt-1 w-full rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2.5 text-[13px]"
              >
                <option value="production">ייצור (Production)</option>
                <option value="sandbox">בדיקות (Sandbox)</option>
              </select>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConnect(false)}
                disabled={busy}
                className="rounded-[10px] border border-[var(--border)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-mid)] disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy || !keyId.trim() || !keySecret.trim()}
                className="rounded-[10px] bg-[var(--orange)] px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {busy ? 'מתחבר…' : 'התחבר ואמת'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function StatBox({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-right">
      <p className="text-[10px] font-semibold text-[var(--text-light)]">{label}</p>
      <p
        className={`mt-1 text-[13px] font-bold leading-snug ${
          warn ? 'text-[#D97706]' : 'text-[var(--text-dark)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
