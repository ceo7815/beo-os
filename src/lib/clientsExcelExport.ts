import * as XLSX from 'xlsx'
import { formatDateIL } from './dates'
import { formatNis } from './financeCalc'
import type { Client } from '../types'

export type ClientsExcelExportContext = {
  clients: Client[]
  projectCountByClientId: Map<string, number>
  teamNameById: Map<string, string>
}

const HEADERS = [
  'חברה',
  'שם רשמי',
  'איש קשר',
  'טלפון',
  'אימייל',
  'מחלקה',
  'סטטוס',
  'תאריך כניסה',
  'עובדים משויכים',
  'סוכן מכירות',
  'פרויקטים',
  'ח.פ / עוסק',
  'כתובת',
  'עיר',
  'יתרה פתוחה',
  'מקור',
  'מזהה חשבונית ירוקה',
  'הערות',
  'מזהה במערכת',
] as const

function clientStatusLabel(status: Client['status']): string {
  return status === 'active' ? 'פעיל' : 'לא פעיל'
}

function clientSourceLabel(source: Client['source']): string {
  if (source === 'green_invoice') return 'חשבונית ירוקה'
  return 'ידני'
}

function assignedNames(
  client: Client,
  teamNameById: Map<string, string>,
): string {
  const ids = client.assignedEmployeeUserIds
  if (!ids?.length) return ''
  return ids.map((id) => teamNameById.get(id) ?? id).join(' · ')
}

function clientToRow(
  client: Client,
  ctx: ClientsExcelExportContext,
): string[] {
  return [
    client.name.trim(),
    client.legalName?.trim() ?? '',
    client.contact.trim(),
    client.phone.trim(),
    client.email.trim(),
    client.department?.trim() ?? '',
    clientStatusLabel(client.status),
    formatDateIL(client.createdAt),
    assignedNames(client, ctx.teamNameById),
    client.salesAgentUserId
      ? ctx.teamNameById.get(client.salesAgentUserId) ?? client.salesAgentUserId
      : '',
    String(ctx.projectCountByClientId.get(client.id) ?? 0),
    client.taxId?.trim() ?? '',
    client.addressLine?.trim() ?? '',
    client.city?.trim() ?? '',
    typeof client.financeBalance === 'number' && Number.isFinite(client.financeBalance)
      ? formatNis(client.financeBalance)
      : '',
    clientSourceLabel(client.source),
    client.greenInvoiceId?.trim() ?? '',
    client.businessNotes?.trim() ?? '',
    client.id,
  ]
}

/** ייצוא כל הלקוחות לקובץ Excel — RTL, עברית, כל השדות */
export function exportClientsToExcel(ctx: ClientsExcelExportContext): void {
  const sorted = ctx.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))

  const rows = sorted.map((client) => clientToRow(client, ctx))
  const ws = XLSX.utils.aoa_to_sheet([HEADERS.slice(), ...rows])

  ws['!cols'] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 18 },
    { wch: 14 },
    { wch: 26 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 24 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 22 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'לקוחות')

  wb.Workbook = {
    Views: [{ RTL: true }],
  }

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `לקוחות-${stamp}.xlsx`)
}
