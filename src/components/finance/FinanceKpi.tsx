import type { ReactNode } from 'react'
import { hubSectionClass } from '../../lib/hubSectionBorder'

export function FinanceKpiCard(props: {
  index: number
  seq: number
  label: string
  value: string
  valueClass?: string
  hint: string
  onClick?: () => void
}) {
  const interactive = props.onClick
    ? 'cursor-pointer text-right transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)]'
    : ''
  const Tag = props.onClick ? 'button' : 'div'
  return (
    <Tag
      {...(props.onClick ? { type: 'button' as const, onClick: props.onClick } : {})}
      className={`flex min-h-[132px] w-full flex-col rounded-2xl ${hubSectionClass(props.seq)} p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${interactive}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/5 text-[10px] font-extrabold text-[var(--text-mid)]">
          {props.index}
        </span>
        <div className="flex items-center gap-1.5 text-[12px] font-bold leading-snug text-[var(--text-dark)]">
          {props.label}
          {props.onClick ? (
            <span className="text-[10px] font-normal text-[var(--text-light)]">
              ⓘ
            </span>
          ) : null}
        </div>
      </div>
      <div
        className={`mt-3 text-[26px] font-extrabold tabular-nums leading-none ${props.valueClass ?? 'text-[var(--text-dark)]'}`}
      >
        {props.value}
      </div>
      <div className="mt-auto pt-3 text-[11px] leading-snug text-[var(--text-mid)]">
        {props.hint}
      </div>
    </Tag>
  )
}

/** קובייה ראשית גדולה — מספר מפתח בראש הדף */
export function FinanceHeroCard(props: {
  label: string
  value: string
  hint: string
  tone?: 'income' | 'expense' | 'profit' | 'neutral'
  emphasis?: boolean
  onClick?: () => void
  footer?: ReactNode
}) {
  const tone = props.tone ?? 'neutral'
  const valueClass = {
    income: 'text-[#059669]',
    expense: 'text-[#DC2626]',
    profit: 'text-[#059669]',
    neutral: 'text-[var(--text-dark)]',
  }[tone]
  const ring = props.emphasis
    ? 'border border-[#A7F3D0] bg-[#F0FDF4] shadow-[0_1px_8px_rgba(16,185,129,0.1)]'
    : 'border border-[var(--border)] bg-[var(--dash-panel-bg)] shadow-[0_1px_8px_rgba(0,0,0,0.04)]'
  const interactive = props.onClick
    ? 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)]'
    : ''
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={!props.onClick}
      className={`flex h-full min-h-[148px] flex-col rounded-2xl p-4 text-right sm:p-5 ${ring} ${interactive}`}
    >
      <span className="flex items-center justify-end gap-1.5 text-[12px] font-bold text-[var(--text-mid)]">
        {props.label}
        {props.onClick ? (
          <span className="text-[10px] font-normal text-[var(--text-light)]">
            ⓘ
          </span>
        ) : null}
      </span>
      <span
        className={`mt-3 text-[30px] font-extrabold tabular-nums leading-none sm:text-[32px] ${valueClass}`}
      >
        {props.value}
      </span>
      <span className="mt-2 text-[11px] leading-snug text-[var(--text-mid)]">
        {props.hint}
      </span>
      {props.footer ? (
        <span className="mt-auto block pt-3">{props.footer}</span>
      ) : null}
    </button>
  )
}

/** פריט פירוט קומפקטי בתוך שורת מע״מ/רווח גולמי */
export function FinanceMiniStat(props: {
  label: string
  value: string
  valueClass?: string
  onClick?: () => void
}) {
  const interactive = props.onClick
    ? 'cursor-pointer rounded-xl transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange)]'
    : ''
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={!props.onClick}
      className={`flex min-h-[64px] w-full flex-col justify-center px-3 py-2.5 text-right sm:px-4 ${interactive}`}
    >
      <span className="text-[10.5px] font-semibold leading-snug text-[var(--text-mid)]">
        {props.label}
      </span>
      <span
        className={`mt-1.5 text-[17px] font-extrabold tabular-nums leading-none sm:text-[18px] ${props.valueClass ?? 'text-[var(--text-dark)]'}`}
      >
        {props.value}
      </span>
    </button>
  )
}

export function FinanceKpiRowLabel({
  row,
  title,
  period,
}: {
  row: number
  title: string
  period?: string
}) {
  return (
    <div className="mb-3 border-b border-[var(--border)] pb-2">
      <div className="text-[13px] font-extrabold text-[var(--text-dark)]">
        שורה {row} — {title}
      </div>
      {period ? (
        <div className="mt-0.5 text-[10px] text-[var(--text-mid)]">{period}</div>
      ) : null}
    </div>
  )
}

export function FinanceFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
      {children}
    </span>
  )
}

export function financeHubInputClass() {
  return 'w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-dark)]'
}

export const financeUiBtnSmOutline =
  'inline-flex h-9 min-w-[72px] items-center justify-center rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 text-xs font-semibold text-[var(--orange)] transition hover:bg-[var(--orange-light)]'

export const financeUiBtnDanger =
  'inline-flex h-9 min-w-[72px] items-center justify-center rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 text-xs font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]'
