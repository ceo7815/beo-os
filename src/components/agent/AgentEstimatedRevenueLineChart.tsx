import { useId } from 'react'
import { dayAxisLabel } from '../../lib/agentRevenue'
import type { AgentRevenueDayBar } from './AgentRevenueDailyChart'

type ChartVariant = 'card' | 'plain'

/** גרף קווים — הכנסות משוערות יומיות */
export function AgentEstimatedRevenueLineChart({
  bars,
  variant = 'card',
}: {
  bars: AgentRevenueDayBar[]
  variant?: ChartVariant
}) {
  const gradId = useId().replace(/:/g, 'g')
  const max = Math.max(1, ...bars.map((b) => b.total))
  const w = 720
  const h = 240
  const padL = 40
  const padR = 12
  const padT = 26
  const padB = 52
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const n = bars.length || 1
  const span = Math.max(1, n - 1)

  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i / span) * innerW
  const yAt = (total: number) => padT + innerH - (total / max) * innerH

  const wrapClass =
    variant === 'plain'
      ? 'w-full overflow-hidden px-1 pb-1 pt-0'
      : 'w-full overflow-hidden rounded-2xl border border-[var(--border-orange-soft)] bg-gradient-to-b from-[#FFFBF7] to-[var(--dash-panel-bg)] p-4 shadow-[0_2px_12px_rgba(249,115,22,0.08)]'

  const labelEvery = n > 20 ? 3 : n > 14 ? 2 : 1

  const pts = bars.map((b, i) => ({ x: xAt(i), y: yAt(b.total), b, i }))
  const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const baseY = padT + innerH
  const areaD = `${lineD} L ${pts[pts.length - 1]?.x ?? padL} ${baseY} L ${pts[0]?.x ?? padL} ${baseY} Z`

  return (
    <div className={wrapClass}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-h-[280px]"
        role="img"
        aria-label="גרף הכנסות משוערות יומי"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(251,146,60,0.35)" />
            <stop offset="100%" stopColor="rgba(251,146,60,0.02)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t)
          return (
            <line
              key={t}
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="rgba(148,163,184,0.35)"
              strokeWidth={t === 0 ? 1.2 : 0.8}
              strokeDasharray={t === 0 ? undefined : '4 6'}
            />
          )
        })}
        <path d={areaD} fill={`url(#${gradId})`} stroke="none" />
        <path
          d={lineD}
          fill="none"
          stroke="#EA580C"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map(({ x, y, b, i }) => (
          <g key={b.ymd}>
            <circle cx={x} cy={y} r={3.5} fill="#FFF7ED" stroke="#EA580C" strokeWidth={1.5} />
            {(i % labelEvery === 0 || i === n - 1) && (
              <text
                x={x}
                y={h - 12}
                textAnchor="middle"
                className="fill-[var(--text-mid)]"
                style={{ fontSize: 9, fontWeight: 600 }}
              >
                {dayAxisLabel(b.ymd)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
