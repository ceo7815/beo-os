import { useMemo, useState } from 'react'
import { useClients } from '../../hooks/useClients'
import { useDeals } from '../../hooks/useDeals'
import { useInvoices, type InvoicePatchInput } from '../../hooks/useInvoices'
import { toastFsError } from '../../lib/fsToast'
import { paidInvoiceYmd } from '../../lib/agentRevenue'
import { DealPaymentScheduleEditor } from './DealPaymentScheduleEditor'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import type { Deal, DealKind, DealStatus, Invoice } from '../../types'
import { ConfirmDialog } from '../shared/ConfirmDialog'
import { AdminDealOnboardingWizard } from './AdminDealOnboardingWizard'

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: n % 1 === 0 ? 0 : 1,
  }).format(n)

function dealKindHe(k: DealKind, isHosting?: boolean): string {
  if (isHosting) return 'אחסון'
  if (k === 'retainer_yearly') return 'ריטיינר שנתי'
  if (k === 'one_time') return 'חד־פעמי'
  return 'ריטיינר חודשי'
}

function dealStatusHe(s: DealStatus): string {
  if (s === 'completed') return 'הושלמה'
  if (s === 'cancelled') return 'בוטלה'
  return 'פעילה'
}

function DealScheduleFields({
  deal,
  updateDeal,
}: {
  deal: Deal
  updateDeal: ReturnType<typeof useDeals>['updateDeal']
}) {
  return (
    <DealPaymentScheduleEditor
      compact
      dealKind={deal.dealKind}
      isHostingDeal={deal.isHostingDeal}
      agreedAmountHint={deal.agreedAmount != null ? String(deal.agreedAmount) : ''}
      initialDeal={deal}
      onSave={(payments, extra) => {
        void updateDeal(deal.id, {
          scheduledPayments: payments,
          ...(extra.firstPaymentYmd ? { firstPaymentYmd: extra.firstPaymentYmd } : {}),
          ...(extra.annualBillingYmd ? { annualBillingYmd: extra.annualBillingYmd } : {}),
          ...(extra.expectedPaymentYmd ? { expectedPaymentYmd: extra.expectedPaymentYmd } : {}),
        })
      }}
    />
  )
}

function DealPaymentRow({
  inv,
  patchInvoice,
  onDelete,
}: {
  inv: Invoice
  patchInvoice: (id: string, patch: InvoicePatchInput) => Promise<void>
  onDelete: () => void
}) {
  const [taxNo, setTaxNo] = useState(inv.invoiceNumber)
  const [amt, setAmt] = useState(String(inv.amount))
  const [pd, setPd] = useState(inv.paidDate ?? '')
  const [note, setNote] = useState(inv.note ?? '')

  const save = () => {
    const tax = taxNo.trim()
    if (!tax) {
      toastFsError('חובה לציין מספר חשבונית מס', new Error('missing tax invoice'), 'DealPaymentRow')
      return
    }
    const n = Number(amt.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      toastFsError('סכום כולל מע״מ חייב להיות מספר חיובי', new Error('invalid amount'), 'DealPaymentRow')
      return
    }
    const paid =
      pd.trim().slice(0, 10) ||
      inv.paidDate?.trim().slice(0, 10) ||
      new Date().toISOString().slice(0, 10)
    void patchInvoice(inv.id, {
      invoiceNumber: tax,
      amount: Math.round(n * 100) / 100,
      paidDate: paid,
      note: note.trim() || null,
      status: 'paid',
    })
  }

  return (
    <tr className="border-t border-[var(--border)]">
      <td className="px-3 py-2">
        <input
          value={taxNo}
          onChange={(e) => setTaxNo(e.target.value)}
          dir="ltr"
          placeholder="מס׳ חשבונית מס"
          className="min-w-[7rem] rounded border border-[var(--border-orange-soft)] bg-white px-1 py-0.5 text-sm font-mono"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          dir="ltr"
          className="w-24 rounded border border-[var(--border-orange-soft)] bg-white px-1 py-0.5 text-sm tabular-nums"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={pd}
          onChange={(e) => setPd(e.target.value)}
          dir="ltr"
          className="rounded border border-[var(--border-orange-soft)] bg-white px-1 py-0.5 text-sm"
        />
      </td>
      <td className="max-w-[220px] px-3 py-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="הערות"
          className="w-full rounded border border-[var(--border-orange-soft)] bg-white px-1 py-0.5 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="text-xs font-semibold text-[var(--blue-mid)] underline" onClick={save}>
            שמירה
          </button>
          <button type="button" className="text-xs text-[var(--danger)] underline" onClick={onDelete}>
            מחיקה
          </button>
        </div>
      </td>
    </tr>
  )
}

type Props = {
  agentUserId: string
  agentName: string
  /** בתוך כרטיס ראשי בדף סוכנים — ללא מסגרת כפולה */
  embedded?: boolean
  sectionBorder?: number
  onAgentAssigned?: (agentUserId: string) => void
}

export function AgentDealsPanel({
  agentUserId,
  agentName,
  embedded = false,
  sectionBorder = 3,
  onAgentAssigned,
}: Props) {
  const { clients } = useClients()
  const { deals, loading, updateDeal, deleteDeal } = useDeals()
  const { invoices, addInvoice, deleteInvoice, patchInvoice } = useInvoices()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [detailDealId, setDetailDealId] = useState<string | null>(null)
  const [deleteDealId, setDeleteDealId] = useState<string | null>(null)
  const [payTaxInvoice, setPayTaxInvoice] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payNote, setPayNote] = useState('')

  const agentClientIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of clients) {
      if ((c.salesAgentUserId ?? '').trim() === agentUserId) ids.add(c.id)
    }
    return ids
  }, [clients, agentUserId])

  const clientById = useMemo(() => {
    const m = new Map<string, (typeof clients)[0]>()
    for (const c of clients) {
      if (agentClientIds.has(c.id)) m.set(c.id, c)
    }
    return m
  }, [clients, agentClientIds])

  const agentDeals = useMemo(
    () =>
      deals.filter(
        (d) =>
          agentClientIds.has(d.clientId) ||
          (d.salesAgentUserId ?? '').trim() === agentUserId,
      ),
    [deals, agentClientIds, agentUserId],
  )

  const agentInvoices = useMemo(
    () => invoices.filter((i) => agentClientIds.has(i.clientId)),
    [invoices, agentClientIds],
  )

  const paidByDealId = useMemo(() => {
    const m = new Map<string, number>()
    for (const inv of agentInvoices) {
      if (!inv.dealId || inv.status !== 'paid') continue
      if (!paidInvoiceYmd(inv)) continue
      m.set(inv.dealId, (m.get(inv.dealId) ?? 0) + inv.amount)
    }
    return m
  }, [agentInvoices])

  type BusinessGroup = {
    clientId: string
    clientName: string
    deals: Deal[]
  }

  const businessGroups = useMemo((): BusinessGroup[] => {
    const dealsByClient = new Map<string, Deal[]>()
    for (const d of agentDeals) {
      const list = dealsByClient.get(d.clientId) ?? []
      list.push(d)
      dealsByClient.set(d.clientId, list)
    }

    const sortDeals = (list: Deal[]) =>
      [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const groups: BusinessGroup[] = []

    const agentClients = [...clientById.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'he'),
    )
    for (const c of agentClients) {
      groups.push({
        clientId: c.id,
        clientName: c.name,
        deals: sortDeals(dealsByClient.get(c.id) ?? []),
      })
      dealsByClient.delete(c.id)
    }

    for (const [clientId, deals] of dealsByClient) {
      const c = clients.find((x) => x.id === clientId)
      groups.push({
        clientId,
        clientName: c?.name ?? 'לקוח לא ידוע',
        deals: sortDeals(deals),
      })
    }

    return groups
  }, [agentDeals, clientById, clients])

  const detailDeal = detailDealId ? agentDeals.find((d) => d.id === detailDealId) ?? null : null
  const dealToDelete = deleteDealId ? agentDeals.find((d) => d.id === deleteDealId) ?? null : null
  const detailPayments = useMemo(() => {
    if (!detailDealId) return []
    return agentInvoices
      .filter((i) => i.dealId === detailDealId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [agentInvoices, detailDealId])

  const resetPayForm = () => {
    setPayTaxInvoice('')
    setPayAmount('')
    setPayDate(new Date().toISOString().slice(0, 10))
    setPayNote('')
  }

  const canSubmitPayment = () =>
    Boolean(payTaxInvoice.trim() && payAmount.trim())

  const submitPayment = async () => {
    if (!detailDeal) return
    const taxNo = payTaxInvoice.trim()
    if (!taxNo) {
      toastFsError('חובה לציין מספר חשבונית מס', new Error('missing tax invoice'), 'submitPayment')
      return
    }
    if (!payAmount.trim()) return
    const amt = Number(payAmount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) {
      toastFsError('סכום כולל מע״מ חייב להיות מספר חיובי', new Error('invalid amount'), 'submitPayment')
      return
    }
    await addInvoice({
      clientId: detailDeal.clientId,
      invoiceNumber: taxNo,
      amount: Math.round(amt * 100) / 100,
      dueDate: payDate.slice(0, 10),
      dealId: detailDeal.id,
      agentCommissionPercent: detailDeal.commissionPercent,
      initialStatus: 'paid',
      paidDate: payDate.slice(0, 10),
      note: payNote.trim() || undefined,
    })
    resetPayForm()
  }

  if (!agentUserId) {
    return (
      <p className="text-sm text-[var(--text-mid)]">בחרו סוכן מהטבלה למעלה כדי לנהל עסקאות ותשלומים.</p>
    )
  }

  const shellClass = embedded
    ? 'space-y-4'
    : `space-y-4 rounded-2xl p-4 md:p-6 ${hubSectionClass(sectionBorder)}`

  return (
    <section className={shellClass}>
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-[var(--text-dark)]">
            עסקאות ותקבולים — {agentName}
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-mid)]">
            העסקה = הסכם עם בעל העסק (הלקוח). רישום תקבול = כסף שהחברה קיבלה מהלקוח — מעביר
            בפורטל הסוכן מ<strong className="font-bold text-[var(--text-dark)]">הכנסה משוערת</strong> ל
            <strong className="font-bold text-[var(--text-dark)]"> כסף זמין</strong>. זה לא תשלום לסוכן.
          </p>
        </div>
        <button
          type="button"
          className="hub-btn-primary shrink-0 rounded-xl px-4 py-2 text-xs font-bold"
          onClick={() => setWizardOpen(true)}
        >
          + עסק ועסקה
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-mid)]">טוען עסקאות…</p>
      ) : businessGroups.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">
          אין עסקים משויכים לסוכן זה. התחילו ב«+ עסק ועסקה».
        </p>
      ) : (
        <div className="space-y-4" aria-label="עסקים ועסקאות לסוכן">
          {businessGroups.map((group) => (
            <div
              key={group.clientId}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-white/95"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5">
                <h3 className="text-sm font-extrabold text-[var(--text-dark)]">{group.clientName}</h3>
                <span className="text-[10px] font-bold text-[var(--text-mid)]">
                  {group.deals.length === 0
                    ? 'אין עסקאות'
                    : `${group.deals.length} עסקאות`}
                </span>
              </div>
              {group.deals.length === 0 ? (
                <p className="px-4 py-3 text-[11px] text-[var(--text-mid)]">
                  עדיין לא נוצרה עסקה לעסק זה.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead className="bg-white text-[11px] font-bold text-[var(--text-light)]">
                      <tr>
                        <th className="px-3 py-2 text-right">עסקה</th>
                        <th className="px-3 py-2 text-right">סוג</th>
                        <th className="px-3 py-2 text-right">עמלה %</th>
                        <th className="px-3 py-2 text-right">מוסכם</th>
                        <th className="px-3 py-2 text-right">התקבל מהלקוח</th>
                        <th className="px-3 py-2 text-right">סטטוס</th>
                        <th className="px-3 py-2 text-right">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.deals.map((d) => {
                        const paid = paidByDealId.get(d.id) ?? 0
                        return (
                          <tr key={d.id} className="border-t border-[var(--border)]">
                            <td className="px-3 py-2 font-semibold text-[var(--text-dark)]">
                              {d.title}
                            </td>
                            <td className="px-3 py-2">{dealKindHe(d.dealKind, d.isHostingDeal)}</td>
                            <td className="px-3 py-2 tabular-nums">{d.commissionPercent}%</td>
                            <td className="px-3 py-2 tabular-nums">
                              {typeof d.agreedAmount === 'number' ? ils(d.agreedAmount) : '—'}
                            </td>
                            <td className="px-3 py-2 font-semibold tabular-nums text-[#059669]">
                              {ils(paid)}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={d.status}
                                onChange={(e) =>
                                  void updateDeal(d.id, { status: e.target.value as DealStatus })
                                }
                                className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1 text-xs"
                              >
                                <option value="active">פעילה</option>
                                <option value="completed">הושלמה</option>
                                <option value="cancelled">בוטלה</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold hover:bg-[var(--surface-muted)]"
                                  onClick={() => {
                                    setDetailDealId(d.id)
                                    resetPayForm()
                                  }}
                                >
                                  תקבולים
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-[var(--danger)]/30 bg-white px-2 py-1 text-xs font-semibold text-[var(--danger)] hover:bg-red-50"
                                  onClick={() => setDeleteDealId(d.id)}
                                >
                                  מחיקה
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteDealId !== null}
        onClose={() => setDeleteDealId(null)}
        onConfirm={() => {
          if (!deleteDealId) return
          if (detailDealId === deleteDealId) {
            setDetailDealId(null)
            resetPayForm()
          }
          void deleteDeal(deleteDealId)
        }}
        message={
          dealToDelete
            ? `למחוק את העסקה «${dealToDelete.title}»? יימחקו גם כל התקבולים הרשומים עליה — והיא תיעלם מפורטל הסוכן ${agentName}.`
            : 'למחוק עסקה זו?'
        }
      />

      {detailDeal ? (
        <div className={`mt-4 rounded-xl border border-[var(--border-orange-soft)] p-4 ${hubSectionClass(sectionBorder + 1)}`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[var(--text-dark)]">
                תקבולים מהלקוח — {detailDeal.title}
              </h3>
              <p className="text-[11px] leading-relaxed text-[var(--text-mid)]">
                {dealKindHe(detailDeal.dealKind, detailDeal.isHostingDeal)} · עמלת סוכן {detailDeal.commissionPercent}% על הסכום ·{' '}
                {dealStatusHe(detailDeal.status)}. כל תקבול מקדם את «כסף זמין» בפורטל הסוכן.
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-[var(--text-mid)] underline"
              onClick={() => setDetailDealId(null)}
            >
              סגירה
            </button>
          </div>
          <DealScheduleFields deal={detailDeal} updateDeal={updateDeal} />
          <div className="mb-3 grid gap-3 rounded-lg bg-[var(--orange-light)]/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 sm:col-span-2 lg:col-span-1">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">מספר חשבונית מס *</span>
              <input
                value={payTaxInvoice}
                onChange={(e) => setPayTaxInvoice(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-white px-2 py-1.5 text-sm font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">סכום כולל מע״מ (₪) *</span>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-white px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">תאריך התקבול</span>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                dir="ltr"
                className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 sm:col-span-2 lg:col-span-4">
              <span className="text-[10px] font-bold text-[var(--text-mid)]">הערות</span>
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-orange-soft)] bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!canSubmitPayment()}
              className="hub-btn-primary rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40 sm:col-span-2 lg:col-span-4"
              onClick={() => void submitPayment()}
            >
              רישום תקבול מהלקוח
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-light)]">
                <tr>
                  <th className="px-2 py-2 text-right">מספר חשבונית מס</th>
                  <th className="px-2 py-2 text-right">סכום כולל מע״מ</th>
                  <th className="px-2 py-2 text-right">תאריך</th>
                  <th className="px-2 py-2 text-right">הערות</th>
                  <th className="px-2 py-2 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {detailPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-[var(--text-mid)]">
                      אין תקבולים רשומים מהלקוח.
                    </td>
                  </tr>
                ) : (
                  detailPayments.map((inv) => (
                    <DealPaymentRow
                      key={`${inv.id}-${inv.amount}-${inv.paidDate ?? ''}`}
                      inv={inv}
                      patchInvoice={patchInvoice}
                      onDelete={() => {
                        if (
                          window.confirm(
                            'למחוק תקבול מהלקוח? הסכום יורד מ«כסף זמין» בפורטל הסוכן.',
                          )
                        ) {
                          void deleteInvoice(inv.id)
                        }
                      }}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <AdminDealOnboardingWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialAgentUserId={agentUserId}
        onAgentAssigned={onAgentAssigned}
      />
    </section>
  )
}
