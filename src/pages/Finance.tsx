import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FinanceTabs } from '../components/finance/FinanceTabs'
import { RivhitDocumentComposer } from '../components/finance/RivhitDocumentComposer'
import { Modal } from '../components/shared/Modal'
import { useClients } from '../hooks/useClients'
import { useHubStore } from '../store/useStore'
import { ApiError } from '../lib/apiClient'
import {
  cancelFinanceDocument,
  createTaxReceipt,
  createWorkOrder,
  DEFAULT_PAYMENT_TYPES,
  docKindLabel,
  docStatusLabel,
  ensureRivhitCustomer,
  fetchFinanceDocuments,
  fetchRivhitStatus,
  formatNisSimple,
  syncRivhitFromDate,
  type FinanceDocument,
  type RivhitStatus,
} from '../lib/rivhitFinanceApi'

type PageView = 'board' | 'collection'
type ComposerMode = 'work_order' | 'tax_receipt'

/**
 * מערכת מסמכים ריווחית — הזמנות עבודה, חשבוניות מס קבלה, גבייה ותצוגה.
 */
export function Finance() {
  const pushToast = useHubStore((s) => s.pushToast)
  const { clients } = useClients()
  const [view, setView] = useState<PageView>('board')
  const [composer, setComposer] = useState<ComposerMode | null>(null)
  const [status, setStatus] = useState<RivhitStatus | null>(null)
  const [docs, setDocs] = useState<FinanceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'work_order' | 'tax_receipt' | 'open'>('all')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [st, list] = await Promise.all([
        fetchRivhitStatus(),
        fetchFinanceDocuments(),
      ])
      setStatus(st)
      setDocs(list.items ?? [])
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'שגיאה בטעינה', 'error')
    } finally {
      setLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const paidAgainst = useCallback(
    (orderId: string) => {
      let paid = 0
      for (const d of docs) {
        if (d.parent_id !== orderId || d.status === 'cancelled') continue
        if (d.kind === 'tax_receipt') paid += Number(d.amount_nis)
        if (d.kind === 'credit_note') paid -= Number(d.amount_nis)
      }
      return Math.round(paid * 100) / 100
    },
    [docs],
  )

  const openOrders = useMemo(() => {
    return docs
      .filter((d) => d.kind === 'work_order' && (d.status === 'open' || d.status === 'partial'))
      .map((o) => {
        const paid = paidAgainst(o.id)
        const open = Math.round((Number(o.amount_nis) - paid) * 100) / 100
        return {
          id: o.id,
          clientId: o.client_id,
          openBalance: open,
          label: `#${o.rivhit_document_number ?? '—'} · ${o.title} · יתרה ${formatNisSimple(open)}`,
          doc: o,
          paid,
        }
      })
      .filter((o) => o.openBalance > 0.009)
  }, [docs, paidAgainst])

  const filteredDocs = useMemo(() => {
    if (filter === 'all') return docs
    if (filter === 'open') {
      return docs.filter(
        (d) => d.kind === 'work_order' && (d.status === 'open' || d.status === 'partial'),
      )
    }
    return docs.filter((d) => d.kind === filter)
  }, [docs, filter])

  const kpis = useMemo(() => {
    const openBal = openOrders.reduce((s, o) => s + o.openBalance, 0)
    const receipts = docs.filter((d) => d.kind === 'tax_receipt' && d.status !== 'cancelled')
    const receiptSum = receipts.reduce((s, d) => s + Number(d.amount_nis), 0)
    return {
      openCount: openOrders.length,
      openBal,
      receiptCount: receipts.length,
      receiptSum,
      docCount: docs.length,
    }
  }, [docs, openOrders])

  async function onCancel(id: string) {
    if (!window.confirm('לבטל את המסמך בריווחית? לחשבונית מס קבלה יופק זיכוי.')) return
    setBusy(true)
    try {
      await cancelFinanceDocument(id)
      pushToast('המסמך בוטל', 'success')
      await reload()
    } catch (e) {
      pushToast(e instanceof ApiError ? e.message : 'ביטול נכשל', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onSyncFromRivhit() {
    if (
      !window.confirm(
        'למשוך מריווחית ל־Beo OS את כל הלקוחות, הזמנות העבודה וחשבוניות המס-קבלה מתאריך 15/08/2026?',
      )
    ) {
      return
    }
    setSyncing(true)
    try {
      const res = await syncRivhitFromDate('15/08/2026')
      const r = res.result
      pushToast(
        `סנכרון הושלם · לקוחות ${r.customers.created + r.customers.updated}/${r.customers.fetched} · הזמנות ${r.workOrders.created + r.workOrders.updated}/${r.workOrders.fetched} · חשבוניות ${r.taxReceipts.created + r.taxReceipts.updated}/${r.taxReceipts.fetched}`,
        'success',
      )
      if (r.errors.length) {
        pushToast(`${r.errors.length} אזהרות בסנכרון — בדקו בקונסול`, 'error')
        console.warn('rivhit sync errors', r.errors)
      }
      await reload()
    } catch (e) {
      pushToast(e instanceof ApiError ? e.message : 'סנכרון נכשל', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const ready = Boolean(status?.configured)
  const paymentTypes = status?.paymentTypes?.length
    ? status.paymentTypes
    : DEFAULT_PAYMENT_TYPES

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-16 sm:p-6" dir="rtl">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-[var(--text-dark)]">
              פיננסים · מערכת מסמכים
            </h1>
            <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-[var(--text-mid)]">
              הזמנת עבודה → גבייה בחשבונית מס קבלה (חלקית/מלאה) → PDF וביטול/זיכוי — הכל מתוך Beo
              OS, מסונכרן לריווחית.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setComposer('work_order')}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white"
            >
              + הזמנת עבודה
            </button>
            <button
              type="button"
              onClick={() => setComposer('tax_receipt')}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-[13px] font-bold text-white"
            >
              + חשבונית מס קבלה
            </button>
            <button
              type="button"
              disabled={syncing || !ready}
              onClick={() => void onSyncFromRivhit()}
              className="rounded-xl border border-emerald-700 bg-emerald-50 px-4 py-2 text-[13px] font-bold text-emerald-900 disabled:opacity-50"
            >
              {syncing ? 'מסנכרן…' : 'סנכרון מריווחית מ־15.08.2026'}
            </button>
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-[13px] font-semibold"
            >
              רענון
            </button>
          </div>
        </div>
        <FinanceTabs />
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${
              loading
                ? 'bg-black/[0.04] text-[var(--text-mid)]'
                : ready
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900'
            }`}
          >
            ריווחית:{' '}
            {loading ? 'בודק…' : ready ? 'מחוברת' : 'לא מחוברת'}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${
              loading
                ? 'bg-black/[0.04] text-[var(--text-mid)]'
                : status?.supabaseServiceRole || status?.supabaseUserDb
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900'
            }`}
          >
            סופאבייס:{' '}
            {loading
              ? 'בודק…'
              : status?.supabaseServiceRole || status?.supabaseUserDb
                ? 'מוכן'
                : 'לא זמין'}
          </span>
          {status?.types ? (
            <span className="text-[12px] text-[var(--text-mid)]">
              סוגי מסמך · הזמנה {status.types.workOrder} · מס-קבלה {status.types.taxReceipt} ·
              זיכוי {status.types.creditNote}
            </span>
          ) : null}
        </div>
        {status?.typeError ? (
          <p className="mt-2 text-[13px] text-amber-800">{status.typeError}</p>
        ) : null}
        {!loading && status === null ? (
          <p className="mt-2 text-[13px] text-amber-800">
            לא הצלחנו לקרוא סטטוס מהשרת — ודאו שה־API רץ על פורט 8790 ורעננו את הדף.
          </p>
        ) : null}
        {!loading && status && !ready ? (
          <p className="mt-2 text-[13px] text-[var(--text-mid)]">
            מפתח ריווחית לא נטען בשרת. ודאו שיש{' '}
            <code className="rounded bg-black/5 px-1">RIVHIT_API_TOKEN</code> ב־
            <code className="rounded bg-black/5 px-1">server/.env.local</code> והפעילו מחדש את
            ה־API.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'מסמכים', value: String(kpis.docCount) },
          { label: 'פתוח לגבייה', value: String(kpis.openCount) },
          { label: 'יתרת גבייה', value: formatNisSimple(kpis.openBal) },
          { label: 'חשבוניות שהופקו', value: formatNisSimple(kpis.receiptSum) },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 shadow-sm"
          >
            <div className="text-[12px] font-bold text-[var(--text-mid)]">{k.label}</div>
            <div className="mt-1 text-[18px] font-extrabold text-[var(--text-dark)]">{k.value}</div>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-1 rounded-2xl border border-[var(--border)] bg-white p-1.5">
        {(
          [
            ['board', 'כל המסמכים'],
            ['collection', 'גבייה'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-xl px-3 py-2 text-[13px] font-bold transition ${
              view === id && !composer
                ? 'bg-[var(--brand)] text-white'
                : 'text-[var(--text-mid)] hover:bg-black/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setComposer('work_order')}
          className={`rounded-xl px-3 py-2 text-[13px] font-bold transition ${
            composer === 'work_order'
              ? 'bg-[var(--brand)] text-white'
              : 'text-[var(--text-mid)] hover:bg-black/[0.04]'
          }`}
        >
          הזמנת עבודה
        </button>
        <button
          type="button"
          onClick={() => setComposer('tax_receipt')}
          className={`rounded-xl px-3 py-2 text-[13px] font-bold transition ${
            composer === 'tax_receipt'
              ? 'bg-emerald-700 text-white'
              : 'text-[var(--text-mid)] hover:bg-black/[0.04]'
          }`}
        >
          חשבונית מס קבלה
        </button>
      </nav>

      <Modal
        isOpen={composer === 'work_order'}
        onClose={() => setComposer(null)}
        title="הפקת הזמנת עבודה"
        size="full"
        hideTitle
        bodyClassName="overflow-y-auto"
      >
        <RivhitDocumentComposer
          key="work_order"
          mode="work_order"
          clients={clients}
          paymentTypes={paymentTypes}
          busy={busy}
          disabled={!ready}
          onError={(m) => pushToast(m, 'error')}
          onSubmit={async (payload) => {
            setBusy(true)
            try {
              await ensureRivhitCustomer(payload.clientId)
              await createWorkOrder({
                clientId: payload.clientId,
                title: payload.title,
                notes: payload.notes,
                lines: payload.lines,
                dueDate: payload.dueDate,
                issueDate: payload.issueDate,
                orderRef: payload.orderRef,
                reference: payload.reference,
                discountValue: payload.discountValue,
                priceIncludeVat: payload.priceIncludeVat,
                language: payload.language,
                sendMail: payload.sendMail,
                firstName: payload.firstName,
                address: payload.address,
                city: payload.city,
                zipcode: payload.zipcode,
                phone: payload.phone,
              })
              pushToast('הזמנת עבודה הופקה בריווחית', 'success')
              setComposer(null)
              setView('board')
              await reload()
            } catch (e) {
              pushToast(e instanceof ApiError ? e.message : 'הפקה נכשלה', 'error')
            } finally {
              setBusy(false)
            }
          }}
        />
      </Modal>

      <Modal
        isOpen={composer === 'tax_receipt'}
        onClose={() => setComposer(null)}
        title="הפקת חשבונית מס קבלה"
        size="full"
        hideTitle
        bodyClassName="overflow-y-auto"
      >
        <RivhitDocumentComposer
          key="tax_receipt"
          mode="tax_receipt"
          clients={clients}
          paymentTypes={paymentTypes}
          workOrderOptions={openOrders}
          busy={busy}
          disabled={!ready}
          onError={(m) => pushToast(m, 'error')}
          onSubmit={async (payload) => {
            if (!payload.workOrderId) return
            setBusy(true)
            try {
              await createTaxReceipt({
                workOrderId: payload.workOrderId,
                notes: payload.notes,
                lines: payload.lines,
                payments: payload.payments,
                dueDate: payload.dueDate,
                issueDate: payload.issueDate,
                orderRef: payload.orderRef,
                reference: payload.reference,
                discountValue: payload.discountValue,
                priceIncludeVat: payload.priceIncludeVat,
                language: payload.language,
                sendMail: payload.sendMail,
              })
              pushToast('חשבונית מס קבלה הופקה', 'success')
              setComposer(null)
              setView('collection')
              await reload()
            } catch (e) {
              pushToast(e instanceof ApiError ? e.message : 'הפקה נכשלה', 'error')
            } finally {
              setBusy(false)
            }
          }}
        />
      </Modal>

      {view === 'collection' ? (
        <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold">גבייה · הזמנות פתוחות</h2>
              <p className="mt-1 text-[13px] text-[var(--text-mid)]">
                כל הזמנת עבודה עם יתרה — הפקת חשבונית מס קבלה מלאה או חלקית.
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-emerald-700 px-4 py-2 text-[13px] font-bold text-white"
              onClick={() => setComposer('tax_receipt')}
            >
              הפק חשבונית מס קבלה
            </button>
          </div>
          {openOrders.length === 0 ? (
            <p className="mt-4 text-[13px] text-[var(--text-mid)]">אין הזמנות פתוחות לגבייה.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[700px] text-right text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-mid)]">
                    <th className="px-2 py-2 font-bold">מס׳</th>
                    <th className="px-2 py-2 font-bold">לקוח</th>
                    <th className="px-2 py-2 font-bold">כותרת</th>
                    <th className="px-2 py-2 font-bold">סכום הזמנה</th>
                    <th className="px-2 py-2 font-bold">נגבה</th>
                    <th className="px-2 py-2 font-bold">יתרה</th>
                    <th className="px-2 py-2 font-bold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {openOrders.map((o) => (
                    <tr key={o.id} className="border-b border-[var(--border)]/70">
                      <td className="px-2 py-2.5 font-semibold">
                        #{o.doc.rivhit_document_number ?? '—'}
                      </td>
                      <td className="px-2 py-2.5">{o.doc.clients?.name ?? '—'}</td>
                      <td className="px-2 py-2.5">{o.doc.title}</td>
                      <td className="px-2 py-2.5">{formatNisSimple(Number(o.doc.amount_nis))}</td>
                      <td className="px-2 py-2.5">{formatNisSimple(o.paid)}</td>
                      <td className="px-2 py-2.5 font-extrabold text-amber-800">
                        {formatNisSimple(o.openBalance)}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          {o.doc.rivhit_document_link ? (
                            <a
                              href={o.doc.rivhit_document_link}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-[var(--brand)] hover:underline"
                            >
                              תצוגה / PDF
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="font-bold text-emerald-700 hover:underline"
                            onClick={() => setComposer('tax_receipt')}
                          >
                            גבייה
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === 'board' ? (
        <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-extrabold">יומן מסמכים</h2>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['all', 'הכל'],
                  ['open', 'פתוח לגבייה'],
                  ['work_order', 'הזמנות'],
                  ['tax_receipt', 'חשבוניות'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${
                    filter === id
                      ? 'bg-[var(--brand-light)] text-[var(--brand-deep)]'
                      : 'text-[var(--text-mid)] hover:bg-black/[0.04]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-2 text-[12px] text-[var(--text-light)]">
            לקוחות חדשים מ־
            <Link to="/clients" className="font-bold text-[var(--brand)] hover:underline">
              מסך לקוחות
            </Link>
            .
          </p>

          {loading ? (
            <p className="mt-4 text-[13px] text-[var(--text-mid)]">טוען…</p>
          ) : filteredDocs.length === 0 ? (
            <p className="mt-4 text-[13px] text-[var(--text-mid)]">
              עדיין אין מסמכים. התחילו מהזמנת עבודה.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[860px] text-right text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-mid)]">
                    <th className="px-2 py-2 font-bold">סוג</th>
                    <th className="px-2 py-2 font-bold">לקוח</th>
                    <th className="px-2 py-2 font-bold">כותרת</th>
                    <th className="px-2 py-2 font-bold">מס׳</th>
                    <th className="px-2 py-2 font-bold">לפני מע״מ</th>
                    <th className="px-2 py-2 font-bold">סה״כ</th>
                    <th className="px-2 py-2 font-bold">סטטוס</th>
                    <th className="px-2 py-2 font-bold">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d) => (
                    <tr key={d.id} className="border-b border-[var(--border)]/70">
                      <td className="px-2 py-2.5 font-semibold">{docKindLabel(d.kind)}</td>
                      <td className="px-2 py-2.5">{d.clients?.name ?? '—'}</td>
                      <td className="px-2 py-2.5">{d.title}</td>
                      <td className="px-2 py-2.5">{d.rivhit_document_number ?? '—'}</td>
                      <td className="px-2 py-2.5">
                        {d.amount_before_vat != null
                          ? formatNisSimple(Number(d.amount_before_vat))
                          : '—'}
                      </td>
                      <td className="px-2 py-2.5 font-bold">
                        {formatNisSimple(Number(d.amount_nis))}
                      </td>
                      <td className="px-2 py-2.5">{docStatusLabel(d.status)}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          {d.rivhit_document_link ? (
                            <a
                              href={d.rivhit_document_link}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-[var(--brand)] hover:underline"
                            >
                              תצוגה / הורדה
                            </a>
                          ) : null}
                          {d.status !== 'cancelled' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onCancel(d.id)}
                              className="font-bold text-red-600 hover:underline disabled:opacity-50"
                            >
                              בטל
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
