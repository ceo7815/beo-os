import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AI_AGENT_COST_LABEL,
  type DisplayTool,
} from '../../lib/aiAgentsDisplay'
import { getAgentProfile } from '../../lib/aiAgentProfiles'
import { ConnectionCubes } from '../../components/ai-agents/AgentCostsUi'
import { AgentAvatar } from '../../components/ai-agents/AgentProfilePanel'

export type AgentBoardTab = {
  id: string
  label: string
}

export function AgentBoardShell({
  boardId,
  displayName,
  role,
  handle,
  purpose,
  statusBadge,
  tabs,
  activeTab,
  onTabChange,
  banner,
  tools,
  children,
}: {
  boardId?: string
  displayName: string
  role?: string
  handle?: string
  /** משפט קצר — fallback אם אין בפרופיל */
  purpose?: string
  statusBadge: ReactNode
  tabs: AgentBoardTab[]
  activeTab: string
  onTabChange: (id: string) => void
  banner?: ReactNode
  tools?: DisplayTool[]
  children: ReactNode
}) {
  const profile = boardId ? getAgentProfile(boardId) : undefined
  const personName = profile?.personName || displayName
  const title = profile?.title || role
  const tagline = profile?.tagline || purpose || ''
  const email = profile?.email && profile.email !== '—' ? profile.email : null

  return (
    <div className="beo-page beo-agent-deck space-y-5">
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--text-light)]">
        <Link to="/ai-agents" className="font-semibold text-[var(--brand)] hover:underline">
          סוכני AI
        </Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-[var(--text-mid)]">{displayName}</span>
      </nav>

      <header className="beo-agent-panel beo-agent-panel--hero overflow-hidden">
        <div className="beo-agent-panel-grid" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-5 p-5 md:p-6">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            {boardId ? <AgentAvatar boardId={boardId} size="lg" editable /> : null}
            <div className="min-w-0 flex-1">
              <p className="beo-agent-kicker">חדר בקרה</p>
              <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-[var(--text-dark)] md:text-[30px]">
                {personName}
                {personName !== displayName ? (
                  <span className="mr-2 text-[16px] font-bold text-[var(--text-mid)]">
                    · {displayName}
                  </span>
                ) : null}
              </h1>
              {title ? (
                <p className="mt-1 text-[14px] font-semibold text-[var(--brand-deep)]">{title}</p>
              ) : null}
              {tagline ? (
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--text-mid)]">
                  {tagline}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
                {email ? (
                  <a
                    href={`mailto:${email}`}
                    className="font-mono font-bold text-[var(--brand)] hover:underline"
                    dir="ltr"
                  >
                    {email}
                  </a>
                ) : null}
                {handle ? (
                  <span className="font-mono text-[var(--text-light)]" dir="ltr">
                    {handle}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {statusBadge}
            <div className="rounded-xl border border-[var(--border)] bg-white/80 px-3 py-2 text-left">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-light)]">
                עלות החודש
              </div>
              <div className="font-mono text-[18px] font-extrabold tabular-nums text-[var(--text-dark)]">
                {AI_AGENT_COST_LABEL}
              </div>
            </div>
          </div>
        </div>
      </header>

      {banner}

      {tools && tools.length > 0 ? (
        <section>
          <h2 className="beo-agent-section-title mb-2">חיבורים חיים</h2>
          <ConnectionCubes tools={tools} />
        </section>
      ) : null}

      <nav aria-label={`טאבים של ${displayName}`} className="beo-agent-tabs">
        {tabs.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`beo-agent-tab ${active ? 'is-active' : ''}`}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div>{children}</div>
    </div>
  )
}

export function AgentStatGrid({
  items,
}: {
  items: { label: string; value: string | number }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="beo-agent-stat">
          <div className="font-mono text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
            {item.value}
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-mid)]">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

export function AgentConnectionsList({
  connections,
  emptyHint,
}: {
  connections: { kind: string; label: string; connected: boolean; note?: string }[]
  emptyHint?: string
}) {
  if (connections.length === 0) {
    return (
      <p className="text-[13px] text-[var(--text-mid)]">
        {emptyHint ?? 'אין נתוני חיבורים להצגה.'}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {connections.map((c) => (
        <div
          key={c.kind}
          className={`beo-agent-conn ${c.connected ? 'is-on' : 'is-off'}`}
        >
          <span className="beo-agent-conn-led" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-[var(--text-dark)]">{c.label}</div>
            {c.note ? (
              <div className="text-[12px] text-[var(--text-light)]">{c.note}</div>
            ) : null}
          </div>
          <span className="beo-agent-conn-state">
            {c.connected ? 'מחובר' : 'לא מחובר'}
          </span>
        </div>
      ))}
    </div>
  )
}
