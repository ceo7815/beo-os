import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { formatDateIL, todayYmd } from '../lib/dates'
import { ClientQuickSelect } from '../components/ClientQuickSelect'
import { Modal } from '../components/shared/Modal'
import { ExportExcelButton } from '../components/shared/ExportExcelButton'
import { useClients } from '../hooks/useClients'
import { useHosting } from '../hooks/useHosting'
import type {
  Client,
  DomainManager,
  HostingBillingCycle,
  HostingRecord,
  HostingServerType,
} from '../types'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { exportHostingToExcel } from '../lib/excelTableExports'

const PROVIDER_HINTS = [
  'Hostinger',
  'AWS',
  'DigitalOcean',
  'Google Cloud',
  'שרת פרטי',
  'CloudPanel',
  'cPanel',
  'אחר',
] as const
const LOCATION_HINTS = ['ישראל', 'חו״ל'] as const
const REGISTRAR_HINTS = [
  'GoDaddy',
  'Cloudflare',
  'Hostinger',
  'Name.com',
  'domains.org.il',
  'ישראל אינטרנט',
  'אחר',
] as const
const PLATFORM_HINTS = ['WordPress', 'Laravel', 'Static', 'אחר'] as const

const SERVER_TYPE_LABEL: Record<HostingServerType, string> = {
  shared: 'אחסון שיתופי',
  private: 'שרת פרטי',
}

const DOMAIN_MANAGER_LABEL: Record<DomainManager, string> = {
  agency: 'האב מערכות',
  client: 'הלקוח',
  external: 'גורם חיצוני',
}

const CYCLE_LABEL: Record<HostingBillingCycle, string> = {
  monthly: 'חודשי',
  yearly: 'שנתי',
  biennial: 'דו־שנתי',
  oneTime: 'חד־פעמי',
}

const CYCLE_OPTIONS: HostingBillingCycle[] = [
  'monthly',
  'yearly',
  'biennial',
  'oneTime',
]

type HostingFormState = {
  clientId: string
  domain: string
  siteName: string
  serverType: HostingServerType
  serverProvider: string
  serverLocation: string
  hostingRenewalDate: string
  hostingCycle: HostingBillingCycle
  registrar: string
  domainManager: DomainManager
  domainManagerNote: string
  domainRenewalDate: string
  greenInvoiceRetainer: boolean
  retainerAmount: string
  retainerCycle: HostingBillingCycle
  sslExpiry: string
  ipAddress: string
  controlPanel: string
  username: string
  platform: string
  phpVersion: string
  notes: string
}

function emptyForm(): HostingFormState {
  return {
    clientId: '',
    domain: '',
    siteName: '',
    serverType: 'shared',
    serverProvider: '',
    serverLocation: '',
    hostingRenewalDate: '',
    hostingCycle: 'yearly',
    registrar: '',
    domainManager: 'agency',
    domainManagerNote: '',
    domainRenewalDate: '',
    greenInvoiceRetainer: false,
    retainerAmount: '',
    retainerCycle: 'monthly',
    sslExpiry: '',
    ipAddress: '',
    controlPanel: '',
    username: '',
    platform: '',
    phpVersion: '',
    notes: '',
  }
}

function recordToForm(r: HostingRecord): HostingFormState {
  return {
    clientId: r.clientId,
    domain: r.domain,
    siteName: r.siteName,
    serverType: r.serverType,
    serverProvider: r.serverProvider,
    serverLocation: r.serverLocation,
    hostingRenewalDate: r.hostingRenewalDate,
    hostingCycle: r.hostingCycle,
    registrar: r.registrar,
    domainManager: r.domainManager,
    domainManagerNote: r.domainManagerNote,
    domainRenewalDate: r.domainRenewalDate,
    greenInvoiceRetainer: r.greenInvoiceRetainer,
    retainerAmount:
      typeof r.retainerAmount === 'number' ? String(r.retainerAmount) : '',
    retainerCycle: r.retainerCycle,
    sslExpiry: r.sslExpiry,
    ipAddress: r.ipAddress,
    controlPanel: r.controlPanel,
    username: r.username,
    platform: r.platform,
    phpVersion: r.phpVersion,
    notes: r.notes,
  }
}

/** ימים עד תאריך YYYY-MM-DD מול today; null אם לא תקין */
function daysUntil(targetYmd: string, fromYmd: string): number | null {
  const p = targetYmd.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return null
  const [y, m, d] = p.split('-').map(Number)
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const T = Date.UTC(y, m - 1, d)
  const F = Date.UTC(fy, fm - 1, fd)
  return Math.round((T - F) / 86400000)
}

type RenewalUrgency = 'red' | 'yellow' | 'green'

/** הדחיפות נקבעת לפי המוקדם מבין: חידוש דומיין, תשלום אחסון, תפוגת SSL */
function minDaysUntilRenewal(r: HostingRecord, today: string): number | null {
  const vals = [
    daysUntil(r.domainRenewalDate, today),
    daysUntil(r.hostingRenewalDate, today),
    daysUntil(r.sslExpiry, today),
  ].filter((x): x is number => x !== null)
  if (vals.length === 0) return null
  return Math.min(...vals)
}

function urgencyOf(min: number | null): RenewalUrgency {
  if (min === null) return 'green'
  if (min < 30) return 'red'
  if (min < 60) return 'yellow'
  return 'green'
}

function urgencyStyles(u: RenewalUrgency): {
  bar: string
  borderS: string
  dot: string
  label: string
} {
  switch (u) {
    case 'red':
      return {
        bar: 'bg-red-50/80',
        borderS: 'border-s-[#EF4444]',
        dot: 'bg-[#EF4444]',
        label: 'text-[#B91C1C]',
      }
    case 'yellow':
      return {
        bar: 'bg-[var(--orange-light)]',
        borderS: 'border-s-amber-500',
        dot: 'bg-amber-500',
        label: 'text-amber-800',
      }
    default:
      return {
        bar: 'bg-emerald-50/60',
        borderS: 'border-s-emerald-500',
        dot: 'bg-emerald-500',
        label: 'text-emerald-800',
      }
  }
}

function urgencyLabelHe(u: RenewalUrgency): string {
  switch (u) {
    case 'red':
      return 'חידוש קרוב — פחות מ־30 יום (או פג תוקף)'
    case 'yellow':
      return 'חידוש — פחות מ־60 יום'
    default:
      return 'תקין (מעל 60 יום)'
  }
}

function DateLine({
  icon,
  label,
  ymd,
  today,
}: {
  icon: string
  label: string
  ymd: string
  today: string
}) {
  const days = daysUntil(ymd, today)
  return (
    <li className="min-w-0 break-words">
      <span className="text-[var(--text-mid)]">
        {icon} {label}:{' '}
      </span>
      <span className="font-medium">
        {ymd ? formatDateIL(ymd) : '—'}
        {days !== null ? (
          <span className="ms-1 text-[11px] text-[var(--text-light)]">
            ({days < 0 ? `פג לפני ${Math.abs(days)} ימים` : `עוד ${days} ימים`})
          </span>
        ) : null}
      </span>
    </li>
  )
}

function SiteBlock({
  record,
  today,
  onOpen,
  onEdit,
  onDelete,
}: {
  record: HostingRecord
  today: string
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const u = urgencyOf(minDaysUntilRenewal(record, today))
  const st = urgencyStyles(u)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`cursor-pointer rounded-[12px] border border-[var(--border)] border-s-4 p-3 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-mid)] sm:p-4 ${st.bar} ${st.borderS}`}
    >
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`}
            title={urgencyLabelHe(u)}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p
              dir="ltr"
              className="min-w-0 max-md:break-all text-[14px] font-extrabold text-[var(--blue-dark)] sm:text-[15px] md:truncate"
            >
              {record.domain.trim() || '—'}
            </p>
            {record.siteName.trim() ? (
              <p className="truncate text-[11px] text-[var(--text-mid)]">
                {record.siteName}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-2 text-[11px] font-bold text-[var(--blue-mid)] hover:bg-[var(--blue-light)] sm:w-auto sm:py-1"
          >
            עריכה
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="w-full rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-[11px] font-bold text-red-700 hover:bg-red-100 sm:w-auto sm:py-1"
          >
            מחק
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            record.serverType === 'private'
              ? 'bg-[var(--blue-light)] text-[var(--blue-dark)]'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          {record.serverType === 'private' ? '🔧' : '👥'}{' '}
          {SERVER_TYPE_LABEL[record.serverType]}
        </span>
        {record.greenInvoiceRetainer ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            🔁 רטיינר חשבונית ירוקה
            {typeof record.retainerAmount === 'number'
              ? ` · ₪${record.retainerAmount.toLocaleString('he-IL')}/${CYCLE_LABEL[record.retainerCycle]}`
              : ''}
          </span>
        ) : null}
      </div>

      <p className={`mb-2 text-[11px] font-semibold ${st.label}`}>
        {urgencyLabelHe(u)}
      </p>

      <ul className="space-y-1.5 text-[11px] text-[var(--text-dark)] sm:text-[12px]">
        <li className="min-w-0 break-words">
          <span className="text-[var(--text-mid)]">🖥️ שרת · מיקום: </span>
          <span className="font-medium">
            {record.serverProvider || '—'} · {record.serverLocation || '—'}
          </span>
        </li>
        <li className="min-w-0 break-words">
          <span className="text-[var(--text-mid)]">🏷️ רשם דומיין: </span>
          <span className="font-medium">{record.registrar || '—'}</span>
        </li>
        <li className="min-w-0 break-words">
          <span className="text-[var(--text-mid)]">👤 ניהול דומיין: </span>
          <span className="font-medium">
            {DOMAIN_MANAGER_LABEL[record.domainManager]}
            {record.domainManagerNote.trim()
              ? ` · ${record.domainManagerNote}`
              : ''}
          </span>
        </li>
        <DateLine
          icon="📅"
          label="חידוש דומיין"
          ymd={record.domainRenewalDate}
          today={today}
        />
        <DateLine
          icon="💳"
          label={`תשלום אחסון (${CYCLE_LABEL[record.hostingCycle]})`}
          ymd={record.hostingRenewalDate}
          today={today}
        />
        {record.sslExpiry ? (
          <DateLine
            icon="🔒"
            label="תפוגת SSL"
            ymd={record.sslExpiry}
            today={today}
          />
        ) : null}
        {record.platform.trim() || record.phpVersion.trim() ? (
          <li className="min-w-0 break-words">
            <span className="text-[var(--text-mid)]">⚙️ פלטפורמה · PHP: </span>
            <span className="font-medium">
              {record.platform || '—'} · {record.phpVersion || '—'}
            </span>
          </li>
        ) : null}
        {record.ipAddress.trim() ? (
          <li dir="ltr" className="min-w-0 text-end break-all">
            <span className="text-[var(--text-mid)]" dir="rtl">
              IP:{' '}
            </span>
            <span className="font-mono">{record.ipAddress}</span>
          </li>
        ) : null}
        {record.username.trim() ? (
          <li className="min-w-0 break-words">
            <span className="text-[var(--text-mid)]">🔑 משתמש: </span>
            <span dir="ltr" className="inline-block max-w-full break-all font-mono">
              {record.username}
            </span>
          </li>
        ) : null}
        {record.notes.trim() ? (
          <li className="min-w-0 break-words border-t border-[var(--border)] pt-2">
            <span className="text-[var(--text-mid)]">📝 הערות: </span>
            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed sm:text-[12px]">
              {record.notes}
            </p>
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-center text-[10px] font-medium text-[var(--text-light)]">
        לחץ לפרטים מלאים
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'red' | 'green' | 'blue' | 'neutral'
}) {
  const toneClass =
    tone === 'red'
      ? 'text-[#B91C1C]'
      : tone === 'green'
        ? 'text-emerald-700'
        : tone === 'blue'
          ? 'text-[var(--blue-dark)]'
          : 'text-[var(--text-dark)]'
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white px-3 py-2.5 text-center shadow-sm">
      <p className={`text-[20px] font-extrabold leading-none ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-[var(--text-mid)]">
        {label}
      </p>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
      {children}
    </label>
  )
}

function DetailRow({
  label,
  value,
  dir,
  highlight,
}: {
  label: string
  value: React.ReactNode
  dir?: 'ltr' | 'rtl'
  highlight?: boolean
}) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--border)] py-2.5 last:border-b-0">
      <span className="text-[11px] font-bold leading-relaxed text-[var(--text-mid)]">
        {label}
      </span>
      <span
        dir={dir}
        className={`min-w-0 break-words text-[13px] font-medium leading-relaxed ${
          highlight
            ? 'font-bold text-[var(--blue-dark)]'
            : 'text-[var(--text-dark)]'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-white p-3 shadow-sm sm:p-4">
      <h3 className="mb-2 flex items-center gap-2 border-b border-[var(--border)] pb-2 text-[13px] font-extrabold text-[var(--blue-dark)]">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      <div>{children}</div>
    </section>
  )
}

function DateDetailRow({
  label,
  ymd,
  today,
  cycle,
}: {
  label: string
  ymd: string
  today: string
  cycle?: string
}) {
  const days = daysUntil(ymd, today)
  if (!ymd) {
    return <DetailRow label={label} value="—" />
  }
  const datePart = formatDateIL(ymd)
  const daysPart =
    days !== null
      ? days < 0
        ? `פג לפני ${Math.abs(days)} ימים`
        : `עוד ${days} ימים`
      : ''
  const urgency = urgencyOf(days)
  const urgencyClass =
    urgency === 'red'
      ? 'text-[#B91C1C]'
      : urgency === 'yellow'
        ? 'text-amber-700'
        : 'text-emerald-700'
  return (
    <DetailRow
      label={cycle ? `${label} (${cycle})` : label}
      value={
        <span>
          {datePart}
          {daysPart ? (
            <span className={`ms-2 text-[12px] font-semibold ${urgencyClass}`}>
              ({daysPart})
            </span>
          ) : null}
        </span>
      }
    />
  )
}

function SiteDetailsModal({
  record,
  client,
  today,
  isOpen,
  onClose,
  onEdit,
}: {
  record: HostingRecord | null
  client: Client | undefined
  today: string
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
}) {
  if (!record) return null

  const u = urgencyOf(minDaysUntilRenewal(record, today))
  const st = urgencyStyles(u)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="פרטי אתר"
      size="lg"
      bodyClassName="max-h-[min(88vh,800px)] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* כותרת — דומיין + סטטוס */}
        <div
          className={`rounded-[12px] border border-s-4 p-4 ${st.bar} ${st.borderS}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                dir="ltr"
                className="text-[18px] font-extrabold text-[var(--blue-dark)] sm:text-[22px]"
              >
                {record.domain || '—'}
              </p>
              {record.siteName.trim() ? (
                <p className="mt-0.5 text-[13px] text-[var(--text-mid)]">
                  {record.siteName}
                </p>
              ) : null}
              <p className={`mt-2 text-[12px] font-semibold ${st.label}`}>
                {urgencyLabelHe(u)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  record.serverType === 'private'
                    ? 'bg-[var(--blue-light)] text-[var(--blue-dark)]'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {SERVER_TYPE_LABEL[record.serverType]}
              </span>
              {record.greenInvoiceRetainer ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                  רטיינר חשבונית ירוקה
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* לקוח */}
          <DetailSection title="לקוח משויך" icon="👤">
            {client ? (
              <>
                <DetailRow label="שם לקוח" value={client.name} highlight />
                {client.contact ? (
                  <DetailRow label="איש קשר" value={client.contact} />
                ) : null}
                {client.phone ? (
                  <DetailRow label="טלפון" value={client.phone} dir="ltr" />
                ) : null}
                {client.email ? (
                  <DetailRow label="אימייל" value={client.email} dir="ltr" />
                ) : null}
                {client.department ? (
                  <DetailRow label="מחלקה" value={client.department} />
                ) : null}
                {client.taxId ? (
                  <DetailRow label="ח.פ / עוסק" value={client.taxId} dir="ltr" />
                ) : null}
              </>
            ) : (
              <p className="py-2 text-[13px] text-[var(--text-mid)]">
                ללא לקוח משויך
              </p>
            )}
          </DetailSection>

          {/* דומיין */}
          <DetailSection title="דומיין" icon="🌐">
            <DetailRow label="דומיין" value={record.domain} dir="ltr" highlight />
            <DetailRow label="רשם דומיינים" value={record.registrar || '—'} />
            <DetailRow
              label="מי מנהל את הדומיין"
              value={
                record.domainManagerNote.trim()
                  ? `${DOMAIN_MANAGER_LABEL[record.domainManager]} · ${record.domainManagerNote}`
                  : DOMAIN_MANAGER_LABEL[record.domainManager]
              }
            />
            <DateDetailRow
              label="תאריך חידוש דומיין"
              ymd={record.domainRenewalDate}
              today={today}
            />
          </DetailSection>

          {/* שרת ואחסון */}
          <DetailSection title="שרת ואחסון" icon="🖥️">
            <DetailRow
              label="סוג שרת"
              value={SERVER_TYPE_LABEL[record.serverType]}
            />
            <DetailRow
              label="ספק / שרת"
              value={record.serverProvider || '—'}
            />
            <DetailRow
              label="מיקום שרת"
              value={record.serverLocation || '—'}
            />
            <DetailRow
              label="מחזור אחסון"
              value={CYCLE_LABEL[record.hostingCycle]}
            />
            <DateDetailRow
              label="תשלום / חידוש אחסון"
              ymd={record.hostingRenewalDate}
              today={today}
              cycle={CYCLE_LABEL[record.hostingCycle]}
            />
            {record.controlPanel.trim() ? (
              <DetailRow label="לוח בקרה" value={record.controlPanel} />
            ) : null}
            {record.username.trim() ? (
              <DetailRow label="משתמש" value={record.username} dir="ltr" />
            ) : null}
            {record.ipAddress.trim() ? (
              <DetailRow label="כתובת IP" value={record.ipAddress} dir="ltr" />
            ) : null}
          </DetailSection>

          {/* חיוב ורטיינר */}
          <DetailSection title="חיוב ורטיינר" icon="💳">
            <DetailRow
              label="רטיינר חשבונית ירוקה"
              value={record.greenInvoiceRetainer ? 'כן — פעיל' : 'לא'}
              highlight={record.greenInvoiceRetainer}
            />
            {record.greenInvoiceRetainer ? (
              <>
                <DetailRow
                  label="סכום רטיינר"
                  value={
                    typeof record.retainerAmount === 'number'
                      ? `₪${record.retainerAmount.toLocaleString('he-IL')}`
                      : '—'
                  }
                />
                <DetailRow
                  label="מחזור רטיינר"
                  value={CYCLE_LABEL[record.retainerCycle]}
                />
              </>
            ) : null}
          </DetailSection>
        </div>

        {/* טכני */}
        {(record.platform.trim() ||
          record.phpVersion.trim() ||
          record.sslExpiry) && (
          <DetailSection title="פרטים טכניים" icon="⚙️">
            {record.platform.trim() ? (
              <DetailRow label="פלטפורמה" value={record.platform} />
            ) : null}
            {record.phpVersion.trim() ? (
              <DetailRow label="גרסת PHP" value={record.phpVersion} dir="ltr" />
            ) : null}
            {record.sslExpiry ? (
              <DateDetailRow
                label="תפוגת SSL"
                ymd={record.sslExpiry}
                today={today}
              />
            ) : null}
          </DetailSection>
        )}

        {record.notes.trim() ? (
          <DetailSection title="הערות" icon="📝">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-dark)]">
              {record.notes}
            </p>
          </DetailSection>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--text-dark)] hover:bg-slate-50"
          >
            סגור
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              onEdit()
            }}
            className="rounded-[10px] bg-[var(--blue-mid)] px-5 py-2 text-[13px] font-bold text-white hover:brightness-110"
          >
            עריכת אתר
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 border-b border-[var(--border)] pb-1 text-[12px] font-extrabold text-[var(--blue-dark)]">
      {children}
    </h3>
  )
}

const inputClass =
  'w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[var(--text-dark)]'
const dateClass =
  'w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[var(--text-dark)]'

export function Hosting() {
  const { clients } = useClients()
  const {
    records,
    loading,
    error,
    addRecord,
    updateRecord,
    deleteRecord,
    deleteAllRecords,
  } = useHosting()
  const [q, setQ] = useState('')
  const [serverTypeFilter, setServerTypeFilter] = useState<'' | HostingServerType>(
    '',
  )
  const [retainerFilter, setRetainerFilter] = useState<'' | 'yes' | 'no'>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [viewingRecord, setViewingRecord] = useState<HostingRecord | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<HostingFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)

  const today = todayYmd()

  const clientById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const viewingClient = useMemo(
    () =>
      viewingRecord?.clientId
        ? clients.find((c) => c.id === viewingRecord.clientId)
        : undefined,
    [clients, viewingRecord?.clientId],
  )

  const filteredRecords = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return records.filter((r) => {
      if (serverTypeFilter && r.serverType !== serverTypeFilter) return false
      if (retainerFilter === 'yes' && !r.greenInvoiceRetainer) return false
      if (retainerFilter === 'no' && r.greenInvoiceRetainer) return false
      if (!needle) return true
      const clientName = clientById.get(r.clientId) ?? ''
      const hay =
        `${r.domain} ${r.siteName} ${clientName} ${r.registrar} ${r.serverProvider} ${r.notes}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [records, q, serverTypeFilter, retainerFilter, clientById])

  const stats = useMemo(() => {
    let shared = 0
    let priv = 0
    let retainer = 0
    let dueSoon = 0
    for (const r of records) {
      if (r.serverType === 'private') priv++
      else shared++
      if (r.greenInvoiceRetainer) retainer++
      const min = minDaysUntilRenewal(r, today)
      if (min !== null && min < 30) dueSoon++
    }
    return { total: records.length, shared, priv, retainer, dueSoon }
  }, [records, today])

  const groups = useMemo(() => {
    const m = new Map<string, HostingRecord[]>()
    for (const r of filteredRecords) {
      const cid = r.clientId || '_none'
      const arr = m.get(cid) ?? []
      arr.push(r)
      m.set(cid, arr)
    }
    const out: { clientId: string; name: string; items: HostingRecord[] }[] = []
    m.forEach((items, clientId) => {
      const name =
        clientId === '_none'
          ? 'ללא לקוח משויך'
          : (clientById.get(clientId) ?? `לקוח לא ידוע (${clientId})`)
      out.push({ clientId, name, items })
    })
    out.sort((a, b) => a.name.localeCompare(b.name, 'he'))
    for (const g of out) {
      g.items.sort((a, b) =>
        a.domain.localeCompare(b.domain, 'en', { sensitivity: 'base' }),
      )
    }
    return out
  }, [filteredRecords, clientById])

  const openView = (r: HostingRecord) => {
    setViewingRecord(r)
  }

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (r: HostingRecord) => {
    setEditingId(r.id)
    setForm(recordToForm(r))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.clientId.trim()) return
    if (!form.domain.trim()) return
    setSaving(true)
    try {
      const amountNum = Number(form.retainerAmount)
      const retainerAmount =
        form.greenInvoiceRetainer &&
        form.retainerAmount.trim() !== '' &&
        Number.isFinite(amountNum)
          ? amountNum
          : undefined
      const payload: Omit<HostingRecord, 'id' | 'createdAt' | 'updatedAt'> = {
        clientId: form.clientId.trim(),
        domain: form.domain.trim(),
        siteName: form.siteName.trim(),
        serverType: form.serverType,
        serverProvider: form.serverProvider.trim(),
        serverLocation: form.serverLocation.trim(),
        hostingRenewalDate: form.hostingRenewalDate.slice(0, 10),
        hostingCycle: form.hostingCycle,
        registrar: form.registrar.trim(),
        domainManager: form.domainManager,
        domainManagerNote: form.domainManagerNote.trim(),
        domainRenewalDate: form.domainRenewalDate.slice(0, 10),
        greenInvoiceRetainer: form.greenInvoiceRetainer,
        retainerAmount,
        retainerCycle: form.retainerCycle,
        sslExpiry: form.sslExpiry.slice(0, 10),
        ipAddress: form.ipAddress.trim(),
        controlPanel: form.controlPanel.trim(),
        username: form.username.trim(),
        platform: form.platform.trim(),
        phpVersion: form.phpVersion.trim(),
        notes: form.notes.trim(),
      }
      if (editingId) {
        await updateRecord(editingId, payload)
      } else {
        await addRecord(payload)
      }
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  const onDelete = useCallback(
    (r: HostingRecord) => {
      if (!window.confirm(`למחוק את האתר ${r.domain || r.id} מהמאגר?`)) return
      void deleteRecord(r.id)
    },
    [deleteRecord],
  )

  const onClearAll = useCallback(async () => {
    if (records.length === 0) return
    const answer = window.prompt(
      `פעולה בלתי הפיכה: מחיקת כל ${records.length} הרשומות מהמאגר.\nלאישור הקלד/י: מחק`,
    )
    if (answer?.trim() !== 'מחק') return
    setClearing(true)
    try {
      await deleteAllRecords()
    } finally {
      setClearing(false)
    }
  }, [records.length, deleteAllRecords])

  const errMsg = error?.message ?? null

  return (
    <div
      className="mx-auto max-w-[1200px] space-y-4 px-4 py-5 md:space-y-6 md:px-6 md:py-8 lg:px-8"
      style={{ fontFamily: "'Rubik', sans-serif" }}
    >
      <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 md:gap-4 md:pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight text-[var(--blue-dark)] md:text-[28px]">
            מאגר אחסון ודומיינים 🖥️
          </h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-mid)] md:text-[13px]">
            אתר אחר אתר — שרת, דומיין, רשם, מועדי חידוש ורטיינר · צבע לפי קרבת
            חידוש
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ExportExcelButton
            onClick={() =>
              exportHostingToExcel({
                records: filteredRecords,
                clientNameById: clientById,
              })
            }
            disabled={filteredRecords.length === 0}
          />
          {records.length > 0 ? (
            <button
              type="button"
              onClick={onClearAll}
              disabled={clearing}
              className="w-full rounded-[12px] border border-red-300 bg-white px-4 py-2.5 text-[13px] font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50 sm:w-auto"
            >
              {clearing ? 'מוחק…' : 'נקה מאגר'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={openNew}
            className="w-full justify-center rounded-[12px] bg-[var(--orange)] px-5 py-2.5 text-[14px] font-bold text-white shadow-md transition hover:brightness-110 sm:w-auto"
          >
            + הוסף אתר
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-5">
        <StatCard label="אתרים במאגר" value={stats.total} tone="blue" />
        <StatCard label="אחסון שיתופי" value={stats.shared} tone="neutral" />
        <StatCard label="שרת פרטי" value={stats.priv} tone="neutral" />
        <StatCard label="רטיינר פעיל" value={stats.retainer} tone="green" />
        <StatCard label="חידוש קרוב (30 יום)" value={stats.dueSoon} tone="red" />
      </div>

      <div
        className={`flex flex-col gap-3 rounded-2xl ${hubSectionClass(0)} p-3 shadow-sm md:flex-row md:flex-wrap md:items-end md:p-4`}
      >
        <div className="min-w-0 flex-1 md:min-w-[200px]">
          <FieldLabel>חיפוש (דומיין / לקוח / רשם / הערות)</FieldLabel>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="למשל example.co.il או שם לקוח…"
            className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)]"
          />
        </div>
        <div className="min-w-0 w-full md:w-auto md:min-w-[150px]">
          <FieldLabel>סוג שרת</FieldLabel>
          <select
            value={serverTypeFilter}
            onChange={(e) =>
              setServerTypeFilter(e.target.value as '' | HostingServerType)
            }
            className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-dark)]"
          >
            <option value="">הכל</option>
            <option value="shared">אחסון שיתופי</option>
            <option value="private">שרת פרטי</option>
          </select>
        </div>
        <div className="min-w-0 w-full md:w-auto md:min-w-[150px]">
          <FieldLabel>רטיינר חשבונית ירוקה</FieldLabel>
          <select
            value={retainerFilter}
            onChange={(e) =>
              setRetainerFilter(e.target.value as '' | 'yes' | 'no')
            }
            className="w-full rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px] text-[var(--text-dark)]"
          >
            <option value="">הכל</option>
            <option value="yes">עם רטיינר</option>
            <option value="no">ללא רטיינר</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-[11px] text-[var(--text-mid)] sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2 sm:text-[12px]">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#EF4444]" />{' '}
          פחות מ־30 יום או פג תוקף
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />{' '}
          פחות מ־60 יום
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />{' '}
          תקין
        </span>
      </div>

      {errMsg ? (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {errMsg}
        </div>
      ) : null}

      {loading ? (
        <p className="text-[var(--text-mid)]">טוען מאגר…</p>
      ) : groups.length === 0 ? (
        <div className="hub-empty-dashed rounded-[14px] p-6 text-center text-[var(--text-mid)] md:p-10">
          {records.length === 0
            ? 'המאגר ריק. התחילו להזין אתרים עם הכפתור "+ הוסף אתר".'
            : 'אין רשומות התואמות לסינון.'}
        </div>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {groups.map((g) => (
            <article
              key={g.clientId}
              className={`overflow-hidden rounded-2xl ${hubSectionClass(1)} shadow-none`}
            >
              <div className="border-b border-[var(--border)] bg-gradient-to-l from-[var(--blue-light)] to-white px-3 py-2.5 md:px-5 md:py-3">
                <h2 className="text-[15px] font-extrabold leading-snug text-[var(--blue-dark)] md:text-[17px]">
                  {g.name}
                </h2>
                <p className="text-[11px] text-[var(--text-mid)] md:text-[12px]">
                  {g.items.length} {g.items.length === 1 ? 'אתר' : 'אתרים'}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 xl:grid-cols-3">
                {g.items.map((r) => (
                  <SiteBlock
                    key={r.id}
                    record={r}
                    today={today}
                    onOpen={() => openView(r)}
                    onEdit={() => openEdit(r)}
                    onDelete={() => onDelete(r)}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <datalist id="hosting-provider-list">
        {PROVIDER_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="hosting-location-list">
        {LOCATION_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="hosting-registrar-list">
        {REGISTRAR_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="hosting-platform-list">
        {PLATFORM_HINTS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>

      <SiteDetailsModal
        record={viewingRecord}
        client={viewingClient}
        today={today}
        isOpen={viewingRecord !== null}
        onClose={() => setViewingRecord(null)}
        onEdit={() => {
          if (viewingRecord) openEdit(viewingRecord)
        }}
      />

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'עריכת אתר במאגר' : 'הוספת אתר למאגר'}
        size="lg"
        bodyClassName="max-h-[min(85vh,760px)] overflow-y-auto"
      >
        <form onSubmit={submit} className="space-y-4 text-[13px]">
          {/* ── זיהוי ── */}
          <SectionTitle>זיהוי האתר</SectionTitle>
          <div>
            <FieldLabel>לקוח *</FieldLabel>
            <ClientQuickSelect
              id="hosting-modal-client"
              clients={clients}
              value={form.clientId}
              onChange={(clientId) => setForm((f) => ({ ...f, clientId }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>דומיין *</FieldLabel>
              <input
                dir="ltr"
                value={form.domain}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domain: e.target.value }))
                }
                placeholder="example.co.il"
                className={inputClass}
                required
              />
            </div>
            <div>
              <FieldLabel>שם תצוגה (אופציונלי)</FieldLabel>
              <input
                value={form.siteName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, siteName: e.target.value }))
                }
                placeholder="אתר התדמית של הלקוח"
                className={inputClass}
              />
            </div>
          </div>

          {/* ── שרת ואחסון ── */}
          <SectionTitle>שרת ואחסון</SectionTitle>
          <div>
            <FieldLabel>סוג שרת *</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {(['shared', 'private'] as HostingServerType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, serverType: t }))}
                  className={`rounded-[10px] border px-3 py-2 text-[13px] font-bold transition ${
                    form.serverType === t
                      ? 'border-[var(--blue-mid)] bg-[var(--blue-light)] text-[var(--blue-dark)]'
                      : 'border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-slate-50'
                  }`}
                >
                  {t === 'private' ? '🔧 שרת פרטי' : '👥 אחסון שיתופי'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>ספק / שרת</FieldLabel>
              <input
                list="hosting-provider-list"
                value={form.serverProvider}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serverProvider: e.target.value }))
                }
                placeholder="Hostinger / AWS / שרת פרטי…"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>מיקום שרת</FieldLabel>
              <input
                list="hosting-location-list"
                value={form.serverLocation}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serverLocation: e.target.value }))
                }
                placeholder="ישראל / חו״ל"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>תאריך תשלום / חידוש אחסון</FieldLabel>
              <input
                type="date"
                value={form.hostingRenewalDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hostingRenewalDate: e.target.value }))
                }
                className={dateClass}
              />
            </div>
            <div>
              <FieldLabel>מחזור אחסון</FieldLabel>
              <select
                value={form.hostingCycle}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    hostingCycle: e.target.value as HostingBillingCycle,
                  }))
                }
                className={dateClass}
              >
                {CYCLE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {CYCLE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── דומיין ── */}
          <SectionTitle>דומיין</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>רשם דומיינים</FieldLabel>
              <input
                list="hosting-registrar-list"
                value={form.registrar}
                onChange={(e) =>
                  setForm((f) => ({ ...f, registrar: e.target.value }))
                }
                placeholder="GoDaddy / Cloudflare…"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>תאריך חידוש דומיין</FieldLabel>
              <input
                type="date"
                value={form.domainRenewalDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domainRenewalDate: e.target.value }))
                }
                className={dateClass}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>מי מנהל את הדומיין</FieldLabel>
              <select
                value={form.domainManager}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    domainManager: e.target.value as DomainManager,
                  }))
                }
                className={dateClass}
              >
                <option value="agency">האב מערכות</option>
                <option value="client">הלקוח</option>
                <option value="external">גורם חיצוני</option>
              </select>
            </div>
            <div>
              <FieldLabel>פרטי מנהל הדומיין (אם חיצוני)</FieldLabel>
              <input
                value={form.domainManagerNote}
                onChange={(e) =>
                  setForm((f) => ({ ...f, domainManagerNote: e.target.value }))
                }
                placeholder="שם / חברה / פרטי קשר"
                className={inputClass}
              />
            </div>
          </div>

          {/* ── חיוב / רטיינר ── */}
          <SectionTitle>חיוב ורטיינר</SectionTitle>
          <label className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.greenInvoiceRetainer}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  greenInvoiceRetainer: e.target.checked,
                }))
              }
              className="h-4 w-4"
            />
            <span className="text-[13px] font-bold text-[var(--text-dark)]">
              רטיינר אוטומטי בחשבונית ירוקה
            </span>
          </label>
          {form.greenInvoiceRetainer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>סכום הרטיינר (₪)</FieldLabel>
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={form.retainerAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, retainerAmount: e.target.value }))
                  }
                  placeholder="149"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <FieldLabel>מחזור רטיינר</FieldLabel>
                <select
                  value={form.retainerCycle}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      retainerCycle: e.target.value as HostingBillingCycle,
                    }))
                  }
                  className={dateClass}
                >
                  {CYCLE_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {CYCLE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {/* ── טכני (אופציונלי) ── */}
          <details className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-extrabold text-[var(--blue-dark)]">
              פרטים טכניים (אופציונלי)
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>תפוגת SSL</FieldLabel>
                  <input
                    type="date"
                    value={form.sslExpiry}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sslExpiry: e.target.value }))
                    }
                    className={dateClass}
                  />
                </div>
                <div>
                  <FieldLabel>כתובת IP</FieldLabel>
                  <input
                    dir="ltr"
                    value={form.ipAddress}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ipAddress: e.target.value }))
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>פלטפורמה</FieldLabel>
                  <input
                    list="hosting-platform-list"
                    value={form.platform}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, platform: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel>גרסת PHP</FieldLabel>
                  <input
                    dir="ltr"
                    value={form.phpVersion}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phpVersion: e.target.value }))
                    }
                    placeholder="8.2"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>לוח בקרה</FieldLabel>
                  <input
                    value={form.controlPanel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, controlPanel: e.target.value }))
                    }
                    placeholder="cPanel / CloudPanel…"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel>שם משתמש</FieldLabel>
                  <input
                    dir="ltr"
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>
            </div>
          </details>

          <div>
            <FieldLabel>הערות</FieldLabel>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full resize-y rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-2 text-[13px] font-bold text-[var(--text-dark)] hover:bg-slate-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || !form.clientId.trim() || !form.domain.trim()}
              className="rounded-[10px] bg-[var(--blue-mid)] px-5 py-2 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              {saving ? 'שומר…' : editingId ? 'עדכן' : 'שמור'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
