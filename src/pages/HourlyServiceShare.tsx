import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { formatDateIL } from '../lib/dates'
import { db } from '../lib/firebase'
import {
  formatHours,
  formatHoursWithMinutes,
  hoursToMinutes,
} from '../lib/hourlyServiceCalc'
import type { HourlyServicePublicShare } from '../lib/hourlyServiceShare'

function usagePercent(used: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((used / total) * 100))
}

function progressColor(remaining: number, total: number): string {
  if (remaining < 0) return '#EF4444'
  const pct = usagePercent(total - remaining, total)
  if (pct >= 90) return '#F59E0B'
  return '#10B981'
}

export function HourlyServiceShare() {
  const { token } = useParams<{ token: string }>()
  const [share, setShare] = useState<HourlyServicePublicShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!token) {
      setError('קישור לא תקין')
      setLoading(false)
      return
    }
    let cancelled = false
    void getDoc(doc(db, 'hourlyServicesPublic', token)).then((snap) => {
      if (cancelled) return
      if (!snap.exists()) {
        setError('הדוח לא נמצא או שהקישור בוטל')
        setLoading(false)
        return
      }
      setShare(snap.data() as HourlyServicePublicShare)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const usedPct = useMemo(() => {
    if (!share) return 0
    return usagePercent(share.usedHours, share.hoursPackageTotal)
  }, [share])

  const toggleExpanded = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]" dir="rtl">
        <p className="text-[14px] text-slate-500">טוען דוח…</p>
      </div>
    )
  }

  if (error || !share) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-6 text-center"
        dir="rtl"
      >
        <p className="text-[16px] font-semibold text-slate-800">
          {error ?? 'דוח לא זמין'}
        </p>
        <p className="max-w-sm text-[13px] text-slate-500">
          ייתכן שהקישור פג תוקף או בוטל. פנה למנהל החשבון לקבלת קישור מעודכן.
        </p>
      </div>
    )
  }

  const barColor = progressColor(share.remainingHours, share.hoursPackageTotal)

  const hourCells = [
    {
      label: 'חבילה',
      hours: share.hoursPackageTotal,
    },
    {
      label: 'נוצלו',
      hours: share.usedHours,
    },
    {
      label: 'נותר',
      hours: share.remainingHours,
      accent:
        share.remainingHours < 0
          ? 'text-red-600'
          : share.remainingHours <= share.hoursPackageTotal * 0.1
            ? 'text-amber-600'
            : 'text-emerald-700',
    },
  ]

  return (
    <div className="min-h-screen bg-[#F1F5F9] print:bg-white" dir="rtl">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:px-8">
        <section className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
            דוח שעות עבודה
          </p>
          <h1 className="mt-2 text-[26px] font-extrabold leading-tight text-slate-900 sm:text-[30px]">
            {share.clientName}
          </h1>
          <p className="mt-2 text-[15px] font-medium text-slate-600">
            {share.title}
          </p>
          {share.dateRangeLabel ? (
            <p className="mt-1 text-[13px] text-slate-500">
              תקופת ביצוע: {share.dateRangeLabel}
            </p>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.06)] print:shadow-none">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
            <h2 className="text-[14px] font-bold text-slate-800">בנק שעות</h2>
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                <span>{usedPct}% נוצל</span>
                <span className="tabular-nums">
                  {formatHoursWithMinutes(share.usedHours)} /{' '}
                  {formatHoursWithMinutes(share.hoursPackageTotal)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${usedPct}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
            {hourCells.map((cell) => (
              <div
                key={cell.label}
                className="bg-white px-4 py-4 text-right sm:px-5"
              >
                <p className="text-[11px] text-slate-500">{cell.label}</p>
                <p
                  className={`mt-1 text-[20px] font-extrabold tabular-nums text-slate-900 sm:text-[22px] ${cell.accent ?? ''}`}
                >
                  {formatHours(cell.hours)}
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                  {hoursToMinutes(cell.hours)} דק׳
                </p>
              </div>
            ))}
            <div className="bg-white px-4 py-4 text-right sm:px-5">
              <p className="text-[11px] text-slate-500">רשומות</p>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums text-slate-900">
                {share.entries.length}
              </p>
            </div>
          </div>
          {share.estimatedAmount != null ? (
            <div className="border-t border-slate-100 px-5 py-3 text-right text-[13px] text-slate-600 sm:px-6">
              סכום משוער לפי תעריף:{' '}
              <strong className="tabular-nums text-slate-900">
                ₪{share.estimatedAmount.toLocaleString('he-IL')}
              </strong>
            </div>
          ) : null}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-[16px] font-bold text-slate-900">פירוט עבודות</h2>
            <span className="text-[12px] text-slate-500">
              {share.entries.length} רשומות
            </span>
          </div>

          {share.entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-[13px] text-slate-500">
              אין רשומות בדוח.
            </p>
          ) : (
            <ul className="space-y-2 print:space-y-1">
              {share.entries.map((row, idx) => {
                const hasDetail = Boolean(row.description?.trim())
                const isOpen = expanded.has(idx)
                return (
                  <li key={`${row.workDate}-${idx}`}>
                    <button
                      type="button"
                      disabled={!hasDetail}
                      onClick={() => hasDetail && toggleExpanded(idx)}
                      className={`w-full rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 text-right shadow-sm transition print:border-slate-200 print:shadow-none ${
                        hasDetail
                          ? 'cursor-pointer hover:border-orange-200 hover:shadow-md'
                          : 'cursor-default'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">
                            {row.taskTitle}
                          </p>
                          <p className="mt-1 text-[12px] text-slate-500">
                            {formatDateIL(row.workDate)}
                            {' · '}
                            {row.performerName}
                          </p>
                        </div>
                        <div className="shrink-0 text-left">
                          <span className="inline-flex flex-col items-end rounded-full bg-orange-50 px-2.5 py-1 text-[13px] font-bold tabular-nums text-orange-700">
                            <span>{formatHours(row.hours)} שע׳</span>
                            <span className="text-[10px] font-semibold text-orange-600/90">
                              {hoursToMinutes(row.hours)} דק׳
                            </span>
                          </span>
                          {hasDetail ? (
                            <span className="mt-1 block text-[10px] text-slate-400 print:hidden">
                              {isOpen ? 'הסתר פירוט ▲' : 'הצג פירוט ▼'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {hasDetail && isOpen ? (
                        <p className="mt-3 border-t border-slate-100 pt-3 text-[13px] leading-relaxed text-slate-600 print:mt-2 print:border-0 print:pt-0">
                          {row.description}
                        </p>
                      ) : hasDetail ? (
                        <p className="mt-2 hidden text-[12px] leading-relaxed text-slate-600 print:block">
                          {row.description}
                        </p>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <footer className="border-t border-slate-200 pt-6 print:pt-4">
          <div className="flex flex-col items-start gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-[10px] border border-orange-200 bg-white px-4 py-2 text-[13px] font-semibold text-orange-700 shadow-sm transition hover:bg-orange-50 print:hidden"
            >
              הדפסה / PDF
            </button>
            <p className="text-[11px] text-slate-400 print:hidden">
              לחץ על שורה עם פירוט כדי לפתוח / לסגור את התיאור המלא
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
