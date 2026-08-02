import { formatDateIL } from './dates'
import { monthLabelHe } from './financeCalc'
import { resolveExpenseType } from './financeExpenseTypes'
import {
  isOpenReconciliationRow,
  listInvoiceWorkflowRows,
  RECONCILIATION_STATUS_LABEL,
  reconciliationRowDate,
} from './expenseReconciliation'
import type {
  ExpenseReconciliationStatus,
  FinanceExpense,
  FinanceExpenseTypeDef,
} from '../types'

/**
 * דוח התאמות בנקים להדפסה או לשמירה כ-PDF.
 *
 * הדוח נועד לשמש ראיה: הוא מציג את כל התשלומים בתקופה, לא רק את הפתוחים,
 * ומסכם כמה מהם מגובים בחשבונית. תמונה חלקית הייתה מאפשרת להציג אחוז
 * כיסוי גבוה רק מפני שמעט שורות נכללו בה.
 */

export type BankReconciliationReportRow = {
  index: number
  date: string
  dateLabel: string
  merchant: string
  typeLabel: string
  amount: number
  vatAmount: number | null
  paymentLabel: string
  status: ExpenseReconciliationStatus
  statusLabel: string
  invoiceNumber: string
  bankRef: string
  isOpen: boolean
}

export type BankReconciliationReportData = {
  ymFrom: string
  ymTo: string
  periodLabel: string
  generatedAtLabel: string
  rows: BankReconciliationReportRow[]
  openRows: number
  openAmount: number
  closedRows: number
  closedAmount: number
  totalAmount: number
  coveragePercent: number
}

function formatNisExact(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return amount < 0 ? `(₪${formatted})` : `₪${formatted}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function merchantLabel(exp: FinanceExpense): string {
  return (
    exp.supplierName?.trim() ||
    exp.name?.trim() ||
    exp.employeeName?.trim() ||
    exp.description?.trim() ||
    '—'
  )
}

function periodLabel(ymFrom: string, ymTo: string): string {
  if (ymFrom === ymTo) return monthLabelHe(ymFrom)
  return `${monthLabelHe(ymFrom)} — ${monthLabelHe(ymTo)}`
}

export function buildBankReconciliationReport(
  expenses: FinanceExpense[],
  ymFrom: string,
  ymTo: string,
  options?: { typeById?: Map<string, FinanceExpenseTypeDef> },
): BankReconciliationReportData {
  const rows = listInvoiceWorkflowRows(
    expenses,
    ymFrom,
    ymTo,
    options?.typeById,
  )

  let openRows = 0
  let openAmount = 0
  let closedRows = 0
  let closedAmount = 0

  const reportRows: BankReconciliationReportRow[] = rows.map((row, i) => {
    const exp = row.expense
    const isOpen = isOpenReconciliationRow(row)
    if (isOpen) {
      openRows += 1
      openAmount += exp.amount
    } else {
      closedRows += 1
      closedAmount += exp.amount
    }

    const typeDef = options?.typeById
      ? resolveExpenseType(exp.type, options.typeById)
      : undefined
    const date = reconciliationRowDate(exp)

    return {
      index: i + 1,
      date,
      dateLabel: formatDateIL(date),
      merchant: merchantLabel(exp),
      typeLabel: typeDef?.label ?? exp.type,
      amount: exp.amount,
      vatAmount: typeof exp.vatAmount === 'number' ? exp.vatAmount : null,
      paymentLabel:
        exp.paymentMethod === 'credit_card' ? 'כרטיס אשראי' : 'עובר ושב',
      status: row.status,
      statusLabel: RECONCILIATION_STATUS_LABEL[row.status],
      invoiceNumber: exp.invoiceNumber?.trim() || (exp.documentUrl ? 'מסמך מצורף' : '—'),
      bankRef: exp.bankRef?.trim() || '—',
      isOpen,
    }
  })

  const totalAmount = Math.round((openAmount + closedAmount) * 100) / 100

  return {
    ymFrom,
    ymTo,
    periodLabel: periodLabel(ymFrom, ymTo),
    generatedAtLabel: new Date().toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    rows: reportRows,
    openRows,
    openAmount: Math.round(openAmount * 100) / 100,
    closedRows,
    closedAmount: Math.round(closedAmount * 100) / 100,
    totalAmount,
    coveragePercent:
      totalAmount > 0
        ? Math.round((closedAmount / totalAmount) * 1000) / 10
        : 100,
  }
}

function rowsHtml(rows: BankReconciliationReportRow[]): string {
  return rows
    .map(
      (r) => `
      <tr class="${r.isOpen ? 'open' : ''}">
        <td class="num">${r.index}</td>
        <td class="date">${escapeHtml(r.dateLabel)}</td>
        <td class="merchant">${escapeHtml(r.merchant)}</td>
        <td class="type">${escapeHtml(r.typeLabel)}</td>
        <td class="money">${formatNisExact(r.amount)}</td>
        <td class="money">${r.vatAmount !== null ? formatNisExact(r.vatAmount) : '—'}</td>
        <td class="pay">${escapeHtml(r.paymentLabel)}</td>
        <td class="status">${escapeHtml(r.statusLabel)}</td>
        <td class="invoice">${escapeHtml(r.invoiceNumber)}</td>
        <td class="ref">${escapeHtml(r.bankRef)}</td>
      </tr>`,
    )
    .join('')
}

function section(
  title: string,
  note: string,
  rows: BankReconciliationReportRow[],
): string {
  if (rows.length === 0) return ''
  return `
  <section class="block">
    <div class="block-head">
      <h2>${escapeHtml(title)}</h2>
      <span class="block-meta">${escapeHtml(note)}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:34px">#</th>
          <th style="width:78px">תאריך</th>
          <th>ספק / תיאור</th>
          <th style="width:100px">סוג</th>
          <th style="width:92px">סכום</th>
          <th style="width:80px">מע״מ</th>
          <th style="width:78px">אמצעי</th>
          <th style="width:104px">מצב</th>
          <th style="width:96px">חשבונית</th>
          <th style="width:130px">אסמכתא בנק</th>
        </tr>
      </thead>
      <tbody>${rowsHtml(rows)}</tbody>
    </table>
  </section>`
}

export function bankReconciliationReportHtml(
  data: BankReconciliationReportData,
): string {
  const open = data.rows.filter((r) => r.isOpen)
  const closed = data.rows.filter((r) => !r.isOpen)

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח התאמות בנקים</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 24px;
      background: #fff;
      font-size: 11px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 3px solid #f97316;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .brand { font-size: 22px; font-weight: 800; color: #ea580c; }
    .title { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .subtitle { color: #64748b; margin-top: 6px; font-size: 12px; }
    .meta { text-align: left; color: #64748b; font-size: 11px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      background: #f8fafc;
    }
    .card.alert { border-color: #fecaca; background: #fef2f2; }
    .card.good { border-color: #bbf7d0; background: #f0fdf4; }
    .card-label { color: #64748b; font-size: 10px; font-weight: 700; }
    .card-value { font-size: 20px; font-weight: 800; margin-top: 4px; }
    .card-sub { color: #64748b; font-size: 10px; margin-top: 2px; }
    .block { margin-bottom: 22px; break-inside: avoid; }
    .block-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
      padding: 0 2px;
    }
    .block-head h2 { margin: 0; font-size: 15px; color: #0f172a; }
    .block-meta { color: #64748b; font-size: 11px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 5px;
      vertical-align: top;
      word-wrap: break-word;
    }
    th { background: #f1f5f9; color: #334155; font-size: 10px; font-weight: 800; }
    td.num, td.date, td.money, td.pay, td.status { text-align: center; white-space: nowrap; }
    td.merchant { font-weight: 700; }
    td.ref { font-family: Consolas, monospace; font-size: 9px; }
    tr.open td.status { color: #b91c1c; font-weight: 800; }
    .footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <div class="brand">HUB POS</div>
      <div class="title">דוח התאמות בנקים</div>
      <div class="subtitle">תקופה: ${escapeHtml(data.periodLabel)} · תשלומים מול חשבוניות ספק</div>
    </div>
    <div class="meta">
      <div>נוצר: ${escapeHtml(data.generatedAtLabel)}</div>
      <div>${data.rows.length} תשלומים בתקופה</div>
    </div>
  </header>

  <section class="summary">
    <div class="card">
      <div class="card-label">סה״כ תשלומים</div>
      <div class="card-value">${formatNisExact(data.totalAmount)}</div>
      <div class="card-sub">${data.rows.length} שורות</div>
    </div>
    <div class="card good">
      <div class="card-label">מגובה בחשבונית</div>
      <div class="card-value">${formatNisExact(data.closedAmount)}</div>
      <div class="card-sub">${data.closedRows} שורות</div>
    </div>
    <div class="card ${data.openRows > 0 ? 'alert' : ''}">
      <div class="card-label">ממתין לחשבונית</div>
      <div class="card-value">${formatNisExact(data.openAmount)}</div>
      <div class="card-sub">${data.openRows} שורות</div>
    </div>
    <div class="card">
      <div class="card-label">אחוז כיסוי</div>
      <div class="card-value">${data.coveragePercent}%</div>
      <div class="card-sub">מתוך סכום התשלומים</div>
    </div>
  </section>

  ${section('ממתין לחשבונית', `${open.length} שורות · ${formatNisExact(data.openAmount)}`, open)}
  ${section('מגובה בחשבונית', `${closed.length} שורות · ${formatNisExact(data.closedAmount)}`, closed)}
  ${data.rows.length === 0 ? '<p>אין תשלומים בתקופה שנבחרה.</p>' : ''}

  <footer class="footer">
    <span>HUB ADVANCED · דוח פנימי</span>
    <span>${data.rows.length} שורות · ${escapeHtml(data.periodLabel)}</span>
  </footer>
</body>
</html>`
}

let printFrame: HTMLIFrameElement | null = null

/** הדפסה / שמירה כ-PDF — דרך iframe נסתר, בלי חלון קופץ שנחסם בדפדפן */
export function printBankReconciliationReport(
  data: BankReconciliationReportData,
): void {
  const html = bankReconciliationReportHtml(data)

  if (!printFrame) {
    printFrame = document.createElement('iframe')
    printFrame.id = 'bank-reconciliation-print-frame'
    printFrame.setAttribute('title', 'דוח התאמות בנקים')
    printFrame.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(printFrame)
  }

  const frame = printFrame
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  frame.onload = () => {
    URL.revokeObjectURL(url)
    window.setTimeout(() => {
      const win = frame.contentWindow
      if (!win) throw new Error('לא ניתן להדפיס את הדוח')
      win.focus()
      win.print()
    }, 300)
  }

  frame.src = url
}
