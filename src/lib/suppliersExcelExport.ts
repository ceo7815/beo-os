import * as XLSX from 'xlsx'
import { formatDateIL } from './dates'
import { HUB_SUPPLIER_ID } from './hubSupplier'
import type { Supplier } from '../types'

export type SuppliersExcelExportContext = {
  suppliers: Supplier[]
  projectCountBySupplierId: Map<string, number>
  campaignCountBySupplierId: Map<string, number>
  taskCountBySupplierId: Map<string, number>
}

const HEADERS = [
  'שם ספק',
  'סטטוס',
  'טלפון',
  'אימייל',
  'סוגי ספק',
  'תאריך יצירה',
  'פרויקטים',
  'קמפיינים',
  'משימות',
  'ספק ברירת מחדל',
  'מזהה במערכת',
] as const

function supplierStatusLabel(s: Supplier): string {
  return s.active !== false ? 'פעיל' : 'לא פעיל'
}

function supplierToRow(
  supplier: Supplier,
  ctx: SuppliersExcelExportContext,
): string[] {
  return [
    supplier.name.trim(),
    supplierStatusLabel(supplier),
    supplier.phone.trim(),
    supplier.email.trim(),
    (supplier.supplierTypes ?? []).join(' · '),
    formatDateIL(supplier.createdAt),
    String(ctx.projectCountBySupplierId.get(supplier.id) ?? 0),
    String(ctx.campaignCountBySupplierId.get(supplier.id) ?? 0),
    String(ctx.taskCountBySupplierId.get(supplier.id) ?? 0),
    supplier.id === HUB_SUPPLIER_ID ? 'כן' : '',
    supplier.id,
  ]
}

/** ייצוא כל הספקים לקובץ Excel — RTL, עברית, כל השדות */
export function exportSuppliersToExcel(ctx: SuppliersExcelExportContext): void {
  const sorted = ctx.suppliers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))

  const rows = sorted.map((supplier) => supplierToRow(supplier, ctx))
  const ws = XLSX.utils.aoa_to_sheet([HEADERS.slice(), ...rows])

  ws['!cols'] = [
    { wch: 28 },
    { wch: 10 },
    { wch: 14 },
    { wch: 26 },
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ספקים')

  wb.Workbook = {
    Views: [{ RTL: true }],
  }

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `ספקים-${stamp}.xlsx`)
}
