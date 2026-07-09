import { formatDateIL } from './dates'
import { monthLabelHe } from './financeCalc'
import {
  GI_DOC_KIND_LABEL,
  listUnpaidGiExpenses,
} from './expenseReconciliation'
import type { FinanceExpense } from '../types'

export type UnpaidGiReportRow = {
  index: number
  documentDate: string
  documentDateLabel: string
  billingMonth: string
  monthLabel: string
  supplier: string
  invoiceNumber: string
  docKindLabel: string
  amount: number
  vatAmount: number | null
  netAmount: number | null
  greenInvoiceId: string
  description: string
}

export type UnpaidGiReportData = {
  ymFrom: string
  ymTo: string
  periodLabel: string
  generatedAt: string
  generatedAtLabel: string
  rows: UnpaidGiReportRow[]
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

function supplierLabel(exp: FinanceExpense): string {
  return (
    exp.greenInvoiceSupplierName?.trim() ||
    exp.supplierName?.trim() ||
    exp.name?.trim() ||
    '—'
  )
}

function periodLabel(ymFrom: string, ymTo: string): string {
  if (ymFrom === ymTo) return monthLabelHe(ymFrom)
  return `${monthLabelHe(ymFrom)} — ${monthLabelHe(ymTo)}`
}

export function buildUnpaidGiReportData(
  expenses: FinanceExpense[],
  ymFrom: string,
  ymTo: string,
): UnpaidGiReportData {
  const unpaid = listUnpaidGiExpenses(expenses, ymFrom, ymTo)
  const generatedAt = new Date().toISOString()

  let totalAmount = 0
  let totalVat = 0

  const rows: UnpaidGiReportRow[] = unpaid.map((exp, i) => {
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

    const documentDate = exp.paidDate ?? `${exp.billingMonth}-01`
    const docKind = exp.greenInvoiceDocKind

    return {
      index: i + 1,
      documentDate,
      documentDateLabel: formatDateIL(documentDate),
      billingMonth: exp.billingMonth,
      monthLabel: monthLabelHe(exp.billingMonth),
      supplier: supplierLabel(exp),
      invoiceNumber: exp.greenInvoiceNumber?.trim() || '—',
      docKindLabel: docKind ? GI_DOC_KIND_LABEL[docKind] : '—',
      amount: exp.amount,
      vatAmount: vat,
      netAmount: net,
      greenInvoiceId: exp.greenInvoiceId?.trim() || '—',
      description: exp.description?.trim() || '—',
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

function rowsByMonth(rows: UnpaidGiReportRow[]): Map<string, UnpaidGiReportRow[]> {
  const map = new Map<string, UnpaidGiReportRow[]>()
  for (const row of rows) {
    const list = map.get(row.billingMonth) ?? []
    list.push(row)
    map.set(row.billingMonth, list)
  }
  return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])))
}

export function unpaidGiReportHtml(data: UnpaidGiReportData): string {
  const grouped = rowsByMonth(data.rows)
  const monthBlocks = [...grouped.entries()]
    .map(([ym, monthRows]) => {
      const monthTotal = monthRows.reduce((s, r) => s + r.amount, 0)
      const body = monthRows
        .map(
          (r) => `
        <tr>
          <td class="num">${r.index}</td>
          <td class="date">${escapeHtml(r.documentDateLabel)}</td>
          <td class="inv">${escapeHtml(r.invoiceNumber)}</td>
          <td class="supplier">${escapeHtml(r.supplier)}</td>
          <td class="kind">${escapeHtml(r.docKindLabel)}</td>
          <td class="money">${formatNisExact(r.amount)}</td>
          <td class="money">${r.vatAmount !== null ? formatNisExact(r.vatAmount) : '—'}</td>
          <td class="money">${r.netAmount !== null ? formatNisExact(r.netAmount) : '—'}</td>
          <td class="gid">${escapeHtml(r.greenInvoiceId)}</td>
          <td class="note">${escapeHtml(r.description)}</td>
        </tr>`,
        )
        .join('')

      return `
      <section class="month-block">
        <div class="month-head">
          <h2>${escapeHtml(monthLabelHe(ym))}</h2>
          <span class="month-meta">${monthRows.length} מסמכים · סה״כ ${formatNisExact(monthTotal)}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>תאריך מסמך</th>
              <th>מס׳ חשבונית</th>
              <th>ספק</th>
              <th>סוג מסמך</th>
              <th>סכום כולל מע״מ</th>
              <th>מע״מ</th>
              <th>לפני מע״מ</th>
              <th>מזהה GI</th>
              <th>תיאור</th>
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
  <title>דוח מסמכי GI ללא תשלום בנק</title>
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
      border-bottom: 3px solid #2563eb;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .brand { font-size: 22px; font-weight: 800; color: #1d4ed8; }
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
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #1e40af;
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
    td.supplier { font-weight: 700; }
    td.inv, td.gid { font-family: Consolas, monospace; font-size: 10px; }
    td.note { color: #475569; font-size: 10px; }
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
      <div class="title">דוח מסמכי חשבונית ירוקה ללא תשלום בנק</div>
      <div class="subtitle">תקופה: ${escapeHtml(data.periodLabel)} · לאותר חיובים חסרים / כפילויות</div>
    </div>
    <div class="meta">
      <div>נוצר: ${escapeHtml(data.generatedAtLabel)}</div>
      <div>מקור: סנכרון GI (לא נמצא תשלום בנק מקביל)</div>
    </div>
  </header>

  <section class="summary">
    <div class="card">
      <div class="card-label">מספר מסמכים</div>
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
    <strong>הנחיות לבדיקה:</strong>
    עבור כל שורה — בדקו אם התשלום בוצע בחודש אחר, אם חסר ייבוא מהבנק, אם מדובר בזיכוי/טיוטה ב-GI,
    או אם נדרש מחיקה/תיקון של מסמך כפול. לאחר תיקון — «סנכרן הוצאות מ-GI» ואז «התאם מחדש».
  </div>

  ${monthBlocks || '<p>אין מסמכי GI ללא בנק בתקופה שנבחרה.</p>'}

  <footer class="footer">
    <span>HUB ADVANCED · דוח פנימי</span>
    <span>${data.rows.length} שורות · ${escapeHtml(data.periodLabel)}</span>
  </footer>
</body>
</html>`
}

let printFrame: HTMLIFrameElement | null = null

export function printUnpaidGiReport(data: UnpaidGiReportData): void {
  const html = unpaidGiReportHtml(data)

  if (!printFrame) {
    printFrame = document.createElement('iframe')
    printFrame.id = 'unpaid-gi-report-print-frame'
    printFrame.setAttribute('title', 'דוח מסמכי GI ללא בנק')
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

export function unpaidGiReportFilename(data: UnpaidGiReportData): string {
  return `unpaid-gi-expenses_${data.ymFrom}_${data.ymTo}.pdf`
}
