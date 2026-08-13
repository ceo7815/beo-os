import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { isDeleteSentinel, subscribeTable, uuidOrNull } from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Campaign, CampaignKind, CampaignPlatform, CampaignStatus } from '../types'

function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    kind: (row.kind as CampaignKind) || 'internal',
    platform: (row.platform as CampaignPlatform) || 'other',
    status: (row.status as CampaignStatus) || 'planning',
    clientId: row.client_id ? String(row.client_id) : undefined,
    projectId: row.project_id ? String(row.project_id) : undefined,
    supplierId: row.supplier_id ? String(row.supplier_id) : undefined,
    performerUserId: row.performer_user_id ? String(row.performer_user_id) : undefined,
    budget: row.budget == null ? undefined : Number(row.budget),
    startDate: row.start_date ? String(row.start_date) : undefined,
    endDate: row.end_date ? String(row.end_date) : undefined,
    resultsUpdate: typeof row.results_update === 'string' ? row.results_update : undefined,
    resultsLog: Array.isArray(row.results_log)
      ? (row.results_log as Campaign['resultsLog'])
      : [],
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
  }
}

const CAMPAIGN_KEYS: Record<string, string> = {
  name: 'name',
  kind: 'kind',
  platform: 'platform',
  status: 'status',
  clientId: 'client_id',
  projectId: 'project_id',
  supplierId: 'supplier_id',
  performerUserId: 'performer_user_id',
  budget: 'budget',
  startDate: 'start_date',
  endDate: 'end_date',
  resultsUpdate: 'results_update',
  resultsLog: 'results_log',
}

function campaignToRow(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    const col = CAMPAIGN_KEYS[k]
    if (!col) continue
    if (v === undefined) continue
    if (isDeleteSentinel(v) || v === '') {
      out[col] = null
      continue
    }
    out[col] = v
  }
  for (const col of ['client_id', 'project_id', 'supplier_id', 'performer_user_id']) {
    if (col in out) out[col] = uuidOrNull(String(out[col] ?? ''))
  }
  return out
}

type CampaignsContextValue = {
  campaigns: Campaign[]
  loading: boolean
  error: Error | null
  addCampaign: (data: Omit<Campaign, 'id' | 'createdAt'>) => Promise<void>
  updateCampaign: (id: string, data: Partial<Campaign>) => Promise<void>
  updateCampaignStatus: (id: string, status: CampaignStatus) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
}

const CampaignsContext = createContext<CampaignsContextValue | null>(null)

export function CampaignsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      setCampaigns([])
      setLoading(false)
      setError(null)
      return
    }
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    return subscribeTable(
      'campaigns',
      (rows) => {
        setCampaigns(rows.map(rowToCampaign))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('campaigns', err)
        toastFsError('שגיאה בטעינת קמפיינים', err, 'campaigns')
        setError(err)
        setLoading(false)
      },
    )
  }, [user])

  const addCampaign = useCallback(
    async (data: Omit<Campaign, 'id' | 'createdAt'>) => {
      if (!user) {
        toastFsError('יש להתחבר להוספת קמפיין', new Error('no user'), 'addCampaign')
        return
      }
      try {
        const sb = requireSupabase()
        const row = campaignToRow({
          ...data,
          name: data.name.trim(),
        })
        const { error: qErr } = await sb.from('campaigns').insert(row)
        if (qErr) throw qErr
        toastFsSuccess('הקמפיין נוסף')
      } catch (e) {
        toastFsError('שגיאה בהוספת קמפיין', e, 'addCampaign')
      }
    },
    [user],
  )

  const updateCampaign = useCallback(
    async (id: string, data: Partial<Campaign>) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון קמפיין', new Error('no user'), 'updateCampaign')
        return
      }
      try {
        const sb = requireSupabase()
        const row = campaignToRow(data as Record<string, unknown>)
        if (Object.keys(row).length === 0) return
        const { error: qErr } = await sb.from('campaigns').update(row).eq('id', id)
        if (qErr) throw qErr
        toastFsSuccess('הקמפיין עודכן')
      } catch (e) {
        toastFsError('שגיאה בעדכון קמפיין', e, 'updateCampaign')
      }
    },
    [user],
  )

  const updateCampaignStatus = useCallback(
    async (id: string, status: CampaignStatus) => {
      await updateCampaign(id, { status })
    },
    [updateCampaign],
  )

  const deleteCampaign = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error: qErr } = await sb.from('campaigns').delete().eq('id', id)
      if (qErr) throw qErr
      toastFsSuccess('הקמפיין נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת קמפיין', e, 'deleteCampaign')
    }
  }, [])

  const value = useMemo(
    () => ({
      campaigns,
      loading,
      error,
      addCampaign,
      updateCampaign,
      updateCampaignStatus,
      deleteCampaign,
    }),
    [campaigns, loading, error, addCampaign, updateCampaign, updateCampaignStatus, deleteCampaign],
  )

  return (
    <CampaignsContext.Provider value={value}>{children}</CampaignsContext.Provider>
  )
}

export function useCampaigns(): CampaignsContextValue {
  const ctx = useContext(CampaignsContext)
  if (!ctx) throw new Error('useCampaigns חייב להיות בתוך CampaignsProvider')
  return ctx
}
