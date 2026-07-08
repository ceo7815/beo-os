import { doc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore'
import { formatDateIL } from './dates'
import {
  amountFromHours,
  formatHours,
  hoursRemaining,
  sumHours,
} from './hourlyServiceCalc'
import { db } from './firebase'
import { stripUndefinedDeep } from './stripUndefined'
import type { HourlyService, HourlyServiceEntry } from '../types'

export type HourlyServiceShareEntry = {
  workDate: string
  hours: number
  taskTitle: string
  description?: string
  performerName: string
}

export type HourlyServicePublicShare = {
  serviceId: string
  clientName: string
  title: string
  hoursPackageTotal: number
  usedHours: number
  remainingHours: number
  billableHours: number
  hourlyRate?: number
  estimatedAmount?: number
  dateRangeLabel?: string
  entries: HourlyServiceShareEntry[]
  publishedAt: string
}

export function generateShareToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
}

function entryDateRangeLabel(entries: HourlyServiceEntry[]): string | undefined {
  if (entries.length === 0) return undefined
  const dates = entries.map((e) => e.workDate).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first === last) return formatDateIL(first)
  return `${formatDateIL(first)} – ${formatDateIL(last)}`
}

export function buildHourlyServiceSharePayload(
  service: HourlyService,
  entries: HourlyServiceEntry[],
  clientName: string,
): HourlyServicePublicShare {
  const sorted = [...entries].sort((a, b) => a.workDate.localeCompare(b.workDate))
  const usedHours = sumHours(sorted)
  const billableHours = sorted
    .filter((e) => e.billable)
    .reduce((acc, e) => acc + e.hours, 0)
  const estimatedAmount = amountFromHours(billableHours, service.hourlyRate)

  return {
    serviceId: service.id,
    clientName: clientName.trim() || 'לקוח',
    title: service.title,
    hoursPackageTotal: service.hoursPackageTotal,
    usedHours,
    remainingHours: hoursRemaining(service.hoursPackageTotal, usedHours),
    billableHours,
    hourlyRate: service.hourlyRate,
    estimatedAmount: estimatedAmount ?? undefined,
    dateRangeLabel: entryDateRangeLabel(sorted),
    entries: sorted.map((e) => ({
      workDate: e.workDate,
      hours: e.hours,
      taskTitle: e.taskTitle,
      ...(e.description?.trim() ? { description: e.description.trim() } : {}),
      performerName: e.performerName,
    })),
    publishedAt: new Date().toISOString(),
  }
}

export async function publishHourlyServiceShare(
  shareToken: string,
  payload: HourlyServicePublicShare,
): Promise<void> {
  const docData = stripUndefinedDeep({
    ...payload,
    updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, 'hourlyServicesPublic', shareToken), docData)
}

export async function unpublishHourlyServiceShare(
  shareToken: string,
): Promise<void> {
  await deleteDoc(doc(db, 'hourlyServicesPublic', shareToken))
}

export function hourlyServiceShareUrl(shareToken: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const path = `${base}/share/hours/${shareToken}`.replace(/\/+/g, '/')
  return `${window.location.origin}${path}`
}

export function shareHoursSummaryLine(share: HourlyServicePublicShare): string {
  return `חבילה ${formatHours(share.hoursPackageTotal)} שעות · נוצלו ${formatHours(share.usedHours)} · נותר ${formatHours(share.remainingHours)}`
}
