import { formatDateIL } from './dates'
import { monthLabelHe } from './financeCalc'
import { resolveExpenseType } from './financeExpenseTypes'
import { listMissingGiBankExpenses } from './expenseReconciliation'
import type { FinanceExpense, FinanceExpenseTypeDef } from '../types'

export type MissingGiReportRow = {
  index: number
  paidDate: string
  paidDateLabel: string
  billingMonth: string
  monthLabel: string
  merchant: string
  typeLabel: string
  amount: number
  vatAmount: number | null
  netAmount: number | null
  bankRef: string
  projectName: string
  note: string
}

export type MissingGiReportData = {
  ymFrom: string
  ymTo: string
  periodLabel: string
  generatedAt: string
  generatedAtLabel: string
  rows: MissingGiReportRow[]
  totalAmount: number
  totalVat: number
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

export function buildMissingGiReportData(
  expenses: FinanceExpense[],
  ymFrom: string,
  ymTo: string,
  options?: {
    typeById?: Map<string, FinanceExpenseTypeDef>
    projectNameById?: Map<string, string>
  },
): MissingGiReportData {
  const missing = listMissingGiBankExpenses(expenses, ymFrom, ymTo)
  const generatedAt = new Date().toISOString()

  let totalAmount = 0
  let totalVat = 0

  const rows: MissingGiReportRow[] = missing.map((exp, i) => {
    const vat =
      typeof exp.vatAmount === 'number' ? exp.vatAmount : null
    const net =
      vat !== null
        ? Math.round((exp.amount - vat) * 100) / 100
        : typeof exp.amountBeforeVat === 'number'
          ? exp.amountBeforeVat
          : null
    totalAmount += exp.amount
    if (vat !== null) totalVat += vat

    const paidDate = exp.paidDate ?? `${exp.billingMonth}-01`
    const typeDef = options?.typeById
      ? resolveExpenseType(exp.type, options.typeById)
      : undefined

    return {
      index: i + 1,
      paidDate,
      paidDateLabel: formatDateIL(paidDate),
      billingMonth: exp.billingMonth,
      monthLabel: monthLabelHe(exp.billingMonth),
      merchant: merchantLabel(exp),
      typeLabel: typeDef?.label ?? exp.type,
      amount: exp.amount,
      vatAmount: vat,
      netAmount: net,
      bankRef: exp.bankRef?.trim() || '—',
      projectName:
        (exp.projectId && options?.projectNameById?.get(exp.projectId)) ||
        '—',
      note: exp.description?.trim() || '—',
    }
  })

  return {
    ymFrom,
    ymTo,
    periodLabel: periodLabel(ymFrom, ymTo),
    generatedAt,
    generatedAtLabel: new Date(generatedAt).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    rows,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
  }
}

function rowsByMonth(rows: MissingGiReportRow[]): Map<string, MissingGiReportRow[]> {
  const map = new Map<string, MissingGiReportRow[]>()
  for (const row of rows) {
    const list = map.get(row.billingMonth) ?? []
    list.push(row)
    map.set(row.billingMonth, list)
  }
  return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])))
}

export function missingGiReportHtml(data: MissingGiReportData): string {
  const grouped = rowsByMonth(data.rows)
  const monthBlocks = [...grouped.entries()]
    .map(([ym, monthRows]) => {
      const monthTotal = monthRows.reduce((s, r) => s + r.amount, 0)
      const body = monthRows
        .map(
          (r) => `
        <tr>
          <td class="num">${r.index}</td>
          <td class="date">${escapeHtml(r.paidDateLabel)}</td>
          <td class="merchant">${escapeHtml(r.merchant)}</td>
          <td class="type">${escapeHtml(r.typeLabel)}</td>
          <td class="money">${formatNisExact(r.amount)}</td>
          <td class="money">${r.vatAmount !== null ? formatNisExact(r.vatAmount) : '—'}</td>
          <td class="money">${r.netAmount !== null ? formatNisExact(r.netAmount) : '—'}</td>
          <td class="ref">${escapeHtml(r.bankRef)}</td>
          <td class="project">${escapeHtml(r.projectName)}</td>
          <td class="note">${escapeHtml(r.note)}</td>
        </tr>`,
        )
        .join('')

      return `
      <section class="month-block">
        <div class="month-head">
          <h2>${escapeHtml(monthLabelHe(ym))}</h2>
          <span class="month-meta">${monthRows.length} תשלומים · סה״כ ${formatNisExact(monthTotal)}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>תאריך תשלום</th>
              <th>תיאור בבנק</th>
              <th>סוג</th>
              <th>סכום כולל מע״מ</th>
              <th>מע״מ</th>
              <th>לפני מע״מ</th>
              <th>אסמכתא בנק</th>
              <th>פרויקט</th>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </section>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח הוצאות חסרות בחשבונית ירוקה</title>
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
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      background: #f8fafc;
    }
    .card-label { color: #64748b; font-size: 10px; font-weight: 700; }
    .card-value { font-size: 20px; font-weight: 800; margin-top: 4px; }
    .instructions {
      border: 1px solid #fde68a;
      background: #fffbeb;
      color: #92400e;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 18px;
      font-size: 11px;
    }
    .month-block { margin-bottom: 22px; break-inside: avoid; }
    .month-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
      padding: 0 2px;
    }
    .month-head h2 { margin: 0; font-size: 15px; color: #0f172a; }
    .month-meta { color: #64748b; font-size: 11px; font-weight: 600; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 5px;
      vertical-align: top;
      word-wrap: break-word;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-size: 10px;
      font-weight: 800;
    }
    td.num, td.date, td.money { text-align: center; white-space: nowrap; }
    td.merchant { font-weight: 700; }
    td.ref { font-family: Consolas, monospace; font-size: 10px; }
    td.note, td.project { color: #475569; font-size: 10px; }
    .footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      color: #94a3b8;
      font-size: 10px;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <div class="brand">HUB POS</div>
      <div class="title">דוח תשלומי בנק חסרים בחשבונית ירוקה</div>
      <div class="subtitle">תקופה: ${escapeHtml(data.periodLabel)} · לטיפול והזנה ב-GI</div>
    </div>
    <div class="meta">
      <div>נוצר: ${escapeHtml(data.generatedAtLabel)}</div>
      <div>מקור: ייבוא בנק (לא נמצא מסמך מקביל ב-GI)</div>
    </div>
  </header>

  <section class="summary">
    <div class="card">
      <div class="card-label">מספר תשלומים</div>
      <div class="card-value">${data.rows.length}</div>
    </div>
    <div class="card">
      <div class="card-label">סה״כ כולל מע״מ</div>
      <div class="card-value">${formatNisExact(data.totalAmount)}</div>
    </div>
    <div class="card">
      <div class="card-label">סה״כ מע״מ</div>
      <div class="card-value">${formatNisExact(data.totalVat)}</div>
    </div>
  </section>

  <div class="instructions">
    <strong>הנחיות להשלמה בחשבונית ירוקה:</strong>
    עבור כל שורה — הזינו חשבונית מס / קבלה על שם הספק, בסכום ובתאריך המופיעים,
    וסווגו לפי סוג ההוצאה. לאחר מכן במערכת HUB לחצו «סנכרן הוצאות מ-GI» ואז «התאם מחדש».
  </div>

  ${monthBlocks || '<p>אין תשלומי בנק חסרים בתקופה שנבחרה.</p>'}

  <footer class="footer">
    <span>HUB ADVANCED · דוח פנימי</span>
    <span>${data.rows.length} שורות · ${escapeHtml(data.periodLabel)}</span>
  </footer>
</body>
</html>`
}

let printFrame: HTMLIFrameElement | null = null

/** הדפסה / שמירה כ-PDF — דרך iframe נסתר (ללא חלון קופץ) */
export function printMissingGiReport(data: MissingGiReportData): void {
  const html = missingGiReportHtml(data)

  if (!printFrame) {
    printFrame = document.createElement('iframe')
    printFrame.id = 'missing-gi-report-print-frame'
    printFrame.setAttribute('title', 'דוח הוצאות חסרות')
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
      if (!win) {
        throw new Error('לא ניתן להדפיס את הדוח')
      }
      win.focus()
      win.print()
    }, 300)
  }

  frame.src = url
}

/** @deprecated — השתמשו ב-printMissingGiReport */
export function openMissingGiReportPrint(data: MissingGiReportData): void {
  printMissingGiReport(data)
}

export function missingGiReportFilename(data: MissingGiReportData): string {
  return `missing-gi-expenses_${data.ymFrom}_${data.ymTo}.pdf`
}
