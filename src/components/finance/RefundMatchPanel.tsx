import { useEffect, useMemo, useRef, useState } from 'react'
import { formatNis } from '../../lib/financeCalc'
import { formatDateIL } from '../../lib/dates'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { useFinanceExpenses } from '../../hooks/useFinanceExpenses'
import {
  isRefundExpense,
  listUnlinkedRefunds,
  pairConfidentRefunds,
  refundAmount,
  refundCandidates,
  refundStatusFor,
  suggestedRefundMatch,
} from '../../lib/expenseRefunds'
import type { FinanceExpense } from '../../types'

function labelOf(exp: FinanceExpense): string {
  return (
    exp.name?.replace(/^זיכוי\s*—\s*/, '').trim() ||
    exp.supplierName?.trim() ||
    exp.description?.trim() ||
    '—'
  )
}

function dateOf(exp: FinanceExpense): string {
  return exp.paidDate ?? exp.documentDate ?? `${exp.billingMonth}-01`
}

/**
 * שיוך זיכויים לחיובים שהם מבטלים.
 *
 * מוצג רק כשיש זיכוי לא משויך — אחרת זו עוד קופסה ריקה על המסך.
 */
export function RefundMatchPanel({
  ymFrom,
  ymTo,
}: {
  ymFrom: string
  ymTo: string
}) {
  const { expenses, updateExpense } = useFinanceExpenses()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const pending = useMemo(() => {
    return listUnlinkedRefunds(expenses).filter((r) => {
      const ym = dateOf(r).slice(0, 7)
      return ym >= ymFrom && ym <= ymTo
    })
  }, [expenses, ymFrom, ymTo])

  const linked = useMemo(
    () =>
      expenses.filter((e) => {
        if (!isRefundExpense(e) || !e.refundForExpenseId?.trim()) return false
        const ym = dateOf(e).slice(0, 7)
        return ym >= ymFrom && ym <= ymTo
      }),
    [expenses, ymFrom, ymTo],
  )

  const chargeById = useMemo(
    () => new Map(expenses.map((e) => [e.id, e])),
    [expenses],
  )

  /** שומר שיוכים בטוחים (כולל N↔N כמו כמה Wise) כדי שלא ידרשו חשבונית */
  const autoLinkKey = useRef('')
  useEffect(() => {
    const pairs = pairConfidentRefunds(expenses)
    if (pairs.size === 0) return
    const key = [...pairs.entries()]
      .map(([r, c]) => `${r}:${c}`)
      .sort()
      .join('|')
    if (key === autoLinkKey.current) return
    autoLinkKey.current = key
    void (async () => {
      for (const [refundId, chargeId] of pairs) {
        await updateExpense(refundId, { refundForExpenseId: chargeId })
      }
    })()
  }, [expenses, updateExpense])

  async function link(refund: FinanceExpense, chargeId: string) {
    setBusyId(refund.id)
    try {
      await updateExpense(refund.id, { refundForExpenseId: chargeId })
      setOpenFor(null)
    } finally {
      setBusyId(null)
    }
  }

  async function unlink(refund: FinanceExpense) {
    setBusyId(refund.id)
    try {
      await updateExpense(refund.id, { refundForExpenseId: null })
    } finally {
      setBusyId(null)
    }
  }

  if (pending.length === 0 && linked.length === 0) return null

  return (
    <section
      className={`min-w-0 rounded-2xl ${hubSectionClass(3)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]`}
    >
      <div className="mb-3 text-right">
        <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">
          זיכויים והחזרים
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)]">
          זיכוי על עסקה שבוטלה נשמר כתנועה נפרדת, בדיוק כמו בכרטיס. שיוך שלו
          לחיוב המקורי מראה שהצמד מתאפס, ומונע דרישת חשבונית על הוצאה שכבר בוטלה.
        </p>
      </div>

      {pending.length > 0 ? (
        <ul className="space-y-2">
          {pending.map((refund) => {
            const suggestion = suggestedRefundMatch(refund, expenses)
            const candidates = refundCandidates(refund, expenses)
            const isOpen = openFor === refund.id
            return (
              <li
                key={refund.id}
                className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[13px] font-bold text-[var(--text-dark)]">
                    {labelOf(refund)}
                  </span>
                  <span className="text-[13px] font-extrabold tabular-nums text-[#059669]">
                    {formatNis(refundAmount(refund))}
                  </span>
                  <span className="text-[11px] text-[var(--text-mid)]">
                    {formatDateIL(dateOf(refund))}
                  </span>
                  <div className="ms-auto flex flex-wrap gap-2">
                    {suggestion ? (
                      <button
                        type="button"
                        onClick={() => void link(refund, suggestion.charge.id)}
                        disabled={busyId === refund.id}
                        className="rounded-lg bg-[var(--orange)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                      >
                        התאם ל{labelOf(suggestion.charge)} ·{' '}
                        {formatNis(suggestion.charge.amount)}
                        {suggestion.nearAmount
                          ? ` (הפרש שער ${formatNis(Math.abs(suggestion.gap))})`
                          : ''}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOpenFor(isOpen ? null : refund.id)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
                    >
                      {isOpen ? 'סגור' : `בחר חיוב (${candidates.length})`}
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-2 space-y-1.5 border-t border-[#FDE68A] pt-2">
                    {candidates.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-mid)]">
                        לא נמצא חיוב מתאים באותו אמצעי תשלום ב-120 הימים שלפני
                        הזיכוי. ייתכן שהחיוב המקורי עדיין לא יובא.
                      </p>
                    ) : (
                      candidates.slice(0, 12).map((c) => (
                        <button
                          key={c.charge.id}
                          type="button"
                          onClick={() => void link(refund, c.charge.id)}
                          disabled={busyId === refund.id}
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-right transition hover:border-[var(--orange)] disabled:opacity-50"
                        >
                          <span className="text-[12px] font-semibold text-[var(--text-dark)]">
                            {labelOf(c.charge)}
                          </span>
                          <span className="text-[12px] font-bold tabular-nums text-[var(--text-dark)]">
                            {formatNis(c.charge.amount)}
                          </span>
                          <span className="text-[11px] text-[var(--text-mid)]">
                            {formatDateIL(dateOf(c.charge))}
                          </span>
                          <span className="ms-auto flex gap-1.5">
                            {c.exactAmount ? (
                              <span className="rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[10px] font-bold text-[#065F46]">
                                סכום זהה
                              </span>
                            ) : c.nearAmount ? (
                              <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E]">
                                הפרש שער {formatNis(Math.abs(c.gap))}
                              </span>
                            ) : null}
                            {c.sameMerchant ? (
                              <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-bold text-[#1E40AF]">
                                אותו ספק
                              </span>
                            ) : null}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {linked.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
          {linked.map((refund) => {
            const charge = chargeById.get(refund.refundForExpenseId!)
            const status = charge
              ? refundStatusFor(charge, expenses)
              : undefined
            return (
              <li
                key={refund.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--surface-muted)]/50 px-3 py-2"
              >
                <span className="text-[12px] font-semibold text-[var(--text-dark)]">
                  {labelOf(refund)}
                </span>
                <span className="text-[12px] font-bold tabular-nums text-[#059669]">
                  {formatNis(refundAmount(refund))}
                </span>
                <span className="text-[11px] text-[var(--text-mid)]">
                  {charge
                    ? `מקוזז מחיוב ${formatDateIL(dateOf(charge))} · ${formatNis(charge.amount)}`
                    : 'החיוב המקורי נמחק'}
                </span>
                {status ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      status.fully
                        ? 'bg-[#D1FAE5] text-[#065F46]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    {status.fully
                      ? 'בוטל במלואו'
                      : `נותר ${formatNis(status.remaining)}`}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void unlink(refund)}
                  disabled={busyId === refund.id}
                  className="ms-auto text-[11px] font-semibold text-[var(--text-mid)] underline disabled:opacity-50"
                >
                  בטל שיוך
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
