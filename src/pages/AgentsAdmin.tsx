import { useEffect, useMemo, useState } from 'react'
import { AgentClientsPanel } from '../components/admin/AgentClientsPanel'
import { AgentDealsPanel } from '../components/admin/AgentDealsPanel'
import { AgentSelectorBar } from '../components/admin/AgentSelectorBar'
import { AgentAdminOverview } from '../components/admin/AgentAdminOverview'
import { AgentsGlobalOverview } from '../components/admin/AgentsGlobalOverview'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { memberIsSalesAgentFlag } from '../lib/salesAgent'

type AdminTab = 'agents' | 'assignments'
type AgentSubTab = 'deals' | 'clients'

export function AgentsAdmin() {
  const { users: teamMembers, updateUserAgentCommissionPercent } = useUsers()
  const { clients, updateClient } = useClients()
  const [tab, setTab] = useState<AdminTab>('agents')
  const [agentSubTab, setAgentSubTab] = useState<AgentSubTab>('deals')
  const [assignClientId, setAssignClientId] = useState<string | null>(null)
  const [assignPick, setAssignPick] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [unassignedQuery, setUnassignedQuery] = useState('')

  const agents = useMemo(
    () => teamMembers.filter((m) => memberIsSalesAgentFlag(m) && m.active !== false),
    [teamMembers],
  )

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentId('')
      return
    }
    if (!selectedAgentId || !agents.some((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null

  const clientsWithoutAgent = useMemo(
    () => clients.filter((c) => !(c.salesAgentUserId ?? '').trim()),
    [clients],
  )

  const filteredUnassigned = useMemo(() => {
    const q = unassignedQuery.trim().toLowerCase()
    if (!q) return clientsWithoutAgent
    return clientsWithoutAgent.filter((c) => c.name.toLowerCase().includes(q))
  }, [clientsWithoutAgent, unassignedQuery])

  const tabBtn = (id: AdminTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        tab === id
          ? 'bg-[var(--orange)] text-white shadow-sm'
          : 'border border-[var(--border)] bg-white text-[var(--text-mid)] hover:bg-[var(--surface-muted)]'
      }`}
    >
      {label}
      {id === 'assignments' && clientsWithoutAgent.length > 0 ? (
        <span
          className={`ms-2 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
            tab === id ? 'bg-white/25 text-white' : 'bg-[var(--orange-light)] text-[var(--orange)]'
          }`}
        >
          {clientsWithoutAgent.length}
        </span>
      ) : null}
    </button>
  )

  const subTabBtn = (id: AgentSubTab, label: string) => (
    <button
      type="button"
      onClick={() => setAgentSubTab(id)}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
        agentSubTab === id
          ? 'bg-[var(--blue-mid)] text-white'
          : 'bg-[var(--surface-muted)] text-[var(--text-mid)] hover:bg-[var(--border)]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto w-full max-w-[min(100%,90rem)] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">מרכז ניהול סוכנים</h1>
          <p className="max-w-3xl text-[13px] leading-relaxed text-[var(--text-mid)]">
            ניהול מרוכז של <strong className="font-bold text-[var(--text-dark)]">כל</strong> סוכני
            המכירות. בחרו סוכן מהרשימה — כל עדכון (עסק, עסקה, תקבול מהלקוח, עמלה %) משתקף מיד
            בפורטל האישי שלו.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabBtn('agents', 'ניהול סוכנים')}
          {tabBtn('assignments', 'שיוך לקוחות')}
        </div>
      </header>

      {agents.length === 0 ? (
        <section className={`rounded-2xl p-6 ${hubSectionClass(0)}`}>
          <p className="text-sm text-[var(--text-mid)]">
            אין משתמשים מסומנים כסוכן. היכנסו ל־«משתמשים» וסמנו «סוכן מכירות».
          </p>
        </section>
      ) : tab === 'agents' ? (
        <div className="space-y-4">
          <AgentsGlobalOverview agents={agents} />

          <section
            className={`w-full rounded-2xl border border-[var(--border-orange-soft)] bg-gradient-to-l from-[#FFFBF7] to-[var(--dash-panel-bg)] p-4 md:p-6 ${hubSectionClass(2)}`}
            aria-label={selectedAgent ? `ניהול סוכן ${selectedAgent.name}` : 'ניהול סוכן'}
          >
            <AgentSelectorBar
              embedded
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              onUpdateCommission={(id, pct) => void updateUserAgentCommissionPercent(id, pct)}
            />

            {selectedAgent ? (
              <>
                <AgentAdminOverview key={selectedAgent.id} agent={selectedAgent} embedded />

                <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
                {subTabBtn('deals', 'עסקאות ותקבולים')}
                {subTabBtn('clients', 'לקוחות (עסקים)')}
              </div>

              <div className="mt-4">
                {agentSubTab === 'deals' ? (
                  <AgentDealsPanel
                    embedded
                    agentUserId={selectedAgent.id}
                    agentName={selectedAgent.name}
                    onAgentAssigned={setSelectedAgentId}
                  />
                ) : (
                  <AgentClientsPanel
                    embedded
                    agentUserId={selectedAgent.id}
                    agentName={selectedAgent.name}
                  />
                )}
              </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-mid)]">בחרו סוכן מהרשימה.</p>
            )}
          </section>
        </div>
      ) : (
        <section className={`rounded-2xl p-4 md:p-6 ${hubSectionClass(0)}`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-[var(--text-dark)]">
                לקוחות ללא סוכן ({clientsWithoutAgent.length})
              </h2>
              <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                שיוך לקוח מעביר אותו לפורטל «עסקים» ו«כספים» של הסוכן שנבחר.
              </p>
            </div>
            <input
              type="search"
              value={unassignedQuery}
              onChange={(e) => setUnassignedQuery(e.target.value)}
              placeholder="חיפוש לפי שם…"
              className="w-full max-w-xs rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm sm:ms-auto"
            />
          </div>

          {clientsWithoutAgent.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">כל הלקוחות משויכים לסוכן.</p>
          ) : filteredUnassigned.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין תוצאות לחיפוש.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead className="bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-light)]">
                  <tr>
                    <th className="px-3 py-2 text-right">לקוח</th>
                    <th className="px-3 py-2 text-right">שיוך לסוכן → פורטל</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnassigned.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2.5 font-semibold text-[var(--text-dark)]">{c.name}</td>
                      <td className="px-3 py-2.5">
                        {assignClientId === c.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={assignPick}
                              onChange={(e) => setAssignPick(e.target.value)}
                              className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1.5 text-xs"
                            >
                              <option value="">בחר סוכן</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!assignPick}
                              className="hub-btn-primary rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                              onClick={() => {
                                if (!assignPick) return
                                void updateClient(c.id, { salesAgentUserId: assignPick })
                                setAssignClientId(null)
                                setAssignPick('')
                                setSelectedAgentId(assignPick)
                                setTab('agents')
                                setAgentSubTab('clients')
                              }}
                            >
                              שמור
                            </button>
                            <button
                              type="button"
                              className="text-xs text-[var(--text-mid)] underline"
                              onClick={() => {
                                setAssignClientId(null)
                                setAssignPick('')
                              }}
                            >
                              ביטול
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--surface-muted)]"
                            onClick={() => {
                              setAssignClientId(c.id)
                              setAssignPick(selectedAgentId || agents[0]?.id || '')
                            }}
                          >
                            שייך סוכן
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
