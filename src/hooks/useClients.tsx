import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isSupabaseConfigured } from '../lib/backend'
import { requireSupabase } from '../lib/supabase'
import { emptyToNull, subscribeTable, uuidList } from '../lib/sbLive'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useAuth } from '../contexts/AuthContext'
import { useHubStore } from '../store/useStore'
import type { Client } from '../types'

function rowToClient(row: Record<string, unknown>): Client {
  const ids = Array.isArray(row.assigned_employee_user_ids)
    ? row.assigned_employee_user_ids.map((id) => String(id)).filter(Boolean)
    : []
  const department =
    typeof row.department === 'string' && row.department.trim()
      ? row.department.trim()
      : undefined
  const legalName =
    typeof row.legal_name === 'string' && row.legal_name.trim()
      ? row.legal_name.trim()
      : undefined
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    contact: String(row.contact ?? ''),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    department,
    status: row.status === 'inactive' ? 'inactive' : 'active',
    createdAt: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
    ...(ids.length ? { assignedEmployeeUserIds: ids } : {}),
    ...(legalName ? { legalName } : {}),
    taxId: typeof row.tax_id === 'string' && row.tax_id.trim() ? row.tax_id.trim() : undefined,
    addressLine:
      typeof row.address_line === 'string' && row.address_line.trim()
        ? row.address_line.trim()
        : undefined,
    city: typeof row.city === 'string' && row.city.trim() ? row.city.trim() : undefined,
    businessNotes:
      typeof row.business_notes === 'string' && row.business_notes.trim()
        ? row.business_notes.trim()
        : undefined,
    financeBalance:
      typeof row.finance_balance === 'number' ? row.finance_balance : undefined,
    greenInvoiceId:
      typeof row.green_invoice_id === 'string' && row.green_invoice_id.trim()
        ? row.green_invoice_id.trim()
        : undefined,
    source: row.source === 'green_invoice' ? 'green_invoice' : 'manual',
  }
}

function clientInsert(data: Omit<Client, 'id' | 'createdAt'>): Record<string, unknown> {
  return {
    name: data.name.trim(),
    contact: data.contact?.trim() ?? '',
    phone: data.phone?.trim() ?? '',
    email: data.email?.trim() ?? '',
    department: emptyToNull(data.department ?? undefined),
    status: data.status === 'inactive' ? 'inactive' : 'active',
    assigned_employee_user_ids: uuidList(data.assignedEmployeeUserIds),
    legal_name: emptyToNull(data.legalName),
    tax_id: emptyToNull(data.taxId),
    address_line: emptyToNull(data.addressLine),
    city: emptyToNull(data.city),
    business_notes: emptyToNull(data.businessNotes),
    source: data.source === 'green_invoice' ? 'green_invoice' : 'manual',
    green_invoice_id: emptyToNull(data.greenInvoiceId),
  }
}

function clientPatch(data: Partial<Client>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name.trim()
  if (data.contact !== undefined) patch.contact = data.contact.trim()
  if (data.phone !== undefined) patch.phone = data.phone.trim()
  if (data.email !== undefined) patch.email = data.email.trim()
  if (data.department !== undefined) patch.department = emptyToNull(data.department ?? undefined)
  if (data.status !== undefined) patch.status = data.status
  if (data.assignedEmployeeUserIds !== undefined) {
    patch.assigned_employee_user_ids = uuidList(data.assignedEmployeeUserIds)
  }
  if (data.legalName !== undefined) patch.legal_name = emptyToNull(data.legalName)
  if (data.taxId !== undefined) patch.tax_id = emptyToNull(data.taxId)
  if (data.addressLine !== undefined) patch.address_line = emptyToNull(data.addressLine)
  if (data.city !== undefined) patch.city = emptyToNull(data.city)
  if (data.businessNotes !== undefined) patch.business_notes = emptyToNull(data.businessNotes)
  if (data.source !== undefined) patch.source = data.source
  if (data.greenInvoiceId !== undefined) patch.green_invoice_id = emptyToNull(data.greenInvoiceId)
  if (data.financeBalance !== undefined) patch.finance_balance = data.financeBalance
  return patch
}

type ClientsContextValue = {
  clients: Client[]
  loading: boolean
  error: Error | null
  addClient: (data: Omit<Client, 'id' | 'createdAt'>) => Promise<string | undefined>
  updateClient: (id: string, data: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>
}

const ClientsContext = createContext<ClientsContextValue | null>(null)

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user?.uid) {
      setClients([])
      setLoading(false)
      setError(null)
      return
    }
    if (!isSupabaseConfigured()) {
      setClients([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    return subscribeTable(
      'clients',
      (rows) => {
        setClients(rows.map(rowToClient))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('clients', err)
        toastFsError('שגיאה בטעינת לקוחות', err, 'clients')
        setError(err)
        setLoading(false)
      },
    )
  }, [user?.uid])

  const addClient = useCallback(
    async (data: Omit<Client, 'id' | 'createdAt'>): Promise<string | undefined> => {
      if (!user) {
        toastFsError('יש להתחבר להוספת לקוח', new Error('no user'), 'addClient')
        return undefined
      }
      try {
        const sb = requireSupabase()
        const { data: row, error: qErr } = await sb
          .from('clients')
          .insert(clientInsert(data))
          .select('*')
          .single()
        if (qErr) throw qErr
        const created = rowToClient(row as Record<string, unknown>)
        setClients((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]))
        toastFsSuccess('הלקוח נוסף בהצלחה')
        return created.id
      } catch (e) {
        toastFsError('שגיאה בשמירת הלקוח', e, 'addClient')
        return undefined
      }
    },
    [user],
  )

  const updateClient = useCallback(
    async (id: string, data: Partial<Client>) => {
      if (!user) {
        toastFsError('יש להתחבר לעדכון לקוח', new Error('no user'), 'updateClient')
        return
      }
      try {
        const sb = requireSupabase()
        const { error: qErr } = await sb.from('clients').update(clientPatch(data)).eq('id', id)
        if (qErr) throw qErr
        setClients((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...data,
                  assignedEmployeeUserIds:
                    data.assignedEmployeeUserIds !== undefined
                      ? data.assignedEmployeeUserIds.length
                        ? [...data.assignedEmployeeUserIds]
                        : undefined
                      : c.assignedEmployeeUserIds,
                }
              : c,
          ),
        )
        toastFsSuccess('פרטי הלקוח עודכנו')
      } catch (e) {
        toastFsError('שגיאה בעדכון הלקוח', e, 'updateClient')
      }
    },
    [user],
  )

  const deleteClient = useCallback(async (id: string) => {
    try {
      const sb = requireSupabase()
      const { error: qErr } = await sb.from('clients').delete().eq('id', id)
      if (qErr) throw qErr
      setClients((prev) => prev.filter((c) => c.id !== id))
      const sel = useHubStore.getState().selectedClientId
      if (sel === id) useHubStore.getState().setSelectedClient(null)
      toastFsSuccess('הלקוח נמחק')
    } catch (e) {
      toastFsError('שגיאה במחיקת הלקוח', e, 'deleteClient')
    }
  }, [])

  const value = useMemo(
    () => ({
      clients,
      loading,
      error,
      addClient,
      updateClient,
      deleteClient,
    }),
    [clients, loading, error, addClient, updateClient, deleteClient],
  )

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
}

export function useClients(): ClientsContextValue {
  const ctx = useContext(ClientsContext)
  if (!ctx) throw new Error('useClients חייב להיות בתוך ClientsProvider')
  return ctx
}
