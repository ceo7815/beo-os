import { useEffect, useState } from 'react'
import type { ClockifyIntegrationConfig } from '../../types'
import { CLOCKIFY_API_V1_DEFAULT, testClockifyConnection } from '../../lib/clockifyService'
import { toastFsError, toastFsSuccess } from '../../lib/fsToast'
import { hubSectionClass } from '../../lib/hubSectionBorder'

type Props = {
  config: ClockifyIntegrationConfig | null
  loading: boolean
  onSave: (payload: { apiKey: string; workspaceId: string; apiBaseUrl?: string }) => Promise<void>
}

export function ClockifyConfigCard({ config, loading, onSave }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState(CLOCKIFY_API_V1_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!config) return
    setWorkspaceId(config.workspaceId ?? '')
    setApiBaseUrl(config.apiBaseUrl?.trim() || CLOCKIFY_API_V1_DEFAULT)
    setApiKey('')
  }, [config?.workspaceId, config?.apiBaseUrl, config?.apiKey])

  const hasStoredKey = Boolean(config?.apiKey?.trim())

  const runTest = async () => {
    const ws = workspaceId.trim() || config?.workspaceId?.trim() || ''
    if (!ws) {
      toastFsError('חסר Workspace ID', new Error(''), 'clockify test')
      return
    }
    if (!hasStoredKey && !apiKey.trim()) {
      toastFsError('שמרו קודם API Key', new Error(''), 'clockify test')
      return
    }
    setTesting(true)
    try {
      const { userCount, sampleEmails } = await testClockifyConnection(ws)
      const sample =
        sampleEmails.length > 0 ? `\nדוגמאות: ${sampleEmails.join(', ')}` : ''
      toastFsSuccess(`חיבור תקין — ${userCount} משתמשים ב-workspace.${sample}`)
    } catch (e) {
      toastFsError('בדיקת חיבור נכשלה', e, 'clockify test')
    } finally {
      setTesting(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const keyToSave = apiKey.trim() || (config?.apiKey ?? '')
      await onSave({
        apiKey: keyToSave,
        workspaceId: workspaceId.trim(),
        apiBaseUrl: apiBaseUrl.trim() || CLOCKIFY_API_V1_DEFAULT,
      })
      setApiKey('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`rounded-2xl ${hubSectionClass(0)} p-4 md:p-6`}>
      <h2 className="text-[15px] font-extrabold text-[var(--text-dark)] md:text-[17px]">
        הגדרות Clockify (אדמין)
      </h2>
      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
        מפתח ה-API ומזהה ה-Workspace נשמרים ב-Firestore: מסמך אדמין{' '}
        <code className="rounded bg-[var(--bg-input)] px-1 py-0.5 text-[11px]">attendanceConfig/clockify</code>
        , ומזהה Workspace מסונכרן גם ל־
        <code className="rounded bg-[var(--bg-input)] px-1 py-0.5 text-[11px]">attendanceConfig/settings</code> לקריאת
        עובדים. הקריאות ל-Clockify מתבצעות דרך Cloud Function <code className="text-[11px]">clockifyProxy</code> (Callable
        Gen2 + <code className="text-[11px]">httpsCallable</code>), לא ישירות ל-API של Clockify מהדפדפן.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-mid)]">טוען הגדרות…</p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">
              API Key <span className="text-[var(--text-light)]">(Clockify → Profile settings → API)</span>
            </label>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasStoredKey ? '•••••••• (הושאר ריק כדי לא לשנות)' : 'הדבק כאן את מפתח ה-API'}
              className="w-full font-mono text-[13px]"
              dir="ltr"
            />
            {hasStoredKey ? (
              <p className="mt-1 text-[11px] text-[var(--text-light)]">מפתח שמור במערכת — השאר ריק לשמירה ללא שינוי.</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">
              Workspace ID <span className="text-[var(--text-light)]">(Clockify → Workspace settings)</span>
            </label>
            <input
              type="text"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="הדבק כאן את מזהה ה-workspace"
              className="w-full font-mono text-[13px]"
              dir="ltr"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[var(--text-mid)]">
              בסיס URL ל-API <span className="text-[var(--text-light)]">(אופציונלי — ברירת מחדל Clockify)</span>
            </label>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={CLOCKIFY_API_V1_DEFAULT}
              className="w-full font-mono text-[13px]"
              dir="ltr"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="hub-btn-orange" disabled={saving}>
              {saving ? 'שומר…' : 'שמירה ב-Firestore'}
            </button>
            <button
              type="button"
              className="hub-btn-secondary"
              disabled={testing || saving}
              onClick={() => void runTest()}
            >
              {testing ? 'בודק…' : 'בדיקת חיבור'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
