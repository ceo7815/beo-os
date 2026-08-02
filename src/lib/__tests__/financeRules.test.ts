import { describe, expect, it } from 'vitest'
import type {
  FinanceExpense,
  FinanceExpenseTypeDef,
  FinanceIncome,
} from '../../types'
import { computeSummary, expandIncomesForFilters } from '../financeCalc'
import type { FinanceFilters } from '../financeCalc'
import { BUILTIN_FINANCE_EXPENSE_TYPES } from '../financeExpenseTypes'
import { deriveExpensePnlMonth } from '../financeExpensePnl'
import {
  expenseAccrualMonth,
  isSalaryLikeExpense,
  isTaxExpense,
  isVatRemittanceExpense,
} from '../financeSalaryMonth'
import { calcVatFromGross } from '../israeliVat'

const TYPES: FinanceExpenseTypeDef[] = BUILTIN_FINANCE_EXPENSE_TYPES

function income(over: Partial<FinanceIncome> = {}): FinanceIncome {
  return {
    id: 'inc-1',
    projectId: '',
    clientId: 'client-1',
    amount: 1180,
    amountIncludesVat: true,
    documentKind: 'tax_invoice',
    invoiceNumber: '100',
    invoiceDate: '2026-07-15',
    status: 'paid',
    paidDate: '2026-07-15',
    createdAt: '2026-07-15T00:00:00.000Z',
    source: 'green_invoice',
    ...over,
  }
}

function expense(over: Partial<FinanceExpense> = {}): FinanceExpense {
  return {
    id: 'exp-1',
    type: 'supplier',
    amount: 590,
    amountIncludesVat: true,
    vatClass: 'vat_liable',
    recurring: false,
    billingMonth: '2026-07',
    paidDate: '2026-07-10',
    bankRef: 'bank-ref-1',
    source: 'bank_import',
    createdAt: '2026-07-10T00:00:00.000Z',
    ...over,
  }
}

function filters(over: Partial<FinanceFilters> = {}): FinanceFilters {
  return { ymFrom: '2026-07', ymTo: '2026-07', projectId: '', clientId: '', ...over }
}

function summaryOf(incomes: FinanceIncome[], expenses: FinanceExpense[], f = filters()) {
  return computeSummary(incomes, expenses, f, new Set<string>(), TYPES)
}

describe('חוק: תאריך החשבונית קובע לאיזה חודש ההוצאה נספרת', () => {
  // תשלום שיצא ב-5 באוגוסט עבור חשבונית מ-31 ביולי הוא הוצאה של יולי
  const late = expense({
    billingMonth: '2026-08',
    paidDate: '2026-08-05',
    documentDate: '2026-07-31',
    documentMonth: '2026-07',
    pnlMonth: '2026-07',
  })

  it('ההוצאה נספרת בחודש החשבונית', () => {
    const s = summaryOf([], [late], filters({ ymFrom: '2026-07', ymTo: '2026-07' }))
    expect(s.expenseNetTotal).toBeGreaterThan(0)
  })

  it('ההוצאה אינה נספרת בחודש התשלום', () => {
    const s = summaryOf([], [late], filters({ ymFrom: '2026-08', ymTo: '2026-08' }))
    expect(s.expenseNetTotal).toBe(0)
  })

  it('המע״מ בתשומות נזקף לחודש החשבונית', () => {
    const july = summaryOf([], [late], filters({ ymFrom: '2026-07', ymTo: '2026-07' }))
    const august = summaryOf([], [late], filters({ ymFrom: '2026-08', ymTo: '2026-08' }))
    expect(july.expenseVat).toBeGreaterThan(0)
    expect(august.expenseVat).toBe(0)
  })

  it('בלי תאריך חשבונית ההוצאה נשארת בחודש התשלום', () => {
    const plain = expense({ billingMonth: '2026-08', paidDate: '2026-08-05' })
    const s = summaryOf([], [plain], filters({ ymFrom: '2026-08', ymTo: '2026-08' }))
    expect(s.expenseNetTotal).toBeGreaterThan(0)
  })
})

describe('מע״מ ישראלי', () => {
  it('מפרק סכום ברוטו לנטו ומע״מ לפי 18%', () => {
    const b = calcVatFromGross(1180)
    expect(b.vat).toBe(180)
    expect(b.net).toBe(1000)
  })
})

describe('חוק: רווח = הכנסות נטו פחות הוצאות נטו', () => {
  it('הרווח שווה להפרש הנטו, והמע״מ אינו חלק ממנו', () => {
    const s = summaryOf([income({ amount: 11800 })], [expense({ amount: 5900 })])

    expect(s.incomeNet).toBe(10000)
    expect(s.expenseNetTotal).toBe(5000)
    expect(s.trueNetProfit).toBe(5000)
  })

  it('הוצאה ללא מע״מ תשומות נספרת במלואה', () => {
    const s = summaryOf(
      [income({ amount: 11800 })],
      [expense({ amount: 1000, vatClass: 'statutory' })],
    )

    expect(s.expenseNetTotal).toBe(1000)
    expect(s.trueNetProfit).toBe(9000)
  })

  it('תשלום מע״מ לרשות לא נגרע מהרווח (אין כפל מע״מ)', () => {
    const remittance = expense({
      id: 'vat-pay',
      type: 'tax',
      name: 'תשלום מע״מ רשות המסים',
      amount: 1800,
      vatClass: 'statutory',
      bankRef: 'bank-vat-1',
      pnlMonth: '2026-07',
    })
    expect(isVatRemittanceExpense(remittance)).toBe(true)

    const s = summaryOf(
      [income({ amount: 11800 })],
      [expense({ amount: 5900 }), remittance],
    )

    // רווח כמו בלי התשלום לרשות: 10000 − 5000
    expect(s.trueNetProfit).toBe(5000)
    expect(s.vatPayable).toBe(900)
    expect(s.vatRemittanceExcluded).toBe(1800)
    expect(s.expenseNetTotal).toBe(5000)
  })

  it('ביטוח לאומי נשאר ברווח — אינו תשלום מע״מ', () => {
    const bl = expense({
      id: 'bl',
      type: 'tax',
      name: 'ביטוח לאומי',
      amount: 2000,
      vatClass: 'statutory',
      bankRef: 'bank-bl-1',
      pnlMonth: '2026-07',
    })
    expect(isVatRemittanceExpense(bl)).toBe(false)
    const s = summaryOf([income({ amount: 11800 })], [bl])
    expect(s.trueNetProfit).toBe(8000)
    expect(s.vatRemittanceExcluded).toBe(0)
  })
})

describe('חוק: מע״מ שלילי הוא החזר, לא אפס', () => {
  it('כשהתשומות גדולות מהעסקאות מוצג החזר שלילי', () => {
    const s = summaryOf(
      [income({ amount: 1180 })],
      [expense({ amount: 11800 })],
    )

    // עסקאות 180 · תשומות 1800 → החזר של 1620
    expect(s.vatPayable).toBe(-1620)
  })

  it('הרווח בחודש עם החזר אינו נפגע מהחזר המע״מ', () => {
    const s = summaryOf(
      [income({ amount: 1180 })],
      [expense({ amount: 11800 })],
    )

    // נטו 1000 פחות נטו 10000
    expect(s.trueNetProfit).toBe(-9000)
  })
})

describe('חוק: זיכוי על עסקה שבוטלה מקזז את ההוצאה ואת מע״מ התשומות', () => {
  it('הזיכוי מקטין את סך ההוצאות באותו חודש', () => {
    const withoutRefund = summaryOf(
      [income({ amount: 11800 })],
      [expense({ amount: 5900 })],
    )
    const withRefund = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({ amount: 5900 }),
        expense({ id: 'exp-2', amount: -1180, bankRef: 'bank-ref-2' }),
      ],
    )

    expect(withoutRefund.expenseNetTotal).toBe(5000)
    expect(withRefund.expenseNetTotal).toBe(4000)
    expect(withRefund.trueNetProfit).toBe(6000)
  })

  it('הזיכוי מחזיר גם את מע״מ התשומות שקוזז', () => {
    const s = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({ amount: 5900 }),
        expense({ id: 'exp-2', amount: -1180, bankRef: 'bank-ref-2' }),
      ],
    )

    // תשומות 900 פחות 180 שהוחזרו = 720; עסקאות 1800 → לתשלום 1080
    expect(s.vatPayable).toBe(1080)
  })

  it('זיכוי בסכום ההוצאה מאפס אותה לחלוטין', () => {
    const s = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({ amount: 5900 }),
        expense({ id: 'exp-2', amount: -5900, bankRef: 'bank-ref-2' }),
      ],
    )

    expect(s.expenseNetTotal).toBe(0)
    expect(s.trueNetProfit).toBe(10000)
  })

  it('הפירוק השמור אינו הופך את הזיכוי לתוספת מע״מ', () => {
    const s = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({ amount: 5900, vatAmount: 900, amountBeforeVat: 5000 }),
        expense({
          id: 'exp-2',
          amount: -1180,
          bankRef: 'bank-ref-2',
          // הפירוק נשמר תמיד חיובי, גם כשהסכום שלילי
          vatAmount: 180,
          amountBeforeVat: 1000,
        }),
      ],
    )

    expect(s.expenseNetTotal).toBe(4000)
    expect(s.vatPayable).toBe(1080)
  })

  it('זיכוי בחודש אחר אינו משפיע על החודש שבו בוצע החיוב', () => {
    const july = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({ amount: 5900 }),
        expense({
          id: 'exp-2',
          amount: -1180,
          bankRef: 'bank-ref-2',
          billingMonth: '2026-08',
          paidDate: '2026-08-03',
        }),
      ],
    )

    expect(july.expenseNetTotal).toBe(5000)
  })

  it('הזיכוי נספר בחודש שבו התקבל הכסף', () => {
    const august = summaryOf(
      [],
      [
        expense({ amount: 5900 }),
        expense({
          id: 'exp-2',
          amount: -1180,
          bankRef: 'bank-ref-2',
          billingMonth: '2026-08',
          paidDate: '2026-08-03',
        }),
      ],
      filters({ ymFrom: '2026-08', ymTo: '2026-08' }),
    )

    expect(august.expenseNetTotal).toBe(-1000)
  })

  it('בתקופה מצטברת הזיכוי מתקזז מול החיוב', () => {
    const both = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({ amount: 5900 }),
        expense({
          id: 'exp-2',
          amount: -1180,
          bankRef: 'bank-ref-2',
          billingMonth: '2026-08',
          paidDate: '2026-08-03',
        }),
      ],
      filters({ ymFrom: '2026-07', ymTo: '2026-08' }),
    )

    expect(both.expenseNetTotal).toBe(4000)
    expect(both.trueNetProfit).toBe(6000)
  })
})

describe('חוק: מסים נספרים בחודש שעבורו שולמו', () => {
  // הרשומות מבוססות על מה שנשמר בפועל בייבוא מכרטיס האשראי
  const TAX_ROWS = [
    { name: 'ביטוח לאומי רב ספק', amount: 3413, paidDate: '2026-07-14' },
    { name: 'מ"ה ניכויים אנטרנט', amount: 3043, paidDate: '2026-07-14' },
    { name: 'גביית מעמ אינטרנט שע"מ', amount: 6857, paidDate: '2026-07-16' },
    { name: 'נציבות מס הכנסה ומיסים', amount: 1446, paidDate: '2026-07-16' },
  ]

  it('מס ששולם ביולי שייך ליוני', () => {
    for (const row of TAX_ROWS) {
      const exp = expense({
        type: 'tax',
        name: row.name,
        amount: row.amount,
        billingMonth: '2026-07',
        documentMonth: '2026-07',
        paidDate: row.paidDate,
        vatClass: 'statutory',
      })

      expect(expenseAccrualMonth(exp)).toBe('2026-06')
    }
  })

  it('רשומות ישנות שנשמרו כהוצאה כללית מזוהות לפי שם הרשות', () => {
    const exp = expense({
      type: 'one_time',
      name: 'ביטוח לאומי רב ספק',
      billingMonth: '2026-07',
      documentMonth: '2026-07',
      paidDate: '2026-07-14',
      vatClass: 'statutory',
    })

    expect(isTaxExpense(exp)).toBe(true)
    expect(expenseAccrualMonth(exp)).toBe('2026-06')
  })

  it('כל תשלומי המס של יולי נספרים ברווח והפסד של יוני', () => {
    const expenses = TAX_ROWS.map((row, i) =>
      expense({
        id: `tax-${i}`,
        type: 'tax',
        name: row.name,
        amount: row.amount,
        billingMonth: '2026-07',
        documentMonth: '2026-07',
        paidDate: row.paidDate,
        vatClass: 'statutory',
        bankRef: `cal:${row.paidDate}:${row.amount}`,
      }),
    )
    // גביית מע״מ יוצאת מהרווח (סילוק חוב); ביטוח לאומי / ניכויים / מס הכנסה נשארים
    const operatingTotal = TAX_ROWS.filter(
      (r) => !isVatRemittanceExpense({ name: r.name, type: 'tax', vatClass: 'statutory' }),
    ).reduce((s, r) => s + r.amount, 0)
    const vatRemit = TAX_ROWS.filter((r) =>
      isVatRemittanceExpense({ name: r.name, type: 'tax', vatClass: 'statutory' }),
    ).reduce((s, r) => s + r.amount, 0)

    const july = summaryOf([], expenses, filters())
    const june = summaryOf([], expenses, filters({ ymFrom: '2026-06', ymTo: '2026-06' }))

    expect(july.expenseNetTotal).toBe(0)
    expect(june.expenseNetTotal).toBe(operatingTotal)
    expect(june.vatRemittanceExcluded).toBe(vatRemit)
  })

  it('מס אינו מקזז מע״מ תשומות', () => {
    const s = summaryOf(
      [income({ amount: 11800 })],
      [
        expense({
          type: 'tax',
          name: 'גביית מעמ אינטרנט שע"מ',
          amount: 6857,
          billingMonth: '2026-06',
          paidDate: '2026-06-16',
          vatClass: 'statutory',
        }),
      ],
      filters({ ymFrom: '2026-05', ymTo: '2026-05' }),
    )

    expect(s.vatPayable).toBe(0)
  })

  it('ספק רגיל בעל שם דומה אינו נכנס לכלל הצבירה', () => {
    const exp = expense({
      type: 'supplier',
      name: 'מעמד תאורה בע״מ',
      billingMonth: '2026-07',
      paidDate: '2026-07-14',
      vatClass: 'vat_liable',
    })

    expect(isTaxExpense(exp)).toBe(false)
    expect(expenseAccrualMonth(exp)).toBe('2026-07')
  })
})

describe('חוק: אין שכפול הכנסות ריטיינר', () => {
  it('הכנסה מיולי אינה מופיעה באוגוסט גם כשהיא מסומנת ריטיינר חודשי', () => {
    const rows = expandIncomesForFilters(
      [income({ invoiceDate: '2026-07-15', paidDate: '2026-07-15', monthlyRetainer: true })],
      filters({ ymFrom: '2026-08', ymTo: '2026-08' }),
      '2026-08-20',
    )

    expect(rows).toHaveLength(0)
  })

  it('הכנסה נספרת פעם אחת בלבד, בחודש המסמך שלה', () => {
    const rows = expandIncomesForFilters(
      [income({ invoiceDate: '2026-07-15', paidDate: '2026-07-15', monthlyRetainer: true })],
      filters({ ymFrom: '2026-07', ymTo: '2026-12' }),
      '2026-12-31',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].invoiceDate).toBe('2026-07-15')
  })
})

describe('חוק: משכורת נספרת בחודש שלפני התשלום', () => {
  it('משכורת ששולמה ביוני היא משכורת מאי', () => {
    const exp = expense({
      type: 'salary',
      employeeName: 'עובד לדוגמה',
      billingMonth: '2026-06',
      paidDate: '2026-06-09',
      vatClass: 'statutory',
    })

    expect(expenseAccrualMonth(exp)).toBe('2026-05')
  })

  it('חודש מפורש בהערה גובר על ברירת המחדל', () => {
    const exp = expense({
      type: 'salary',
      description: 'משכורת 03/2026',
      billingMonth: '2026-06',
      paidDate: '2026-06-09',
      vatClass: 'statutory',
    })

    expect(expenseAccrualMonth(exp)).toBe('2026-03')
  })
})

describe('חוק: נעילת חודש הדיווח אינה מזיזה משכורת', () => {
  it('משכורת יוני ששולמה ביולי נספרת ביוני גם כשהחודש כבר נעול', () => {
    // כך נראית רשומה שיובאה מהבנק אחרי שיוני כבר דווח למע״מ
    const exp = expense({
      type: 'salary',
      employeeName: 'אמה חן',
      billingMonth: '2026-07',
      pnlMonth: '2026-07',
      documentMonth: '2026-06',
      isLateDocument: true,
      paidDate: '2026-07-07',
      vatClass: 'statutory',
    })

    expect(expenseAccrualMonth(exp)).toBe('2026-06')
  })

  it('המשכורת נספרת ברווח והפסד של חודש העבודה, לא של חודש התשלום', () => {
    const salary = expense({
      id: 'salary-1',
      type: 'salary',
      amount: 10871,
      employeeName: 'אמה חן',
      billingMonth: '2026-07',
      pnlMonth: '2026-07',
      documentMonth: '2026-06',
      isLateDocument: true,
      paidDate: '2026-07-07',
      vatClass: 'statutory',
      bankRef: 'osh:2026-07-07:1146',
    })

    const july = summaryOf([], [salary], filters())
    const june = summaryOf([], [salary], filters({ ymFrom: '2026-06', ymTo: '2026-06' }))

    expect(july.expenseNetTotal).toBe(0)
    expect(june.expenseNetTotal).toBe(10871)
  })

  it('משכורת שהמשתמש שייך ידנית לחודש מסוים אינה מוזזת', () => {
    const exp = expense({
      type: 'salary',
      employeeName: 'עובד לדוגמה',
      billingMonth: '2026-05',
      pnlMonth: '2026-05',
      paidDate: '2026-06-01',
      vatClass: 'statutory',
    })

    expect(expenseAccrualMonth(exp)).toBe('2026-05')
  })
})

describe('חוק: זיהוי משכורת לא תופס כל העברה בנקאית', () => {
  it('העברה רגילה לספק אינה מסווגת כמשכורת', () => {
    const exp = expense({
      type: 'supplier',
      supplierName: 'ספק כלשהו',
      description: 'העברה לספק עבור שירותי ענן',
    })

    expect(isSalaryLikeExpense(exp)).toBe(false)
  })

  it('העברה לספק נשארת בחודש שלה ואינה מוזזת אחורה', () => {
    const exp = expense({
      type: 'supplier',
      description: 'העברה לספק עבור שירותי ענן',
      billingMonth: '2026-07',
      paidDate: '2026-07-10',
    })

    expect(expenseAccrualMonth(exp)).toBe('2026-07')
  })

  it('הוצאה עם סוג משכורת עדיין מזוהה כמשכורת', () => {
    const exp = expense({ type: 'salary', vatClass: 'statutory' })

    expect(isSalaryLikeExpense(exp)).toBe(true)
  })
})

describe('חוק: הוצאה שהוזנה ידנית נספרת מיד', () => {
  it('הוצאה שנרשמה במערכת משפיעה על הרווח ללא שלב אישור', () => {
    const manual = expense({
      id: 'exp-manual',
      amount: 5900,
      source: 'manual',
      bankRef: undefined,
    })
    const s = summaryOf([income({ amount: 11800 })], [manual])

    expect(s.expenseNetTotal).toBe(5000)
    expect(s.trueNetProfit).toBe(5000)
  })

  it('חשבונית ספק נספרת בחודש המסמך גם לפני התשלום', () => {
    const unpaid = expense({
      id: 'exp-unpaid',
      amount: 1180,
      source: 'manual',
      billingMonth: '2026-07',
      paidDate: undefined,
      bankRef: undefined,
    })
    const s = summaryOf([], [unpaid], filters())

    expect(s.expenseNetTotal).toBe(1000)
  })
})

describe('חוק: הוצאה קבועה אינה מייצרת חיוב בחודש שטרם הוזן', () => {
  const august = filters({ ymFrom: '2026-08', ymTo: '2026-08' })

  it('מנוי חודשי ממאי אינו מופיע באוגוסט', () => {
    const s = summaryOf(
      [],
      [expense({ recurring: true, billingMonth: '2026-05', amount: 97.94 })],
      august,
    )

    expect(s.expenseNetTotal).toBe(0)
  })

  it('חודשים היסטוריים של אותו מנוי אינם מצטברים לחודש ריק', () => {
    const history = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map(
      (m, i) =>
        expense({
          id: `sub-${i}`,
          recurring: true,
          billingMonth: m,
          paidDate: `${m}-05`,
          amount: 97.94,
        }),
    )

    // חמש רשומות היסטוריות של אותו מנוי — אוגוסט חייב להישאר ריק
    expect(summaryOf([], history, august).expenseNetTotal).toBe(0)
  })

  it('ההוצאה כן נספרת בחודש שבו היא באמת נרשמה', () => {
    const s = summaryOf(
      [],
      [expense({ recurring: true, billingMonth: '2026-07', amount: 118 })],
      filters(),
    )

    expect(s.expenseNetTotal).toBe(100)
  })
})

describe('חוק: הוצאת פרויקט נשארת בחודש שלה', () => {
  it('הוצאה אינה מוזזת לחודש של הכנסה קודמת באותו פרויקט', () => {
    const inc = income({
      id: 'inc-feb',
      projectId: 'proj-1',
      invoiceDate: '2026-02-10',
      paidDate: '2026-02-10',
    })
    const exp = expense({ projectId: 'proj-1', billingMonth: '2026-07' })

    void inc
    expect(deriveExpensePnlMonth(exp)).toBe('2026-07')
  })
})
