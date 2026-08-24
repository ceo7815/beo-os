import { useEffect, useState } from 'react'
import { EmptyState } from '../shared/EmptyState'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import {
  AI_AGENT_COST_HINT,
  AI_AGENT_COST_LABEL,
  AI_AGENT_MODEL_PROVIDER,
  formatUsd,
} from '../../lib/aiAgentsDisplay'
import type { DisplayTool } from '../../lib/aiAgentsDisplay'
import { fetchLeadsCosts, type LeadsCostsReport } from '../../lib/leadsBeoApi'

/** בלוק עלויות צי — שי מדווח טוקני OpenAI; עדי עדיין בלי מדידה. */
export function FleetCostsBlock({
  leadsUsd = 0,
  leadsReady = false,
}: {
  leadsUsd?: number
  leadsReady?: boolean
}) {
  const leadsLabel = leadsReady ? formatUsd(leadsUsd) : AI_AGENT_COST_LABEL
  const monthLabel = leadsReady ? formatUsd(leadsUsd) : AI_AGENT_COST_LABEL
  return (
    <section className="beo-agent-panel space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="beo-agent-kicker">עלויות</p>
          <h2 className="mt-1 text-[15px] font-extrabold text-[var(--text-dark)]">עלויות צי</h2>
          <p className="mt-1 text-[12px] text-[var(--text-light)]">{AI_AGENT_COST_HINT}</p>
        </div>
        <p className="font-mono text-[12px] font-semibold text-[var(--text-mid)]">
          מודל / ספק · {AI_AGENT_MODEL_PROVIDER}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'עלות החודש', value: monthLabel },
          { label: 'Beo Social', value: AI_AGENT_COST_LABEL },
          { label: 'Beo Leads (שי)', value: leadsLabel },
          { label: 'ספק', value: AI_AGENT_MODEL_PROVIDER },
        ].map((cell) => (
          <div
            key={cell.label}
            className="beo-agent-stat !py-3"
          >
            <div className="text-[11px] font-semibold text-[var(--text-light)]">{cell.label}</div>
            <div className="mt-1 font-mono text-[20px] font-extrabold tabular-nums tracking-tight text-[var(--text-dark)]">
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function AgentCostsTabPanel({
  agentLabel,
  source,
}: {
  agentLabel: string
  source?: 'leads'
}) {
  const [report, setReport] = useState<LeadsCostsReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (source !== 'leads') return
    let cancelled = false
    void fetchLeadsCosts().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setReport(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [source])

  const rows = report?.days ?? []
  const totalUsd = report?.usd ?? 0
  const totalTokens = report?.total_tokens ?? 0
  const hasLive = source === 'leads' && report
  const hint = hasLive
    ? `מודל ${report?.model || 'OpenAI'} · טוקנים החודש ${totalTokens.toLocaleString()}`
    : AI_AGENT_COST_HINT

  return (
    <div className={`${hubSectionClass(3)} space-y-4 rounded-2xl p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">
            עלויות · {agentLabel}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-light)]">{hint}</p>
        </div>
        <div className="text-left">
          <div className="text-[11px] font-semibold text-[var(--text-light)]">החודש</div>
          <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
            {formatUsd(totalUsd)}
          </div>
        </div>
      </div>
      {error ? (
        <p className="text-[13px] text-amber-800">{error}</p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 text-right">
              {['תאריך', 'שירות', 'טוקנים', 'USD'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-[11px] font-bold text-[var(--text-mid)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-0">
                  <EmptyState
                    title="אין רשומות עלות"
                    description={
                      source === 'leads'
                        ? 'אחרי המחקר הבא יופיעו כאן טוקנים ועלות לפי הקריאות ל-OpenAI.'
                        : 'הטבלה תתמלא כש-Beo-agents ידווח על שימוש. לא מוצגים סכומים מדומים.'
                    }
                  />
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.date}-${row.kind}-${idx}`} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-mono text-[12px]">{row.date}</td>
                  <td className="px-3 py-2">{row.kind}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">
                    {(row.tokens ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">{formatUsd(row.usd ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ConnectionCubes({ tools }: { tools: DisplayTool[] }) {
  if (tools.length === 0) {
    return (
      <p className="text-[12px] text-[var(--text-light)]">אין חיבורים להצגה.</p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {tools.map((t) => (
        <div
          key={t.kind}
          className={`beo-agent-conn-cube ${t.connected ? 'is-on' : ''}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-bold text-[var(--text-dark)]">{t.label}</div>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                t.connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-slate-300'
              }`}
            />
          </div>
          <div
            className={`mt-1.5 text-[11px] font-semibold ${
              t.connected ? 'text-emerald-700' : 'text-[var(--text-light)]'
            }`}
          >
            {t.connected ? 'מחובר' : 'לא מחובר'}
            {t.hint ? (
              <span className="font-normal text-[var(--text-light)]"> · {t.hint}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ToolStatusLine({ tools }: { tools: DisplayTool[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {tools.map((t) => (
        <li
          key={t.kind}
          className="flex items-center justify-between gap-2 text-[12px] leading-snug"
        >
          <span className="text-[var(--text-dark)]">
            {t.label}
            {t.hint ? (
              <span className="text-[var(--text-light)]"> · {t.hint}</span>
            ) : null}
          </span>
          <span
            className={
              t.connected
                ? 'shrink-0 font-semibold text-emerald-700'
                : 'shrink-0 font-semibold text-[var(--text-light)]'
            }
          >
            {t.connected ? 'מחובר' : 'לא מחובר'}
          </span>
        </li>
      ))}
    </ul>
  )
}
