import { useMemo, useState } from 'react'
import type { Client } from '../../types'
import {
  calcDocTotals,
  DEFAULT_PAYMENT_TYPES,
  formatNisSimple,
  previewRivhitDocument,
  todayIsoDate,
  VAT_RATE,
  type DocLineInput,
  type PaymentInput,
  type RivhitPaymentType,
} from '../../lib/rivhitFinanceApi'

export type LineRow = DocLineInput & { key: string }
export type PaymentRow = PaymentInput & { key: string }

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyLine(): LineRow {
  return {
    key: newKey(),
    description: '',
    quantity: 1,
    priceNis: 0,
    catalogNumber: '',
    exemptVat: false,
  }
}

export function emptyPayment(amount = 0): PaymentRow {
  return {
    key: newKey(),
    paymentType: 4,
    amountNis: amount,
    dueDate: todayIsoDate(),
    description: '',
    numberOfPayments: 1,
  }
}

type Mode = 'work_order' | 'tax_receipt'

type Props = {
  mode: Mode
  clients: Client[]
  paymentTypes?: RivhitPaymentType[]
  workOrderOptions?: Array<{
    id: string
    label: string
    openBalance: number
    clientId: string
  }>
  busy?: boolean
  disabled?: boolean
  onError?: (message: string) => void
  onSubmit: (payload: {
    clientId: string
    workOrderId?: string
    title: string
    notes: string
    lines: DocLineInput[]
    payments?: PaymentInput[]
    dueDate: string
    issueDate: string
    orderRef: string
    reference: string
    discountValue: number
    priceIncludeVat: boolean
    language: string
    sendMail: boolean
    firstName?: string
    address?: string
    city?: string
    zipcode?: string
    phone?: string
  }) => Promise<void>
}

const field =
  'w-full rounded-md border border-[#c5d0dc] bg-white px-2.5 py-1.5 text-[13px] text-[var(--text-dark)] outline-none focus:border-[#3b82c4]'
const labelCls = 'mb-0.5 block text-[12px] font-semibold text-[#334155]'
const req = (
  <span className="ms-0.5 text-red-600" title="שדה חובה בריווחית">
    *
  </span>
)

/**
 * טופס הפקת מסמך — שדות תואמים למסך ריווחית.
 * חובה רק מה שחובה בריווחית: לקוח + לפחות פריט (תיאור, כמות, מחיר).
 * בחשבונית מס קבלה גם תשלומים בסכום תואם.
 */
export function RivhitDocumentComposer({
  mode,
  clients,
  paymentTypes = DEFAULT_PAYMENT_TYPES,
  workOrderOptions = [],
  busy,
  disabled,
  onError,
  onSubmit,
}: Props) {
  const [clientId, setClientId] = useState('')
  const [workOrderId, setWorkOrderId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [zip, setZip] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [taxId, setTaxId] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [priceIncludeVat, setPriceIncludeVat] = useState(false)
  const [language, setLanguage] = useState('he')
  const [issueDate, setIssueDate] = useState(todayIsoDate())
  const [dueDate, setDueDate] = useState(todayIsoDate())
  const [notes, setNotes] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [reference, setReference] = useState('')
  const [orderRef, setOrderRef] = useState('')
  const [discountValue, setDiscountValue] = useState(0)
  const [sendMail, setSendMail] = useState(false)
  const [lines, setLines] = useState<LineRow[]>([emptyLine()])
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPayment()])
  const [previewBusy, setPreviewBusy] = useState(false)

  const selectedWo = useMemo(
    () => workOrderOptions.find((o) => o.id === workOrderId) ?? null,
    [workOrderOptions, workOrderId],
  )

  const totals = useMemo(
    () => calcDocTotals(lines, { priceIncludeVat, discountValue }),
    [lines, priceIncludeVat, discountValue],
  )

  function pickClient(id: string) {
    setClientId(id)
    const c = clients.find((x) => x.id === id)
    if (!c) return
    setBusinessName(c.name || c.legalName || '')
    setFirstName(c.contact || '')
    setAddress(c.addressLine || '')
    setCity(c.city || '')
    setPhone(c.phone || '')
    setEmail(c.email || '')
    setTaxId(c.taxId || '')
  }

  function pickWorkOrder(id: string) {
    setWorkOrderId(id)
    const wo = workOrderOptions.find((o) => o.id === id)
    if (!wo) return
    pickClient(wo.clientId)
    setOrderRef(wo.label.split('·')[0]?.replace('#', '').trim() || '')
    setLines([
      {
        ...emptyLine(),
        description: 'תשלום על הזמנת עבודה',
        quantity: 1,
        priceNis: wo.openBalance,
      },
    ])
    setPayments([emptyPayment(wo.openBalance)])
  }

  function updateLine(key: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function updatePayment(key: string, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  function buildCleanPayload() {
    const cleanLines = lines
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 0,
        priceNis: Number(l.priceNis) || 0,
        catalogNumber: l.catalogNumber?.trim() || undefined,
        exemptVat: l.exemptVat,
      }))
      .filter((l) => l.description && l.quantity > 0 && l.priceNis > 0)

    if (mode === 'tax_receipt' && !workOrderId) {
      throw new Error('חובה: בחרו הזמנת עבודה לגבייה')
    }
    if (mode === 'work_order' && !clientId) {
      throw new Error('חובה: בחרו לקוח (מ.כרטיס / שם משפחה/עסק)')
    }
    if (cleanLines.length === 0) {
      throw new Error('חובה: לפחות פריט אחד עם תיאור, כמות ומחיר')
    }

    const cleanPayments =
      mode === 'tax_receipt'
        ? payments.map((p) => ({
            paymentType: p.paymentType,
            amountNis: Number(p.amountNis) || 0,
            dueDate: p.dueDate,
            description: p.description?.trim() || undefined,
            numberOfPayments: p.numberOfPayments,
            bankCode: p.bankCode,
            branchNumber: p.branchNumber,
            bankAccountNumber: p.bankAccountNumber,
            checkNumber: p.checkNumber,
          }))
        : undefined

    if (mode === 'tax_receipt' && cleanPayments) {
      const paySum = cleanPayments.reduce((s, p) => s + p.amountNis, 0)
      if (Math.abs(paySum - totals.total) > 0.05) {
        throw new Error(
          `חובה בריווחית: סכום התשלומים (${formatNisSimple(paySum)}) = סה״כ המסמך (${formatNisSimple(totals.total)})`,
        )
      }
    }

    const resolvedClientId =
      mode === 'tax_receipt' ? selectedWo?.clientId || clientId : clientId

    return {
      clientId: resolvedClientId,
      workOrderId: mode === 'tax_receipt' ? workOrderId : undefined,
      title:
        mode === 'work_order'
          ? docTitle.trim() || cleanLines[0]?.description || 'הזמנת עבודה'
          : docTitle.trim() || `חשבונית מס קבלה — ${formatNisSimple(totals.total)}`,
      notes: notes.trim(),
      lines: cleanLines,
      payments: cleanPayments,
      dueDate,
      issueDate,
      orderRef,
      reference,
      discountValue,
      priceIncludeVat,
      language,
      sendMail,
      firstName: firstName.trim() || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      zipcode: zip.trim() || undefined,
      phone: phone.trim() || undefined,
      lastName: businessName.trim() || undefined,
    }
  }

  async function handlePreview() {
    setPreviewBusy(true)
    try {
      const payload = buildCleanPayload()
      const res = await previewRivhitDocument({
        kind: mode,
        clientId: payload.clientId,
        lines: payload.lines,
        payments: payload.payments,
        notes: payload.notes,
        dueDate: payload.dueDate,
        orderRef: payload.orderRef,
        discountValue: payload.discountValue,
        priceIncludeVat: payload.priceIncludeVat,
        firstName: payload.firstName,
        address: payload.address,
        city: payload.city,
        zipcode: payload.zipcode,
        phone: payload.phone,
        lastName: payload.lastName,
      })
      if (!res.pageUrl) throw new Error('ריווחית לא החזירה קישור למסמך')
      window.open(res.pageUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'שגיאה בתצוגה מקדימה מריווחית')
    } finally {
      setPreviewBusy(false)
    }
  }

  async function handleSubmit() {
    try {
      const payload = buildCleanPayload()
      await onSubmit(payload)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'שגיאה בהפקת מסמך')
    }
  }

  const headerTitle =
    mode === 'work_order' ? 'הפקת הזמנה' : 'הפקת חשבונית מס קבלה'
  const incomeTypeLabel = mode === 'work_order' ? 'הזמנה' : 'הכנסות/מכירות'

  return (
    <div className="overflow-hidden rounded-xl border border-[#b8c7d9] bg-white shadow-sm">
      {/* כותרת כמו בריווחית */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#9eb6d4] bg-[#cfe0f5] px-4 py-2.5">
        <h2 className="text-[15px] font-bold text-[#1e3a5f]">{headerTitle}</h2>
        <label className="flex items-center gap-2 text-[13px] text-[#1e3a5f]">
          <span>תאריך ההפקה:</span>
          <input
            type="date"
            className="rounded border border-[#9eb6d4] bg-white px-2 py-1 text-[13px]"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </label>
      </div>

      <div className="border-b border-[#dbe4ef] px-4 py-3">
        <label className={labelCls}>
          כותרת {mode === 'work_order' ? 'הזמנה' : 'מסמך'}
        </label>
        <input
          className={field}
          placeholder={
            mode === 'work_order'
              ? 'לדוגמה: אתר תדמית · חבילת שיווק · תשלום ראשון…'
              : 'כותרת לתצוגה ביומן (אופציונלי)'
          }
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          maxLength={200}
        />
        <p className="mt-1 text-[11px] text-[#64748b]">
          מוצגת ביומן המסמכים ב־Beo. לא מועתקת להערות או לתיאור פריט.
          {!docTitle.trim() ? ' אם ריק — ייעשה שימוש בתיאור הפריט הראשון.' : null}
        </p>
      </div>

      <div className="grid gap-6 border-b border-[#dbe4ef] p-4 lg:grid-cols-[1.35fr_1fr]">
        {/* עמודת לקוח — כמו בריווחית */}
        <div className="space-y-2.5">
          {mode === 'tax_receipt' ? (
            <div>
              <label className={labelCls}>הזמנת עבודה לגבייה {req}</label>
              <select
                className={field}
                value={workOrderId}
                onChange={(e) => pickWorkOrder(e.target.value)}
              >
                <option value="">בחרו הזמנה פתוחה…</option>
                {workOrderOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={labelCls}>מ.כרטיס / שם משפחה/עסק {req}</label>
            <div className="flex gap-2">
              <input
                className={`${field} flex-1`}
                placeholder="שם משפחה/עסק"
                value={businessName}
                readOnly
                onClick={() => document.getElementById('rivhit-client-select')?.focus()}
              />
              <select
                id="rivhit-client-select"
                className={`${field} max-w-[160px]`}
                value={clientId}
                disabled={mode === 'tax_receipt'}
                onChange={(e) => pickClient(e.target.value)}
              >
                <option value="">בחר לקוח</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.rivhitCustomerId ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>שם פרטי</label>
            <input
              className={field}
              placeholder="שם פרטי"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>כתובת</label>
            <input
              className={field}
              placeholder="כתובת"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>עיר</label>
              <input
                className={field}
                placeholder="עיר"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>מיקוד</label>
              <input
                className={field}
                placeholder="מיקוד"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className="text-[13px] font-semibold text-[#2563eb] hover:underline"
            onClick={() => setMoreOpen((v) => !v)}
          >
            {moreOpen ? 'הסתר פרטים נוספים' : 'פרטים נוספים...'}
          </button>

          {moreOpen ? (
            <div className="grid gap-2 rounded-lg border border-dashed border-[#c5d0dc] bg-[#f8fafc] p-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>טלפון</label>
                <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>אימייל</label>
                <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>ח.פ / עוסק</label>
                <input className={field} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </div>
              <label className="flex items-end gap-2 pb-1 text-[12px] font-semibold text-[#475569]">
                <input
                  type="checkbox"
                  checked={sendMail}
                  onChange={(e) => setSendMail(e.target.checked)}
                />
                שליחה במייל אחרי הפקה
              </label>
            </div>
          ) : null}
        </div>

        {/* הגדרות מסמך — כמו בריווחית */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-[12px] font-semibold text-[#334155]">מטבע</label>
            <select className={field} disabled value="ILS">
              <option value="ILS">ש״ח</option>
            </select>
          </div>
          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-[12px] font-semibold text-[#334155]">מחיר פריט</label>
            <select
              className={field}
              value={priceIncludeVat ? 'incl' : 'excl'}
              onChange={(e) => setPriceIncludeVat(e.target.value === 'incl')}
            >
              <option value="excl">ללא מע״מ</option>
              <option value="incl">כולל מע״מ</option>
            </select>
          </div>
          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-[12px] font-semibold text-[#334155]">סוג הכנסה</label>
            <select className={field} disabled value={incomeTypeLabel}>
              <option value={incomeTypeLabel}>{incomeTypeLabel}</option>
            </select>
          </div>
          <div className="grid grid-cols-[100px_1fr] items-center gap-2">
            <label className="text-[12px] font-semibold text-[#334155]">שפת המסמך</label>
            <select className={field} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-[#64748b]">
            חובה בריווחית:{' '}
            {mode === 'work_order'
              ? 'לקוח + לפחות פריט אחד (תיאור, כמות, מחיר).'
              : 'הזמנת עבודה + פריטים + תשלומים בסכום זהה לסה״כ.'}{' '}
            שאר השדות אופציונליים.
          </p>
        </div>
      </div>

      {/* פריטים */}
      <div className="border-b border-[#dbe4ef]">
        <div className="flex items-center justify-between bg-[#4a5568] px-4 py-2 text-white">
          <h3 className="text-[13px] font-bold">פריטים</h3>
          <button
            type="button"
            className="rounded bg-[#16a34a] px-3 py-1 text-[12px] font-bold hover:bg-[#15803d]"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            בחירת פריטים
          </button>
        </div>
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[780px] text-right text-[12px]">
            <thead>
              <tr className="text-[#475569]">
                <th className="px-1 py-2 font-bold">תיאור {req}</th>
                <th className="px-1 py-2 font-bold">מק״ט</th>
                <th className="w-24 px-1 py-2 font-bold">כמות {req}</th>
                <th className="w-28 px-1 py-2 font-bold">מחיר {req}</th>
                <th className="w-28 px-1 py-2 font-bold">סה״כ לשורה</th>
                <th className="w-10 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-[#e2e8f0]">
                  <td className="px-1 py-1.5">
                    <input
                      className={field}
                      placeholder="תיאור פריט/שירות"
                      value={l.description}
                      onChange={(e) => updateLine(l.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      className={field}
                      value={l.catalogNumber || ''}
                      onChange={(e) => updateLine(l.key, { catalogNumber: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      className={field}
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.quantity}
                      onChange={(e) => updateLine(l.key, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      className={field}
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.priceNis}
                      onChange={(e) => updateLine(l.key, { priceNis: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1 py-1.5 font-semibold">
                    {formatNisSimple(l.quantity * l.priceNis)}
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      className="rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length <= 1 ? prev : prev.filter((x) => x.key !== l.key),
                        )
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="mt-2 rounded bg-[#16a34a] px-2.5 py-1 text-[14px] font-bold text-white"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            +
          </button>
        </div>
      </div>

      {mode === 'tax_receipt' ? (
        <div className="border-b border-[#dbe4ef]">
          <div className="flex items-center justify-between bg-[#4a5568] px-4 py-2 text-white">
            <h3 className="text-[13px] font-bold">
              תשלומים {req}
            </h3>
            <button
              type="button"
              className="rounded bg-[#16a34a] px-3 py-1 text-[12px] font-bold"
              onClick={() => setPayments((prev) => [...prev, emptyPayment(0)])}
            >
              + תשלום
            </button>
          </div>
          <div className="space-y-2 p-3">
            {payments.map((p) => (
              <div
                key={p.key}
                className="grid gap-2 rounded-lg border border-[#dbe4ef] p-3 sm:grid-cols-5"
              >
                <div>
                  <label className={labelCls}>סוג {req}</label>
                  <select
                    className={field}
                    value={p.paymentType}
                    onChange={(e) =>
                      updatePayment(p.key, { paymentType: Number(e.target.value) })
                    }
                  >
                    {paymentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>סכום {req}</label>
                  <input
                    className={field}
                    type="number"
                    step="0.01"
                    value={p.amountNis}
                    onChange={(e) =>
                      updatePayment(p.key, { amountNis: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>תאריך</label>
                  <input
                    className={field}
                    type="date"
                    value={p.dueDate || ''}
                    onChange={(e) => updatePayment(p.key, { dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>מס׳ תשלומים</label>
                  <input
                    className={field}
                    type="number"
                    min="1"
                    value={p.numberOfPayments || 1}
                    onChange={(e) =>
                      updatePayment(p.key, { numberOfPayments: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="rounded bg-red-600 px-3 py-2 text-[12px] font-bold text-white"
                    onClick={() =>
                      setPayments((prev) =>
                        prev.length <= 1 ? prev : prev.filter((x) => x.key !== p.key),
                      )
                    }
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-[12px] font-bold text-[#2563eb] hover:underline"
              onClick={() => setPayments([emptyPayment(totals.total)])}
            >
              התאם תשלום לסה״כ ({formatNisSimple(totals.total)})
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2.5">
          <div>
            <label className={labelCls}>הערות</label>
            <textarea
              className={`${field} min-h-[88px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>אסמכתא</label>
              <input
                className={field}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>הזמנה</label>
              <input
                className={field}
                value={orderRef}
                onChange={(e) => setOrderRef(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>תאריך פירעון</label>
            <input
              className={field}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-[#dbe4ef] bg-[#f8fafc] p-4 text-[13px]">
          <div className="flex justify-between py-1">
            <span>סה״כ לפני מע״מ</span>
            <strong>{formatNisSimple(totals.before)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3 py-1">
            <span>% הנחה / הנחה ₪</span>
            <input
              className="w-28 rounded border border-[#c5d0dc] px-2 py-1 text-left"
              type="number"
              step="0.01"
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex justify-between py-1">
            <span>מע״מ ({Math.round(VAT_RATE * 100)}%)</span>
            <strong>{formatNisSimple(totals.vat)}</strong>
          </div>
          <div className="mt-2 flex justify-between border-t border-[#dbe4ef] pt-2 text-[15px]">
            <span className="font-extrabold">סה״כ כולל מע״מ</span>
            <strong className="text-[#1e3a5f]">{formatNisSimple(totals.total)}</strong>
          </div>
          {mode === 'tax_receipt' && selectedWo ? (
            <p className="mt-3 text-[12px] text-[#64748b]">
              יתרה פתוחה בהזמנה: {formatNisSimple(selectedWo.openBalance)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dbe4ef] bg-[#f1f5f9] px-4 py-3">
        <p className="text-[12px] text-[#64748b]">
          תצוגה מקדימה = דף המסמך האמיתי בריווחית. הפקה שומרת גם כאן עם קישור PDF.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || previewBusy || disabled}
            onClick={() => void handlePreview()}
            className="rounded-lg border border-[#9eb6d4] bg-white px-4 py-2.5 text-[13px] font-bold text-[#1e3a5f] disabled:opacity-50"
          >
            {previewBusy ? 'פותח ריווחית…' : 'תצוגה מקדימה (ריווחית)'}
          </button>
          <button
            type="button"
            disabled={busy || previewBusy || disabled}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-50"
          >
            {busy ? 'מפיק…' : mode === 'work_order' ? 'הפק הזמנה' : 'הפק חשבונית מס קבלה'}
          </button>
        </div>
      </div>
    </div>
  )
}
