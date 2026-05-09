import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDateIL } from '../lib/dates'
import { boardStatusHe, priorityHe } from '../lib/boardTaskLabels'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { Modal } from './shared/Modal'
import type { Campaign, CampaignStatus, Project, ProjectStatus, Supplier, Task } from '../types'

const PROJECT_STATUS_HE: Record<ProjectStatus, string> = {
  active: 'פעיל',
  paused: 'מושהה',
  done: 'הושלם',
}

const CAMPAIGN_STATUS_HE: Record<CampaignStatus, string> = {
  planning: 'בתכנון',
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושלם',
}

type Props = {
  supplier: Supplier | null
  open: boolean
  onClose: () => void
  projects: Project[]
  campaigns: Campaign[]
  tasks: Task[]
  clientNameById: Map<string, string>
}

export function SupplierDetailModal(props: Props) {
  const { supplier, open, onClose, projects, campaigns, tasks, clientNameById } = props
  const navigate = useNavigate()

  const detail = useMemo(() => {
    if (!supplier) {
      return {
        projects: [] as Project[],
        campaigns: [] as Campaign[],
        tasks: [] as Task[],
      }
    }
    const sid = supplier.id
    const proj = projects
      .filter((p) => (p.supplierId ?? '').trim() === sid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const camp = campaigns
      .filter((c) => (c.supplierId ?? '').trim() === sid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const tsk = tasks
      .filter((t) => (t.supplierId ?? '').trim() === sid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { projects: proj, campaigns: camp, tasks: tsk }
  }, [supplier, projects, campaigns, tasks])

  if (!supplier) return null

  const phoneHref = supplier.phone?.trim()
    ? supplier.phone.replace(/\s/g, '')
    : ''
  const mailHref = supplier.email?.trim() ?? ''

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`שיוכים · ${supplier.name}`}
      size="xl"
      bodyClassName="max-h-[min(82vh,760px)] overflow-y-auto overflow-x-hidden"
    >
      <div className="space-y-4">
        <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-none`}>
          <h3 className="mb-2 text-[12px] font-bold text-[var(--text-light)]">פרטי ספק</h3>
          <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-bold text-[var(--text-light)]">טלפון</dt>
              <dd className="text-[var(--text-dark)]">
                {phoneHref ? (
                  <a className="font-medium text-[var(--orange)] hover:underline" href={`tel:${phoneHref}`} dir="ltr">
                    {supplier.phone}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold text-[var(--text-light)]">אימייל</dt>
              <dd className="break-all text-[var(--text-dark)]" dir="ltr">
                {mailHref ? (
                  <a className="font-medium text-[var(--orange)] hover:underline" href={`mailto:${mailHref}`}>
                    {supplier.email}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-bold text-[var(--text-light)]">סטטוס ברשימה</dt>
              <dd className="text-[var(--text-dark)]">
                {supplier.active === false ? 'לא פעיל' : 'פעיל'}
              </dd>
            </div>
          </dl>
        </section>

        <section className={`rounded-2xl ${hubSectionClass(1)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">פרויקטים משויכים</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/projects')
              }}
            >
              לעמוד פרויקטים
            </button>
          </div>
          {detail.projects.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין פרויקטים עם ספק ביצוע זה.</p>
          ) : (
            <ul className="space-y-2">
              {detail.projects.map((p) => (
                <li
                  key={p.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
                >
                  <button
                    type="button"
                    className="text-right text-[13px] font-semibold text-[var(--orange)] hover:underline"
                    onClick={() => {
                      onClose()
                      navigate(`/projects/${p.id}`)
                    }}
                  >
                    {p.name}
                  </button>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    {PROJECT_STATUS_HE[p.status]} · יעד {formatDateIL(p.dueDate)}
                    {p.clientId ? (
                      <> · לקוח: {clientNameById.get(p.clientId) ?? '—'}</>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {detail.campaigns.length > 0 ? (
          <section className={`rounded-2xl ${hubSectionClass(2)} p-4 shadow-none`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-dark)]">קמפיינים עם ספק זה</h3>
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
                onClick={() => {
                  onClose()
                  navigate('/campaigns')
                }}
              >
                לעמוד קמפיינים
              </button>
            </div>
            <ul className="space-y-2">
              {detail.campaigns.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[13px]"
                >
                  <span className="font-semibold text-[var(--text-dark)]">{c.name}</span>
                  <span className="ms-2 text-[11px] text-[var(--text-mid)]">
                    {CAMPAIGN_STATUS_HE[c.status]} · {formatDateIL(c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {detail.tasks.length > 0 ? (
          <section className={`rounded-2xl ${hubSectionClass(3)} p-4 shadow-none`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-dark)]">משימות עם ספק ישיר</h3>
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
                onClick={() => {
                  onClose()
                  navigate('/tasks')
                }}
              >
                לעמוד משימות
              </button>
            </div>
            <ul className="space-y-2">
              {detail.tasks.map((t) => (
                <li
                  key={t.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[12px]"
                >
                  <p className="font-semibold text-[var(--text-dark)]">{t.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    {boardStatusHe(t.status)} · {priorityHe(t.priority)} · יעד {formatDateIL(t.dueDate)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end border-t border-[var(--border)] pt-4">
        <button type="button" className="hub-btn-orange text-sm" onClick={onClose}>
          סגירה
        </button>
      </div>
    </Modal>
  )
}
