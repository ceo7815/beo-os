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
    return {
      gross: round2(amount),
      net: round2(stored.amountBeforeVat),
      vat: round2(stored.vatAmount),
      rate: ISRAEL_VAT_RATE,
    }
  }
  return amountIncludesVat ? calcVatFromGross(amount) : calcVatFromNet(amount)
}

export function expenseIsVatLiable(exp: {
  vatLiable?: boolean
  type?: string
}): boolean {
  if (exp.vatLiable === false) return false
  if (exp.vatLiable === true) return true
  return exp.type !== 'salary'
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
  vatLiable?: boolean
  type?: string
}): VatBreakdown {
  if (!expenseIsVatLiable(exp)) {
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
  return `₪${round2(amount).toLocaleString('he-IL')}`
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
