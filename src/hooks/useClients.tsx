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
import { ensureRivhitCustomer } from '../lib/rivhitFinanceApi'
import { useAuth } from '../contexts/AuthContext'
import { useHubStore } from '../store/useStore'
import type { Client } from '../types'
import { ApiError } from '../lib/apiClient'

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
    idNumber:
      typeof row.id_number === 'string' && row.id_number.trim() ? row.id_number.trim() : undefined,
    foreignId:
      typeof row.foreign_id === 'string' && row.foreign_id.trim()
        ? row.foreign_id.trim()
        : undefined,
    addressLine:
      typeof row.address_line === 'string' && row.address_line.trim()
        ? row.address_line.trim()
        : undefined,
    city: typeof row.city === 'string' && row.city.trim() ? row.city.trim() : undefined,
    zipcode: typeof row.zipcode === 'string' && row.zipcode.trim() ? row.zipcode.trim() : undefined,
    country: typeof row.country === 'string' && row.country.trim() ? row.country.trim() : undefined,
    phone2: typeof row.phone2 === 'string' && row.phone2.trim() ? row.phone2.trim() : undefined,
    fax: typeof row.fax === 'string' && row.fax.trim() ? row.fax.trim() : undefined,
    payingCustomerName:
      typeof row.paying_customer_name === 'string' && row.paying_customer_name.trim()
        ? row.paying_customer_name.trim()
        : undefined,
    currency:
      typeof row.currency === 'string' && row.currency.trim() ? row.currency.trim() : 'ILS',
    rivhitProjectRef:
      typeof row.rivhit_project_ref === 'string' && row.rivhit_project_ref.trim()
        ? row.rivhit_project_ref.trim()
        : undefined,
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
    rivhitCustomerId:
      row.rivhit_customer_id == null ? undefined : Number(row.rivhit_customer_id),
    source: row.source === 'green_invoice' ? 'green_invoice' : 'manual',
    ...(typeof row.sales_agent_user_id === 'string' && row.sales_agent_user_id
      ? { salesAgentUserId: row.sales_agent_user_id }
      : {}),
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
    sales_agent_user_id: emptyToNull(data.salesAgentUserId),
    legal_name: emptyToNull(data.legalName),
    tax_id: emptyToNull(data.taxId),
    id_number: emptyToNull(data.idNumber),
    foreign_id: emptyToNull(data.foreignId),
    address_line: emptyToNull(data.addressLine),
    city: emptyToNull(data.city),
    zipcode: emptyToNull(data.zipcode),
    country: emptyToNull(data.country),
    phone2: emptyToNull(data.phone2),
    fax: emptyToNull(data.fax),
    paying_customer_name: emptyToNull(data.payingCustomerName),
    currency: data.currency?.trim() || 'ILS',
    rivhit_project_ref: emptyToNull(data.rivhitProjectRef),
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
  if (data.salesAgentUserId !== undefined) {
    patch.sales_agent_user_id = emptyToNull(data.salesAgentUserId)
  }
  if (data.legalName !== undefined) patch.legal_name = emptyToNull(data.legalName)
  if (data.taxId !== undefined) patch.tax_id = emptyToNull(data.taxId)
  if (data.idNumber !== undefined) patch.id_number = emptyToNull(data.idNumber)
  if (data.foreignId !== undefined) patch.foreign_id = emptyToNull(data.foreignId)
  if (data.addressLine !== undefined) patch.address_line = emptyToNull(data.addressLine)
  if (data.city !== undefined) patch.city = emptyToNull(data.city)
  if (data.zipcode !== undefined) patch.zipcode = emptyToNull(data.zipcode)
  if (data.country !== undefined) patch.country = emptyToNull(data.country)
  if (data.phone2 !== undefined) patch.phone2 = emptyToNull(data.phone2)
  if (data.fax !== undefined) patch.fax = emptyToNull(data.fax)
  if (data.payingCustomerName !== undefined) {
    patch.paying_customer_name = emptyToNull(data.payingCustomerName)
  }
  if (data.currency !== undefined) patch.currency = data.currency.trim() || 'ILS'
  if (data.rivhitProjectRef !== undefined) {
    patch.rivhit_project_ref = emptyToNull(data.rivhitProjectRef)
  }
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
        let created = rowToClient(row as Record<string, unknown>)
        setClients((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]))

        // דחיפה אוטומטית לריווחית (Customer.New) + שמירת rivhit_customer_id
        try {
          const riv = await ensureRivhitCustomer(created.id)
          created = { ...created, rivhitCustomerId: riv.rivhitCustomerId }
          setClients((prev) =>
            prev.map((c) =>
              c.id === created.id ? { ...c, rivhitCustomerId: riv.rivhitCustomerId } : c,
            ),
          )
          toastFsSuccess(
            riv.created
              ? `הלקוח נוסף ונוצר בריווחית (#${riv.rivhitCustomerId})`
              : `הלקוח נוסף · כבר מקושר לריווחית (#${riv.rivhitCustomerId})`,
          )
        } catch (e) {
          const msg =
            e instanceof ApiError
              ? e.message
              : e instanceof Error
                ? e.message
                : 'סנכרון לריווחית נכשל'
          toastFsError(
            `הלקוח נשמר ב-Beo, אבל לא נוצר בריווחית: ${msg}`,
            e,
            'addClient.rivhit',
          )
        }
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

        // לקוחות ישנים בלי כרטיס ריווחית — נוצרים בעדכון הראשון
        try {
          const riv = await ensureRivhitCustomer(id)
          setClients((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, rivhitCustomerId: riv.rivhitCustomerId } : c,
            ),
          )
          toastFsSuccess(
            riv.created
              ? `פרטי הלקוח עודכנו ונוצר בריווחית (#${riv.rivhitCustomerId})`
              : 'פרטי הלקוח עודכנו',
          )
        } catch (e) {
          toastFsError(
            'פרטי הלקוח עודכנו ב-Beo, אבל יצירה בריווחית נכשלה',
            e,
            'updateClient.rivhit',
          )
        }
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
