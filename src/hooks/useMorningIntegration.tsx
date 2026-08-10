import { useCallback, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/apiClient'
import {
  applyMorningClients,
  applyMorningSyncPayload,
  resetIncomesClientSide,
  type MorningSyncPayload,
} from '../lib/morningSyncApply'

export type MorningEnv = 'sandbox' | 'production'

export type MorningSyncState = {
  lastSyncAt?: string
  lastFromDate?: string
  lastToDate?: string
  lastFetched?: number
  lastImported?: number
  lastRemoved?: number
  lastUnmatchedClients?: number
  lastClientsFetched?: number
  lastClientsCreated?: number
  lastClientsUpdated?: number
  lastClientsActive?: number
  lastClientsInactive?: number
  lastExpenseSyncAt?: string
  lastExpenseFromDate?: string
  lastExpenseToDate?: string
  lastExpenseFetched?: number
  lastExpenseImported?: number
  lastExpenseMatched?: number
  lastExpenseBankMissingDocument?: number
}

export type ClientSyncResult = {
  ok: true
  fetched: number
  created: number
  updated: number
  active: number
  inactive: number
  durationMs: number
}

export type MorningStatus = {
  ok: boolean
  firebaseReady: boolean
  firebaseReason: string | null
  connected: boolean
  env: MorningEnv | null
  credentialsFromEnv: boolean
  fromDate: string
  syncState: MorningSyncState | null
}

export type MorningSyncResult = {
  ok: true
  fromDate: string
  toDate: string
  fetched: number
  imported: number
  updated: number
  removed: number
  unmatchedClients: number
  durationMs: number
  clients?: ClientSyncResult
  recurringImported?: number
  recurringRemoved?: number
  retainersImported?: number
  retainersRemoved?: number
  recurringFetchError?: string
  retainersFetchError?: string
}

export type MorningExpenseSyncResult = {
  ok: true
  fromDate: string
  toDate: string
  fetched: number
  imported: number
  matched: number
  bankMissingDocument: number
  durationMs: number
}

export type MorningReconcileResult = {
  ok: true
  matched: number
  bankMissingDocument: number
  giUnpaid: number
  durationMs: number
}

/** הודעה ברורה כשמכסת Firestore Admin חוסמת כתיבת הכנסות/לקוחות */
function formatMorningError(e: unknown, fallback: string): string {
  const raw = e instanceof ApiError ? e.message : e instanceof Error ? e.message : ''
  if (/RESOURCE_EXHAUSTED|Quota exceeded|permission-denied/i.test(raw)) {
    return 'השמירה ל-Firestore נחסמה זמנית (מכסה או הרשאה). המשיכה מחשבונית ירוקה הצליחה — נסו שוב בעוד כמה דקות כמנהל.'
  }
  return raw || fallback
}

export function useMorningIntegration() {
  const [status, setStatus] = useState<MorningStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await apiFetch<MorningStatus>(
        '/api/integrations/morning/status',
      )
      setStatus(s)
    } catch {
      // כשל סטטוס (רשת / מכסה / 500) לא חוסם את שאר המערכת
      setError('status_unavailable')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = useCallback(
    async (keyId: string, keySecret: string, env: MorningEnv) => {
      setBusy(true)
      setError(null)
      try {
        await apiFetch('/api/integrations/morning/connect', {
          method: 'POST',
          body: JSON.stringify({ keyId, keySecret, env }),
        })
        await refresh()
        return true
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'החיבור נכשל')
        return false
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const sync = useCallback(
    async (fromDate?: string): Promise<MorningSyncResult | null> => {
      setBusy(true)
      setError(null)
      try {
        // השרת רק מושך מחשבונית ירוקה — השמירה לדאטהבייס בדפדפן (בלי Admin)
        const payload = await apiFetch<MorningSyncPayload>(
          '/api/integrations/morning/sync',
          {
            method: 'POST',
            body: JSON.stringify(fromDate ? { fromDate } : {}),
          },
        )
        const result = await applyMorningSyncPayload(payload)
        await apiFetch('/api/integrations/morning/ack-sync', {
          method: 'POST',
          body: JSON.stringify({
            lastSyncAt: new Date().toISOString(),
            lastFromDate: result.fromDate,
            lastToDate: result.toDate,
            lastFetched: result.fetched,
            lastImported: result.imported,
            lastRemoved: result.removed,
            lastUnmatchedClients: result.unmatchedClients,
            lastClientsFetched: result.clients.fetched,
            lastClientsCreated: result.clients.created,
            lastClientsUpdated: result.clients.updated,
            lastClientsActive: result.clients.active,
            lastClientsInactive: result.clients.inactive,
          }),
        })
        await refresh()
        return result
      } catch (e) {
        setError(formatMorningError(e, 'הסנכרון נכשל'))
        return null
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const syncClients = useCallback(async (): Promise<ClientSyncResult | null> => {
    setBusy(true)
    setError(null)
    try {
      const payload = await apiFetch<{
        ok: true
        mode: 'client_write'
        clients: MorningSyncPayload['clients']
      }>('/api/integrations/morning/sync-clients', { method: 'POST' })
      const started = Date.now()
      const stats = await applyMorningClients(payload.clients)
      await refresh()
      return {
        ok: true,
        ...stats,
        durationMs: Date.now() - started,
      }
    } catch (e) {
      setError(formatMorningError(e, 'סנכרון הלקוחות נכשל'))
      return null
    } finally {
      setBusy(false)
    }
  }, [refresh])

  // אין משיכת הוצאות מחשבונית ירוקה — משם מגיעות הכנסות בלבד.

  const reconcileExpenses = useCallback(
    async (): Promise<MorningReconcileResult | null> => {
      setBusy(true)
      setError(null)
      try {
        const result = await apiFetch<MorningReconcileResult>(
          '/api/integrations/morning/reconcile-expenses',
          { method: 'POST' },
        )
        await refresh()
        return result
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'ההתאמה נכשלה')
        return null
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const resetIncomes = useCallback(async (): Promise<number | null> => {
    setBusy(true)
    setError(null)
    try {
      // מחיקה מהדפדפן — בלי Admin SDK / מכסת שרת
      return await resetIncomesClientSide()
    } catch (e) {
      setError(formatMorningError(e, 'המחיקה נכשלה'))
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    status,
    loading,
    busy,
    error,
    refresh,
    connect,
    sync,
    syncClients,
    reconcileExpenses,
    resetIncomes,
  }
}
