import { useId, useMemo, useState } from 'react'
import { formatNis, type ProfitLossRow } from '../../lib/financeCalc'

type SeriesKey = 'income' | 'expense' | 'profit'

type Props = {
  rows: ProfitLossRow[]
  onMonthClick?: (row: ProfitLossRow) => void
}

const SERIES: {
  key: SeriesKey
  label: string
  color: string
  soft: string
}[] = [
  { key: 'income', label: 'הכנסות', color: '#059669', soft: '#D1FAE5' },
  { key: 'expense', label: 'הוצאות', color: '#DC2626', soft: '#FEE2E2' },
  { key: 'profit', label: 'רווח נקי', color: '#4F46E5', soft: '#E0E7FF' },
]

function shortMonth(ym: string): string {
  const m = Number(ym.slice(5, 7))
  const names = [
    'ינו׳',
    'פבר׳',
    'מרץ',
    'אפר׳',
    'מאי',
    'יונ׳',
    'יול׳',
    'אוג׳',
    'ספט׳',
    'אוק׳',
    'נוב׳',
    'דצמ׳',
  ]
  return names[m - 1] ?? ym
}

function compactNis(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) {
    return `${sign}₪${(abs / 1_000_000).toFixed(1)}מ׳`
  }
  if (abs >= 1000) {
    return `${sign}₪${Math.round(abs / 1000)}ק׳`
  }
  return `${sign}₪${Math.round(abs)}`
}

/**
 * גרף רווח והפסד אינטראקטיבי — עמודות הכנסות/הוצאות + קו רווח נקי.
 * תצוגה בלבד על נתוני ProfitLossRow הקיימים.
 */
export function FinancePnlChart({ rows, onMonthClick }: Props) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    income: true,
    expense: true,
    profit: true,
  })

  const chart = useMemo(() => {
    const w = 920
    const h = 320
    const padL = 54
    const padR = 54
    const padT = 28
    const padB = 48
    const innerW = w - padL - padR
    const innerH = h - padT - padB
    const n = Math.max(rows.length, 1)
    const slot = innerW / n
    const groupW = Math.min(52, slot * 0.62)
    const barW = groupW / 2 - 2

    const barMax = Math.max(
      1,
      ...rows.map((r) => Math.max(r.incomeGross, r.expenseGross)),
    )
    const profitAbsMax = Math.max(
      1,
      ...rows.map((r) => Math.abs(r.trueNetProfit)),
    )
    const zeroY = padT + innerH

    const barY = (v: number) =>
      padT + innerH - (Math.max(0, v) / barMax) * innerH
    const barH = (v: number) => (Math.max(0, v) / barMax) * innerH
    const profitY = (v: number) =>
      padT + innerH - ((v + profitAbsMax) / (profitAbsMax * 2)) * innerH
    const profitZeroY = profitY(0)

    const points = rows.map((row, i) => {
      const cx = padL + i * slot + slot / 2
      return {
        row,
        i,
        cx,
        incomeX: cx - groupW / 2,
        expenseX: cx + 2,
        incomeH: barH(row.incomeGross),
        expenseH: barH(row.expenseGross),
        incomeY: barY(row.incomeGross),
        expenseY: barY(row.expenseGross),
        profitY: profitY(row.trueNetProfit),
      }
    })

    const profitPath =
      points.length === 0
        ? ''
        : points
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.profitY.toFixed(1)}`,
            )
            .join(' ')

    const areaPath =
      points.length === 0
        ? ''
        : `${profitPath} L ${points[points.length - 1]!.cx.toFixed(1)} ${profitZeroY.toFixed(1)} L ${points[0]!.cx.toFixed(1)} ${profitZeroY.toFixed(1)} Z`

    const leftTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      t,
      y: padT + innerH * (1 - t),
      label: compactNis(barMax * t),
    }))
    const rightTicks = [-1, -0.5, 0, 0.5, 1].map((t) => ({
      t,
      y: profitY(profitAbsMax * t),
      label: compactNis(profitAbsMax * t),
    }))

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH,
      zeroY,
      barW,
      points,
      profitPath,
      areaPath,
      profitZeroY,
      leftTicks,
      rightTicks,
      barMax,
      profitAbsMax,
    }
  }, [rows])

  const active = hover != null ? chart.points[hover] : null

  function toggle(key: SeriesKey) {
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (!next.income && !next.expense && !next.profit) return prev
      return next
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-10 text-center text-[13px] text-[var(--text-mid)]">
        אין נתונים להצגה בגרף
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-b from-[#F8FAFC] via-[var(--dash-panel-bg)] to-[#F1F5F9] p-3 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-right">
          <h3 className="text-[13px] font-extrabold text-[var(--text-dark)]">
            מגמת רווח והפסד
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-mid)]">
            עמודות = הכנסות מול הוצאות · קו = רווח נקי · ריחוף לפירוט
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SERIES.map((s) => {
            const on = visible[s.key]
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggle(s.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                  on
                    ? 'border-transparent text-[var(--text-dark)] shadow-sm'
                    : 'border-[var(--border)] text-[var(--text-light)] opacity-60'
                }`}
                style={{ background: on ? s.soft : 'transparent' }}
                title={on ? `הסתר ${s.label}` : `הצג ${s.label}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        className="relative"
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${chart.w} ${chart.h}`}
          className="h-auto w-full max-h-[360px]"
          role="img"
          aria-label="גרף רווח והפסד לפי חודש"
        >
          <defs>
            <linearGradient id={`inc-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id={`exp-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="100%" stopColor="#DC2626" />
            </linearGradient>
            <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(79,70,229,0.22)" />
              <stop offset="100%" stopColor="rgba(79,70,229,0.02)" />
            </linearGradient>
            <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.18" />
            </filter>
          </defs>

          {chart.leftTicks.map((tick) => (
            <g key={`g-${tick.t}`}>
              <line
                x1={chart.padL}
                x2={chart.w - chart.padR}
                y1={tick.y}
                y2={tick.y}
                stroke="rgba(148,163,184,0.28)"
                strokeWidth={tick.t === 0 ? 1.2 : 0.8}
                strokeDasharray={tick.t === 0 ? undefined : '3 7'}
              />
              <text
                x={chart.padL - 8}
                y={tick.y + 3.5}
                textAnchor="end"
                fill="#64748B"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {visible.profit
            ? chart.rightTicks.map((tick) => (
                <text
                  key={`r-${tick.t}`}
                  x={chart.w - chart.padR + 8}
                  y={tick.y + 3.5}
                  textAnchor="start"
                  fill="#6366F1"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {tick.label}
                </text>
              ))
            : null}

          {visible.profit ? (
            <line
              x1={chart.padL}
              x2={chart.w - chart.padR}
              y1={chart.profitZeroY}
              y2={chart.profitZeroY}
              stroke="rgba(79,70,229,0.35)"
              strokeWidth={1}
              strokeDasharray="5 5"
            />
          ) : null}

          {chart.points.map((p) => {
            const isActive = hover === p.i
            return (
              <g key={p.row.ym}>
                {isActive ? (
                  <rect
                    x={p.cx - chart.innerW / rows.length / 2 + 2}
                    y={chart.padT}
                    width={Math.max(8, chart.innerW / rows.length - 4)}
                    height={chart.innerH}
                    rx={10}
                    fill="rgba(15,23,42,0.04)"
                  />
                ) : null}

                {visible.income ? (
                  <rect
                    x={p.incomeX}
                    y={p.incomeY}
                    width={chart.barW}
                    height={Math.max(p.incomeH, p.row.incomeGross > 0 ? 2 : 0)}
                    rx={6}
                    fill={`url(#inc-${uid})`}
                    filter={isActive ? `url(#glow-${uid})` : undefined}
                    opacity={hover == null || isActive ? 1 : 0.35}
                    className="transition-opacity duration-150"
                  />
                ) : null}

                {visible.expense ? (
                  <rect
                    x={p.expenseX}
                    y={p.expenseY}
                    width={chart.barW}
                    height={Math.max(p.expenseH, p.row.expenseGross > 0 ? 2 : 0)}
                    rx={6}
                    fill={`url(#exp-${uid})`}
                    filter={isActive ? `url(#glow-${uid})` : undefined}
                    opacity={hover == null || isActive ? 1 : 0.35}
                    className="transition-opacity duration-150"
                  />
                ) : null}

                <text
                  x={p.cx}
                  y={chart.h - 16}
                  textAnchor="middle"
                  fill={isActive ? '#0F172A' : '#64748B'}
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 800 : 600,
                  }}
                >
                  {shortMonth(p.row.ym)}
                </text>

                <rect
                  x={p.cx - chart.innerW / rows.length / 2}
                  y={chart.padT}
                  width={chart.innerW / rows.length}
                  height={chart.innerH + 28}
                  fill="transparent"
                  className={onMonthClick ? 'cursor-pointer' : 'cursor-crosshair'}
                  onMouseEnter={() => setHover(p.i)}
                  onFocus={() => setHover(p.i)}
                  onClick={() => onMonthClick?.(p.row)}
                />
              </g>
            )
          })}

          {visible.profit && chart.areaPath ? (
            <path d={chart.areaPath} fill={`url(#area-${uid})`} />
          ) : null}
          {visible.profit && chart.profitPath ? (
            <path
              d={chart.profitPath}
              fill="none"
              stroke="#4F46E5"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {visible.profit
            ? chart.points.map((p) => (
                <circle
                  key={`dot-${p.row.ym}`}
                  cx={p.cx}
                  cy={p.profitY}
                  r={hover === p.i ? 5.5 : 3.5}
                  fill={
                    p.row.trueNetProfit >= 0 ? '#EEF2FF' : '#FEF2F2'
                  }
                  stroke={
                    p.row.trueNetProfit >= 0 ? '#4F46E5' : '#DC2626'
                  }
                  strokeWidth={2}
                  className="pointer-events-none transition-[r] duration-150"
                />
              ))
            : null}
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute z-10 min-w-[180px] rounded-xl border border-white/70 bg-white/95 p-3 text-right shadow-[0_12px_40px_rgba(15,23,42,0.16)] backdrop-blur-sm"
            style={{
              top: 12,
              left: `${Math.min(
                72,
                Math.max(
                  8,
                  ((active.cx - chart.padL) / chart.innerW) * 100 - 14,
                ),
              )}%`,
            }}
          >
            <div className="mb-2 text-[12px] font-extrabold text-[var(--text-dark)]">
              {active.row.label}
            </div>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-4">
                <dd className="tabular-nums font-bold text-[#059669]">
                  {formatNis(active.row.incomeGross)}
                </dd>
                <dt className="text-[var(--text-mid)]">הכנסות</dt>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dd className="tabular-nums font-bold text-[#DC2626]">
                  {formatNis(active.row.expenseGross)}
                </dd>
                <dt className="text-[var(--text-mid)]">הוצאות</dt>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dd className="tabular-nums font-bold text-[#4F46E5]">
                  {formatNis(active.row.vatPayable)}
                </dd>
                <dt className="text-[var(--text-mid)]">מע״מ לתשלום</dt>
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-1.5">
                <dd
                  className={`tabular-nums font-extrabold ${
                    active.row.trueNetProfit >= 0
                      ? 'text-[#059669]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  {formatNis(active.row.trueNetProfit)}
                </dd>
                <dt className="text-[var(--text-mid)]">רווח נקי</dt>
              </div>
            </dl>
            {onMonthClick ? (
              <p className="mt-2 text-[10px] font-semibold text-[var(--text-light)]">
                לחצו לפירוט הכנסות בחודש
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
