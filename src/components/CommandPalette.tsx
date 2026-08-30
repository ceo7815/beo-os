import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AI_AGENT_BOARDS } from '../lib/aiAgentsRegistry'
import { useClients } from '../hooks/useClients'
import { useLeads } from '../hooks/useLeads'
import { useProjects } from '../hooks/useProjects'
import { useTasks } from '../hooks/useTasks'

type CmdItem = {
  id: string
  label: string
  hint?: string
  group: string
  to: string
}

const STATIC_PAGES: CmdItem[] = [
  { id: 'p-dash', label: 'דשבורד', group: 'ניווט', to: '/' },
  { id: 'p-leads', label: 'לידים', group: 'ניווט', to: '/leads' },
  { id: 'p-clients', label: 'לקוחות', group: 'ניווט', to: '/clients' },
  { id: 'p-projects', label: 'פרויקטים', group: 'ניווט', to: '/projects' },
  { id: 'p-tasks', label: 'משימות', group: 'ניווט', to: '/tasks' },
  { id: 'p-campaigns', label: 'קמפיינים', group: 'ניווט', to: '/campaigns' },
  { id: 'p-collections', label: 'גבייה', group: 'ניווט', to: '/collections' },
  { id: 'p-finance', label: 'כספים', group: 'ניווט', to: '/finance' },
  { id: 'p-agents', label: 'רשת סוכני AI', group: 'ניווט', to: '/ai-agents' },
  { id: 'p-agents-ov', label: 'סקירת סוכנים', group: 'ניווט', to: '/ai-agents/overview' },
  { id: 'p-leads-cold', label: 'לידים קרים', group: 'קיצור', to: '/leads?filter=cold' },
  { id: 'p-leads-open', label: 'צינור לידים פתוח', group: 'קיצור', to: '/leads?filter=open' },
  { id: 'p-approvals', label: 'אישורי שי', group: 'קיצור', to: '/ai-agents/leads-beo' },
  { id: 'p-johnny', label: 'ג׳וני', group: 'קיצור', to: '/ai-agents/johnny-beo' },
  ...AI_AGENT_BOARDS.map((b) => ({
    id: `agent-${b.id}`,
    label: b.displayName,
    hint: b.role,
    group: 'סוכנים',
    to: b.path,
  })),
]

/** חיפוש גלובלי Ctrl/Cmd+K */
export function CommandPalette() {
  const navigate = useNavigate()
  const { leads } = useLeads()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { tasks } = useTasks()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        setQ('')
        setActive(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const dynamic: CmdItem[] = [
      ...leads.slice(0, 80).map((l) => ({
        id: `lead-${l.id}`,
        label: l.company || l.name,
        hint: `ליד · ${l.status}`,
        group: 'לידים',
        to: `/leads`,
      })),
      ...clients.slice(0, 80).map((c) => ({
        id: `client-${c.id}`,
        label: c.name,
        hint: c.email || c.phone || 'לקוח',
        group: 'לקוחות',
        to: `/clients`,
      })),
      ...projects.slice(0, 60).map((p) => ({
        id: `proj-${p.id}`,
        label: p.name,
        hint: 'פרויקט',
        group: 'פרויקטים',
        to: `/projects/${p.id}`,
      })),
      ...tasks
        .filter((task) => task.status !== 'done')
        .slice(0, 40)
        .map((task) => ({
          id: `task-${task.id}`,
          label: task.title,
          hint: 'משימה',
          group: 'משימות',
          to: `/tasks`,
        })),
    ]
    const all = [...STATIC_PAGES, ...dynamic]
    if (!t) return all.slice(0, 24)
    return all
      .filter(
        (i) =>
          i.label.toLowerCase().includes(t) ||
          (i.hint || '').toLowerCase().includes(t) ||
          i.group.includes(t),
      )
      .slice(0, 40)
  }, [q, leads, clients, projects, tasks])

  useEffect(() => {
    setActive(0)
  }, [q])

  if (!open) return null

  const go = (item: CmdItem) => {
    setOpen(false)
    navigate(item.to)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/35 p-4 pt-[12vh] backdrop-blur-[2px]"
      role="dialog"
      aria-modal
      aria-label="חיפוש מהיר"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_24px_60px_-28px_rgba(61,28,116,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-4 py-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, items.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter' && items[active]) {
                e.preventDefault()
                go(items[active])
              }
            }}
            placeholder="חיפוש ליד, לקוח, פרויקט, משימה או מסך…"
            className="w-full border-0 bg-transparent text-[15px] font-semibold text-[var(--text-dark)] outline-none placeholder:text-[var(--text-light)]"
          />
          <p className="mt-1 text-[11px] text-[var(--text-light)]">
            Ctrl/Cmd+K · Esc לסגירה
          </p>
        </div>
        <ul className="max-h-[min(52vh,420px)] overflow-y-auto p-2">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-[var(--text-mid)]">
              אין תוצאות
            </li>
          ) : (
            items.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-right transition ${
                    idx === active ? 'bg-[var(--brand-light)]' : 'hover:bg-[var(--surface-muted)]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-[var(--text-dark)]">
                      {item.label}
                    </div>
                    {item.hint ? (
                      <div className="truncate text-[11px] text-[var(--text-light)]">{item.hint}</div>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-[var(--text-light)]">
                    {item.group}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
