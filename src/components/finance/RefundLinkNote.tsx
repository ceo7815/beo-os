import { formatDateIL } from '../../lib/dates'
import { formatNis, monthLabelHe } from '../../lib/financeCalc'
import type { RefundLink } from '../../lib/expenseRefunds'
import type { FinanceExpense } from '../../types'

function counterpartDate(exp: FinanceExpense): string {
  return exp.paidDate ?? exp.documentDate ?? `${exp.billingMonth}-01`
}

function counterpartName(exp: FinanceExpense): string {
  const raw = exp.name ?? exp.supplierName ?? exp.description ?? ''
  return raw.replace(/^זיכוי\s*—\s*/, '').trim() || 'ללא שם'
}

/**
 * סימון מפורש של שני צדי ההתאמה בין זיכוי לחיוב.
 *
 * הצמד נשמר כשתי שורות נפרדות, ובלי הסימון הזה הזיכוי נראה כהוצאה שלילית
 * מנותקת והחיוב נראה כהוצאה שממתינה לחשבונית. הצגת הצד שממול עם התאריך
 * והחודש שלו הופכת את הצמד לשורה סגורה שאפשר לדלג עליה בעין.
 */
export function RefundLinkNote({ link }: { link: RefundLink }) {
  const other = link.counterparts[0]
  if (!other) return null

  const date = counterpartDate(other)
  const many = link.counterparts.length > 1

  return (
    <div
      className={
        link.fully
          ? 'rounded-lg border border-[#A7F3D0]/80 bg-[#ECFDF5]/80 px-2 py-1.5'
          : 'rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-2 py-1.5'
      }
    >
      <div className="flex items-center gap-1">
        <span
          className={`text-[10px] font-extrabold ${
            link.fully ? 'text-[#065F46]' : 'text-[#92400E]'
          }`}
        >
          {link.fully ? 'סגור בזיכוי · התאמה מלאה' : 'התאמת זיכוי חלקית'}
        </span>
      </div>
      <div
        className={`mt-0.5 text-[10px] leading-relaxed font-semibold ${
          link.fully ? 'text-[#047857]' : 'text-[#A16207]'
        }`}
      >
        {link.role === 'refund' ? 'מול הוצאה' : many ? 'מול זיכויים' : 'מול זיכוי'}{' '}
        {many ? (
          `${link.counterparts.length} רשומות`
        ) : (
          <>
            {counterpartName(other)} מ־{formatDateIL(date)}
          </>
        )}{' '}
        · {monthLabelHe(date.slice(0, 7))}
      </div>
      {!link.fully ? (
        <div className="mt-0.5 text-[10px] font-bold text-[#92400E]">
          נותרה יתרה {formatNis(link.remaining)} — דורשת חשבונית
        </div>
      ) : null}
    </div>
  )
}
