import { useCallback, useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/apiClient'

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'שגיאה בטעינת סטטוס')
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
        const result = await apiFetch<MorningSyncResult>(
          '/api/integrations/morning/sync',
          {
            method: 'POST',
            body: JSON.stringify(fromDate ? { fromDate } : {}),
          },
        )
        await refresh()
        return result
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'הסנכרון נכשל')
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
      const result = await apiFetch<ClientSyncResult>(
        '/api/integrations/morning/sync-clients',
        { method: 'POST' },
      )
      await refresh()
      return result
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'סנכרון הלקוחות נכשל')
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
      const res = await apiFetch<{ ok: true; deleted: number }>(
        '/api/integrations/morning/reset-incomes',
        { method: 'POST' },
      )
      return res.deleted
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'המחיקה נכשלה')
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
