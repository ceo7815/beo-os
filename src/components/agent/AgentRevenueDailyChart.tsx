import { dayAxisLabel } from '../../lib/agentRevenue'

export type AgentRevenueDayBar = { ymd: string; total: number }

const fmtCompact = (n: number) =>
  new Intl.NumberFormat('he-IL', {
    notation: n >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 100_000 ? 1 : 0,
  }).format(n)

type ChartVariant = 'card' | 'plain'

/** גרף עמודות — סיכום יומי (למשל 30 ימים) */
export function AgentRevenueDailyChart({
  bars,
  variant = 'card',
}: {
  bars: AgentRevenueDayBar[]
  variant?: ChartVariant
}) {
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
  const gap = 2
  const barW = Math.max(2, (innerW - gap * (n - 1)) / n)

  const wrapClass =
    variant === 'plain'
      ? 'w-full overflow-hidden px-1 pb-1 pt-0'
      : 'w-full overflow-hidden rounded-2xl border border-[var(--border-orange-soft)] bg-gradient-to-b from-[#FFFBF7] to-[var(--dash-panel-bg)] p-4 shadow-[0_2px_12px_rgba(249,115,22,0.08)]'

  const labelEvery = n > 20 ? 3 : n > 14 ? 2 : 1

  return (
    <div className={wrapClass}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-h-[280px]"
        role="img"
        aria-label="גרף הכנסות יומי"
      >
        <defs>
          <linearGradient id="agentDailyBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
          <filter id="agentDailyBarShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
          </filter>
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
        {bars.map((b, i) => {
          const x = padL + i * (barW + gap)
          const bh = (b.total / max) * innerH
          const y = padT + innerH - bh
          const showVal = b.total > 0 && barW >= 10
          const showTick = i % labelEvery === 0 || i === n - 1
          return (
            <g key={b.ymd}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(bh, 2)}
                rx={barW >= 6 ? 4 : 1}
                fill="url(#agentDailyBarGrad)"
                filter="url(#agentDailyBarShadow)"
                opacity={b.total > 0 ? 1 : 0.35}
              />
              {showVal ? (
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="fill-[var(--text-dark)]"
                  style={{ fontSize: 9, fontWeight: 700 }}
                >
                  {fmtCompact(b.total)} ₪
                </text>
              ) : null}
              {showTick ? (
                <text
                  x={x + barW / 2}
                  y={h - 12}
                  textAnchor="middle"
                  className="fill-[var(--text-mid)]"
                  style={{ fontSize: 9, fontWeight: 600 }}
                >
                  {dayAxisLabel(b.ymd)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
