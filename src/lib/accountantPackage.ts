import JSZip from 'jszip'
import { formatDateIL } from './dates'
import { monthLabelHe } from './financeCalc'
import { resolveExpenseType } from './financeExpenseTypes'
import { reconciliationRowDate } from './expenseReconciliation'
import type { FinanceExpense, FinanceExpenseTypeDef } from '../types'

/**
 * חבילת מסמכים לרואה החשבון.
 *
 * הקובץ נבנה כתיקייה לפי חודשים, ולצדו מפתח בפורמט CSV שמקשר כל קובץ
 * לשורה בספרים. בלי המפתח רואה החשבון מקבל ערימת קבצים בשמות של הספקים
 * ואין לו דרך לדעת מה חסר — ועם המפתח אפשר להצליב כל שורה מול הבנק.
 */

export type AccountantDocument = {
  expense: FinanceExpense
  /** YYYY-MM — התיקייה שאליה הקובץ משויך */
  month: string
  /** שם הקובץ בתוך החבילה */
  fileName: string
}

export type PackageProgress = {
  done: number
  total: number
  currentLabel: string
}

export type PackageResult = {
  blob: Blob
  fileName: string
  included: number
  /** מסמכים שלא הצליחו לרדת — מדווחים במפורש ולא נבלעים */
  failed: { label: string; reason: string }[]
}

function supplierLabel(exp: FinanceExpense): string {
  return (
    exp.supplierName?.trim() ||
    exp.name?.trim() ||
    exp.description?.trim() ||
    'ללא שם'
  )
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60)
}

function extensionFrom(exp: FinanceExpense): string {
  const source = exp.documentFileName || exp.documentUrl || ''
  const match = source.match(/\.(pdf|jpe?g|png|webp|heic)(?:[?#]|$)/i)
  return match ? `.${match[1]!.toLowerCase()}` : '.pdf'
}

/**
 * שם קובץ שמזהה את המסמך גם מחוץ למערכת: תאריך, ספק, סכום ומספר חשבונית.
 * המספר הסידורי מונע דריסה כששני מסמכים חולקים את אותם פרטים.
 */
export function documentFileName(exp: FinanceExpense, index: number): string {
  const date = reconciliationRowDate(exp)
  const parts = [
    String(index).padStart(3, '0'),
    date,
    sanitize(supplierLabel(exp)),
    exp.amount.toFixed(2),
  ]
  if (exp.invoiceNumber?.trim()) parts.push(`חשבונית-${sanitize(exp.invoiceNumber)}`)
  return `${parts.join('_')}${extensionFrom(exp)}`
}

export function collectAccountantDocuments(
  expenses: FinanceExpense[],
): AccountantDocument[] {
  return expenses
    .filter((e) => Boolean(e.documentUrl?.trim()))
    .sort((a, b) =>
      reconciliationRowDate(a).localeCompare(reconciliationRowDate(b)),
    )
    .map((expense, i) => ({
      expense,
      month: reconciliationRowDate(expense).slice(0, 7),
      fileName: documentFileName(expense, i + 1),
    }))
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildIndexCsv(
  documents: AccountantDocument[],
  typeById?: Map<string, FinanceExpenseTypeDef>,
): string {
  const header = [
    'חודש',
    'תאריך',
    'ספק',
    'סוג הוצאה',
    'סכום כולל מעמ',
    'מעמ',
    'לפני מעמ',
    'מספר חשבונית',
    'אמצעי תשלום',
    'אסמכתא בנק',
    'שם הקובץ',
  ]

  const lines = documents.map(({ expense: e, month, fileName }) => {
    const typeDef = typeById ? resolveExpenseType(e.type, typeById) : undefined
    const vat = typeof e.vatAmount === 'number' ? e.vatAmount : ''
    const net =
      typeof e.amountBeforeVat === 'number'
        ? e.amountBeforeVat
        : typeof e.vatAmount === 'number'
          ? Math.round((e.amount - e.vatAmount) * 100) / 100
          : ''
    return [
      monthLabelHe(month),
      formatDateIL(reconciliationRowDate(e)),
      supplierLabel(e),
      typeDef?.label ?? e.type,
      e.amount.toFixed(2),
      vat === '' ? '' : Number(vat).toFixed(2),
      net === '' ? '' : Number(net).toFixed(2),
      e.invoiceNumber?.trim() ?? '',
      e.paymentMethod === 'credit_card' ? 'כרטיס אשראי' : 'עובר ושב',
      e.bankRef?.trim() ?? '',
      `${month}/${fileName}`,
    ]
      .map(csvCell)
      .join(',')
  })

  // BOM כדי שאקסל בעברית יזהה UTF-8 ולא יציג ג'יבריש
  return `\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`
}

async function fetchDocument(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`השרת החזיר ${res.status}`)
  return res.blob()
}

export async function buildAccountantPackage(
  expenses: FinanceExpense[],
  periodLabel: string,
  options?: {
    typeById?: Map<string, FinanceExpenseTypeDef>
    onProgress?: (progress: PackageProgress) => void
  },
): Promise<PackageResult> {
  const documents = collectAccountantDocuments(expenses)
  const zip = new JSZip()
  const failed: { label: string; reason: string }[] = []
  let included = 0

  zip.file('מפתח-מסמכים.csv', buildIndexCsv(documents, options?.typeById))

  for (const [i, doc] of documents.entries()) {
    const label = `${formatDateIL(reconciliationRowDate(doc.expense))} · ${supplierLabel(doc.expense)}`
    options?.onProgress?.({
      done: i,
      total: documents.length,
      currentLabel: label,
    })
    try {
      const blob = await fetchDocument(doc.expense.documentUrl!)
      zip.folder(doc.month)!.file(doc.fileName, blob)
      included += 1
    } catch (e) {
      failed.push({
        label,
        reason: e instanceof Error ? e.message : 'הורדה נכשלה',
      })
    }
  }

  options?.onProgress?.({
    done: documents.length,
    total: documents.length,
    currentLabel: 'בונה קובץ…',
  })

  const blob = await zip.generateAsync({ type: 'blob' })
  return {
    blob,
    fileName: `חשבוניות_${periodLabel.replace(/[\\/:*?"<>|\s]+/g, '-')}.zip`,
    included,
    failed,
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
