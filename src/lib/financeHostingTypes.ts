import type { FinanceHostingType, FinanceIncome } from '../types'

export const HOSTING_TYPE_LABEL: Record<FinanceHostingType, string> = {
  monthly: 'אחסון אתר חודשי',
  yearly: 'אחסון אתר שנתי',
  portal_monthly: 'פורטל BizBakrayot (חודשי)',
}

const HOSTING_TYPES: FinanceHostingType[] = [
  'monthly',
  'yearly',
  'portal_monthly',
]

export function isFinanceHostingType(raw: unknown): raw is FinanceHostingType {
  return typeof raw === 'string' && HOSTING_TYPES.includes(raw as FinanceHostingType)
}

export function resolveHostingType(
  inc: Pick<FinanceIncome, 'hostingType' | 'hostingClient' | 'monthlyRetainer'>,
): FinanceHostingType | undefined {
  if (isFinanceHostingType(inc.hostingType)) {
    return inc.hostingType
  }
  if (!inc.hostingClient) return undefined
  return inc.monthlyRetainer ? 'monthly' : 'yearly'
}

export function isHostingIncome(
  inc: Pick<FinanceIncome, 'hostingType' | 'hostingClient'>,
): boolean {
  return isFinanceHostingType(inc.hostingType) || inc.hostingClient === true
}

export function hostingIncomeLabel(
  inc: Pick<FinanceIncome, 'hostingType' | 'hostingClient' | 'monthlyRetainer'>,
): string | undefined {
  const type = resolveHostingType(inc)
  return type ? HOSTING_TYPE_LABEL[type] : undefined
}

export function hostingIsMonthlyRecurring(
  inc: Pick<FinanceIncome, 'hostingType' | 'hostingClient' | 'monthlyRetainer'>,
): boolean {
  const type = resolveHostingType(inc)
  return type === 'monthly' || type === 'portal_monthly'
}

export function hostingTypeUsesMonthPicker(type: FinanceHostingType | ''): boolean {
  return type === 'monthly' || type === 'portal_monthly'
}
