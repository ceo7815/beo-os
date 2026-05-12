import { useMemo, type ReactNode } from 'react'
import { formatDateIL, formatTaskDueDisplay } from '../lib/dates'
import { supplierDisplayName } from '../lib/supplierDisplay'
import { useLeads } from '../hooks/useLeads'
import { Modal } from './shared/Modal'
import type { Meeting } from '../types'

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[11px] font-bold text-[var(--text-mid)]">
        {label}
      </p>
      <div className="text-[14px] font-semibold leading-relaxed text-[var(--text-dark)]">
        {children}
      </div>
    </div>
  )
}

export function MeetingPreviewModal(props: {
  meetingId: string | null
  meeting: Meeting | undefined
  listLoading: boolean
  uid: string
  canAdmin: boolean
  clientById: Map<string, string>
  projectById: Map<string, string>
  supplierById: Map<string, string>
  teamMembers: { id: string; name: string }[]
  onClose: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { leads } = useLeads()
  const open = Boolean(props.meetingId)

  const leadLine = useMemo(() => {
    const m = props.meeting
    if (!m?.leadId?.trim()) return null
    const l = leads.find((x) => x.id === m.leadId)
    const name = l?.name?.trim()
    return name
      ? `${name}${l?.company ? ` · ${l.company}` : ''}`
      : m.leadId
  }, [props.meeting, leads])

  if (!open) return null

  const m = props.meeting
  const title = m?.title?.trim() || 'פגישה'

  return (
    <Modal
      isOpen={open}
      onClose={props.onClose}
      title={title}
      size="xl"
      bodyClassName="max-h-[min(78vh,760px)] overflow-y-auto space-y-5 pb-2"
    >
      {!m ? (
        <p className="text-sm text-[var(--text-mid)]">
          {props.listLoading
            ? 'טוען פרטי פגישה…'
            : 'הפגישה לא נמצאה ברשימה (אולי נמחקה או שאין הרשאת צפייה).'}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="מועד">
              {formatDateIL(m.startDate.slice(0, 10))}
              {m.startTime || m.endTime ? (
                <span className="mt-1 block text-[13px] font-normal text-[var(--text-mid)]">
                  {formatTaskDueDisplay(m.startDate, m.startTime)}
                  {m.endTime ? ` – ${m.endTime}` : ''}
                </span>
              ) : (
                <span className="mt-1 block text-[12px] font-normal text-[var(--text-mid)]">
                  ללא שעה מדויקת (מוצגת בשורת «כל היום»)
                </span>
              )}
            </Field>
            <Field label="מיקום / קישור">
              {m.location?.trim() ? (
                <span className="break-all font-mono text-[13px]">{m.location}</span>
              ) : (
                <span className="text-[var(--text-mid)]">—</span>
              )}
            </Field>
            <Field label="מאורגן">
              {props.teamMembers.find((t) => t.id === m.organizerUserId)?.name ??
                '—'}
            </Field>
            <Field label="משתתפים">
              {m.participantUserIds.length === 0 ? (
                <span className="text-[var(--text-mid)]">—</span>
              ) : (
                <ul className="list-inside list-disc space-y-0.5 text-[13px] font-normal">
                  {m.participantUserIds.map((pid) => (
                    <li key={pid}>
                      {props.teamMembers.find((t) => t.id === pid)?.name ?? pid}
                    </li>
                  ))}
                </ul>
              )}
            </Field>
            <Field label="לקוח">
              {m.clientId
                ? props.clientById.get(m.clientId) ?? m.clientId
                : '—'}
            </Field>
            <Field label="פרויקט">
              {m.projectId
                ? props.projectById.get(m.projectId) ?? m.projectId
                : '—'}
            </Field>
            <Field label="ספק">
              {supplierDisplayName(m.supplierId, props.supplierById) ?? '—'}
            </Field>
            <Field label="ליד">{leadLine ?? '—'}</Field>
          </div>

          {m.excludeCreatorFromAttendees ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-[12px] text-amber-950">
              יוצר הפגישה לא משתתף ביומן ובהזמנה (לפי הגדרת הפגישה).
            </p>
          ) : null}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4">
            <Field label="מטרה">
              <pre
                dir="auto"
                className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13px] font-normal leading-relaxed text-[var(--text-mid)]"
              >
                {m.purpose?.trim() ? m.purpose : '—'}
              </pre>
            </Field>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/50 p-4">
            <Field label="תוכן / סדר יום">
              <pre
                dir="auto"
                className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[13px] font-normal leading-relaxed text-[var(--text-mid)]"
              >
                {m.agenda?.trim() ? m.agenda : '—'}
              </pre>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
            >
              סגור
            </button>
            <button
              type="button"
              onClick={() => props.onEdit(m.id)}
              className="rounded-xl border border-[var(--orange)] bg-[var(--orange-light)] px-4 py-2 text-sm font-bold text-[var(--orange)] transition hover:bg-[#ffeadc]"
            >
              עריכה
            </button>
            {(m.createdBy === props.uid ||
              m.organizerUserId === props.uid ||
              props.canAdmin) && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('למחוק את הפגישה?')) return
                  props.onDelete(m.id)
                  props.onClose()
                }}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
              >
                מחק
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
