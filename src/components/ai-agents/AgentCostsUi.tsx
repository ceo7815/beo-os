import { EmptyState } from '../shared/EmptyState'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import {
  AI_AGENT_COST_HINT,
  AI_AGENT_COST_LABEL,
  AI_AGENT_MODEL_PROVIDER,
  formatUsd,
} from '../../lib/aiAgentsDisplay'
import type { DisplayTool } from '../../lib/aiAgentsDisplay'

/** בלוק עלויות צי — תמיד $0 עד שיהיה דיווח אמיתי. */
export function FleetCostsBlock() {
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
          { label: 'עלות החודש', value: AI_AGENT_COST_LABEL },
          { label: 'Beo Social', value: AI_AGENT_COST_LABEL },
          { label: 'Beo Leads (שי)', value: AI_AGENT_COST_LABEL },
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

export function AgentCostsTabPanel({ agentLabel }: { agentLabel: string }) {
  return (
    <div className={`${hubSectionClass(3)} space-y-4 rounded-2xl p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-extrabold text-[var(--text-dark)]">
            עלויות · {agentLabel}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-light)]">{AI_AGENT_COST_HINT}</p>
        </div>
        <div className="text-left">
          <div className="text-[11px] font-semibold text-[var(--text-light)]">החודש</div>
          <div className="text-[22px] font-extrabold tabular-nums text-[var(--text-dark)]">
            {formatUsd(0)}
          </div>
        </div>
      </div>
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
            <tr>
              <td colSpan={4} className="p-0">
                <EmptyState
                  title="אין רשומות עלות"
                  description="הטבלה תתמלא כש-Beo-agents ידווח על שימוש. לא מוצגים סכומים מדומים."
                />
              </td>
            </tr>
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
