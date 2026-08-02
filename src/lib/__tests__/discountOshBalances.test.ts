import { describe, expect, it } from 'vitest'
import { discountOshParser } from '../bankImport/discountOshParser'
import { bankBalanceControl } from '../financeControls'

const HEADER = [
  'תאריך',
  'תאריך ערך',
  'תיאור התנועה',
  'זכות/חובה',
  'יתרה',
  'אסמכתא',
  'עמלה',
  'ערוץ',
]

/** [תאריך, ת.ערך, תיאור, סכום, יתרה, אסמכתא, עמלה, ערוץ] */
function row(
  date: string,
  description: string,
  amount: number,
  balance: number,
) {
  return [date, date, description, amount, balance, `ref${amount}`, '', 'web']
}

function parse(dataRows: unknown[][]) {
  const rows = [['תנועות אחרונות'], HEADER, ...dataRows]
  return discountOshParser.parse(rows, 'osh.xlsx', 'bank_account')
}

describe('חילוץ יתרות מקובץ עובר ושב', () => {
  it('קובץ בסדר כרונולוגי — פתיחה נגזרת מהשורה הראשונה', () => {
    const res = parse([
      row('7/1/26', 'תשלום לספק', -1000, 9000),
      row('7/5/26', 'העברה מלקוח', 5000, 14000),
    ])

    expect(res.openingBalance).toBe(10000)
    expect(res.closingBalance).toBe(14000)
    expect(bankBalanceControl({
      openingBalance: res.openingBalance,
      closingBalance: res.closingBalance,
      movements: res.balanceMovements ?? [],
    }).status).toBe('ok')
  })

  it('קובץ מהחדש לישן — הסדר נקבע לפי תאריך ולא לפי מיקום', () => {
    const res = parse([
      row('7/5/26', 'העברה מלקוח', 5000, 14000),
      row('7/1/26', 'תשלום לספק', -1000, 9000),
    ])

    expect(res.openingBalance).toBe(10000)
    expect(res.closingBalance).toBe(14000)
  })

  it('חיוב מרוכז לכרטיס נספר ביתרה למרות שאינו מיובא כהוצאה', () => {
    const res = parse([
      row('7/1/26', 'תשלום לספק', -1000, 9000),
      row('7/2/26', 'חיוב לכרטיס 1234', -2000, 7000),
      row('7/5/26', 'העברה מלקוח', 5000, 12000),
    ])

    // העסקה של הכרטיס לא נכנסת לרשימת ההוצאות
    expect(res.transactions).toHaveLength(2)
    // אבל היא כן נספרת בבקרת היתרה, אחרת הבקרה הייתה נכשלת בטעות
    expect(res.balanceMovements).toHaveLength(3)
    expect(
      bankBalanceControl({
        openingBalance: res.openingBalance,
        closingBalance: res.closingBalance,
        movements: res.balanceMovements ?? [],
      }).status,
    ).toBe('ok')
  })

  it('חיוב הכרטיס נחשף כדי לאפשר בקרה מול קובץ האשראי', () => {
    const res = parse([
      row('7/2/26', 'חיוב לכרטיס 1234', -2000, 7000),
    ])

    expect(res.cardSettlements).toEqual([
      { date: '2026-07-02', amount: 2000, description: 'חיוב לכרטיס 1234' },
    ])
  })

  it('תנועה שנשמטה מהקובץ מתגלה על ידי הבקרה', () => {
    const res = parse([
      row('7/1/26', 'תשלום לספק', -1000, 9000),
      // כאן הייתה אמורה להיות תנועה של 500, והיתרה קופצת בלעדיה
      row('7/5/26', 'העברה מלקוח', 5000, 13500),
    ])

    const control = bankBalanceControl({
      openingBalance: res.openingBalance,
      closingBalance: res.closingBalance,
      movements: res.balanceMovements ?? [],
    })
    expect(control.status).toBe('mismatch')
  })
})
