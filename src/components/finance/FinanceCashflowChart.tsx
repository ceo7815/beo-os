import { useMemo, useState } from 'react'
import { formatNis } from '../../lib/financeCalc'
import { formatDateIL } from '../../lib/dates'
import type { CashflowDailyBalance } from '../../lib/cashflowCompute'

type Props = {
  daily: CashflowDailyBalance[]
  minBalance?: number
  minBalanceDate?: string
}

function compactNis(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₪${(abs / 1_000_000).toFixed(1)}מ׳`
  if (abs >= 1000) return `${sign}₪${Math.round(abs / 1000)}ק׳`
  return `${sign}₪${Math.round(abs)}`
}

/** גרף תזרim — קו יתרה + עמודות כניסות/יציאות */
export function FinanceCashflowChart({
  daily,
  minBalance,
  minBalanceDate,
}: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const chart = useMemo(() => {
    const w = 920
    const h = 320
    const padL = 54
    const padR = 16
    const padT = 28
    const padB = 48
    const innerW = w - padL - padR
    const innerH = h - padT - padB
    const n = Math.max(daily.length, 1)
    const slot = innerW / n
    const barW = Math.min(14, slot * 0.45)

    const balances = daily.map((d) => d.balance)
    const flows = daily.flatMap((d) => [d.inflow, d.outflow])
    const minVal = Math.min(0, ...balances, ...flows.map((f) => -f))
    const maxVal = Math.max(1, ...balances, ...flows)
    const span = maxVal - minVal || 1

    const yAt = (v: number) => padT + innerH - ((v - minVal) / span) * innerH
    const zeroY = yAt(0)

    const points = daily.map((d, i) => ({
      ...d,
      i,
      cx: padL + i * slot + slot / 2,
      balanceY: yAt(d.balance),
      inH: (d.inflow / span) * innerH,
      outH: (d.outflow / span) * innerH,
    }))

    const linePath =
      points.length === 0
        ? ''
        : points
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.balanceY.toFixed(1)}`,
            )
            .join(' ')

    const labelEvery = n > 24 ? Math.ceil(n / 12) : n > 14 ? 2 : 1

    return {
      w,
      h,
      padL,
      padR,
      padT,
      innerH,
      slot,
      barW,
      zeroY,
      points,
      linePath,
      minVal,
      maxVal,
      labelEvery,
    }
  }, [daily])

  const active = hover != null ? chart.points[hover] : null

  if (daily.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-10 text-center text-[13px] text-[var(--text-mid)]">
        אין נתונים לגרף — עדכנו יתרה או הרחיבו את טווח התקופה
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[#F8FAFC] via-[var(--dash-panel-bg)] to-[#F1F5F9] p-3 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-right">
          <h3 className="text-[13px] font-extrabold text-[var(--text-dark)]">
            יתרה צפויה
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
            קו = יתרה · ירוק = כניסות · אדום = יציאות
          </p>
        </div>
        {typeof minBalance === 'number' && minBalanceDate ? (
          <p
            className={`text-[11px] font-bold tabular-nums ${
              minBalance < 0 ? 'text-[#DC2626]' : 'text-[var(--text-mid)]'
            }`}
          >
            מינימום צפוי: {formatNis(minBalance)} · {formatDateIL(minBalanceDate)}
          </p>
        ) : null}
      </div>

      <div onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${chart.w} ${chart.h}`}
          className="h-auto w-full max-h-[360px]"
          role="img"
          aria-label="גרף תזרim מזומנים"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = chart.padT + chart.innerH * (1 - t)
            const val = chart.minVal + (chart.maxVal - chart.minVal) * t
            return (
              <g key={t}>
                <line
                  x1={chart.padL}
                  x2={chart.w - chart.padR}
                  y1={y}
                  y2={y}
                  stroke="rgba(148,163,184,0.28)"
                  strokeWidth={t === 0 ? 1.2 : 0.8}
                  strokeDasharray={t === 0 ? undefined : '3 7'}
                />
                <text
                  x={chart.padL - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#64748B"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {compactNis(val)}
                </text>
              </g>
            )
          })}

          <line
            x1={chart.padL}
            x2={chart.w - chart.padR}
            y1={chart.zeroY}
            y2={chart.zeroY}
            stroke="rgba(100,116,139,0.35)"
            strokeDasharray="4 4"
          />

          {chart.points.map((p) => {
            const isActive = hover === p.i
            return (
              <g key={p.date}>
                {p.inflow > 0 ? (
                  <rect
                    x={p.cx - chart.barW - 1}
                    y={chart.zeroY - p.inH}
                    width={chart.barW}
                    height={Math.max(p.inH, 2)}
                    rx={3}
                    fill="#059669"
                    opacity={hover == null || isActive ? 0.85 : 0.25}
                  />
                ) : null}
                {p.outflow > 0 ? (
                  <rect
                    x={p.cx + 1}
                    y={chart.zeroY}
                    width={chart.barW}
                    height={Math.max(p.outH, 2)}
                    rx={3}
                    fill="#DC2626"
                    opacity={hover == null || isActive ? 0.85 : 0.25}
                  />
                ) : null}
                {(p.i % chart.labelEvery === 0 ||
                  p.i === chart.points.length - 1) && (
                  <text
                    x={p.cx}
                    y={chart.h - 16}
                    textAnchor="middle"
                    fill={isActive ? '#0F172A' : '#64748B'}
                    style={{ fontSize: 9, fontWeight: isActive ? 800 : 600 }}
                  >
                    {formatDateIL(p.date).slice(0, 5)}
                  </text>
                )}
                <rect
                  x={p.cx - chart.slot / 2}
                  y={chart.padT}
                  width={chart.slot}
                  height={chart.innerH + 28}
                  fill="transparent"
                  onMouseEnter={() => setHover(p.i)}
                />
              </g>
            )
          })}

          {chart.linePath ? (
            <path
              d={chart.linePath}
              fill="none"
              stroke="#4F46E5"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {chart.points.map((p) => (
            <circle
              key={`dot-${p.date}`}
              cx={p.cx}
              cy={p.balanceY}
              r={hover === p.i ? 5 : 3}
              fill="#EEF2FF"
              stroke="#4F46E5"
              strokeWidth={2}
              className="pointer-events-none"
            />
          ))}
        </svg>

        {active ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 min-w-[160px] rounded-xl border border-white/70 bg-white/95 p-3 text-right shadow-lg backdrop-blur-sm">
            <div className="mb-1 text-[12px] font-extrabold text-[var(--text-dark)]">
              {formatDateIL(active.date)}
            </div>
            <div className="space-y-0.5 text-[11px]">
              <div className="flex justify-between gap-3">
                <span className="font-bold tabular-nums text-[#4F46E5]">
                  {formatNis(active.balance)}
                </span>
                <span className="text-[var(--text-mid)]">יתרה</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-bold tabular-nums text-[#059669]">
                  {formatNis(active.inflow)}
                </span>
                <span className="text-[var(--text-mid)]">כניסות</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="font-bold tabular-nums text-[#DC2626]">
                  {formatNis(active.outflow)}
                </span>
                <span className="text-[var(--text-mid)]">יציאות</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
