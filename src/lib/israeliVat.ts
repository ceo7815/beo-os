import type { FinanceExpenseVatClass } from '../types'
import { resolveExpenseVatClass } from './financeExpenseVat'

/** שיעור מע״מ בישראל — 18% מ-2025 */
export const ISRAEL_VAT_RATE = 0.18

export const ISRAEL_VAT_PERCENT_LABEL = `${Math.round(ISRAEL_VAT_RATE * 100)}%`

export type VatBreakdown = {
  gross: number
  net: number
  vat: number
  rate: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** סכום כולל מע״מ → פירוט */
export function calcVatFromGross(
  gross: number,
  rate = ISRAEL_VAT_RATE,
): VatBreakdown {
  const vat = round2((gross * rate) / (1 + rate))
  const net = round2(gross - vat)
  return { gross: round2(gross), net, vat, rate }
}

/** סכום לפני מע״מ → פירוט */
export function calcVatFromNet(
  net: number,
  rate = ISRAEL_VAT_RATE,
): VatBreakdown {
  const vat = round2(net * rate)
  const gross = round2(net + vat)
  return { gross, net, vat, rate }
}

export function resolveExpenseVat(
  amount: number,
  amountIncludesVat: boolean,
  stored?: { vatAmount?: number; amountBeforeVat?: number },
): VatBreakdown {
  if (
    typeof stored?.vatAmount === 'number' &&
    typeof stored?.amountBeforeVat === 'number'
  ) {
    /**
     * הפירוק השמור נרשם תמיד כסכום חיובי. בזיכוי הסכום שלילי, ולכן
     * הסימן נגזר מהסכום עצמו — אחרת מע״מ התשומות היה מתווסף במקום להתקזז.
     */
    const sign = amount < 0 ? -1 : 1
    return {
      gross: round2(amount),
      net: round2(sign * Math.abs(stored.amountBeforeVat)),
      vat: round2(sign * Math.abs(stored.vatAmount)),
      rate: ISRAEL_VAT_RATE,
    }
  }
  return amountIncludesVat ? calcVatFromGross(amount) : calcVatFromNet(amount)
}

export function expenseIsVatLiable(exp: {
  vatClass?: FinanceExpenseVatClass
  vatLiable?: boolean
  type?: string
}): boolean {
  return resolveExpenseVatClass(exp) === 'vat_liable'
}

export function resolveIncomeVat(inc: {
  amount: number
  amountIncludesVat?: boolean
  vatAmount?: number
  amountBeforeVat?: number
}): VatBreakdown {
  return resolveExpenseVat(inc.amount, inc.amountIncludesVat !== false, {
    vatAmount: inc.vatAmount,
    amountBeforeVat: inc.amountBeforeVat,
  })
}

export function resolveExpenseRowVat(exp: {
  amount: number
  amountIncludesVat?: boolean
  vatAmount?: number
  amountBeforeVat?: number
  vatClass?: FinanceExpenseVatClass
  vatLiable?: boolean
  type?: string
}): VatBreakdown {
  if (resolveExpenseVatClass(exp) !== 'vat_liable') {
    return {
      gross: round2(exp.amount),
      net: round2(exp.amount),
      vat: 0,
      rate: ISRAEL_VAT_RATE,
    }
  }
  return resolveExpenseVat(exp.amount, exp.amountIncludesVat !== false, {
    vatAmount: exp.vatAmount,
    amountBeforeVat: exp.amountBeforeVat,
  })
}

export function formatNisPlain(amount: number): string {
  return `₪${round2(amount).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** חלק יחסי מפירוט מע״מ (לתשלום חלקי / יתרה) */
export function prorateVatBreakdown(
  full: VatBreakdown,
  portionGross: number,
  totalGross: number,
): VatBreakdown {
  if (
    !Number.isFinite(portionGross) ||
    portionGross <= 0 ||
    !Number.isFinite(totalGross) ||
    totalGross <= 0
  ) {
    return { gross: 0, net: 0, vat: 0, rate: full.rate }
  }
  const ratio = Math.min(1, portionGross / totalGross)
  return {
    gross: round2(full.gross * ratio),
    net: round2(full.net * ratio),
    vat: round2(full.vat * ratio),
    rate: full.rate,
  }
}
