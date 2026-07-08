import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { auth } from '../../lib/firebase'
import { ApiError } from '../../lib/apiClient'
import type { FinanceExpense } from '../../types'

const btnClass =
  'mt-1 inline-flex items-center gap-1 rounded-lg border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-2 py-1 text-[10px] font-bold text-[var(--orange)] transition hover:bg-[var(--orange-light)]'

/** מזהה GI רק מהרשומה המותאמת — לא מקישורים ישנים ב-Firestore */
export function resolveGiExpenseId(linkedGi?: FinanceExpense): string | undefined {
  return linkedGi?.greenInvoiceId
}

export function resolveGiExpenseLabel(linkedGi: FinanceExpense): {
  invoiceNumber?: string
  supplierName?: string
} {
  return {
    invoiceNumber: linkedGi.greenInvoiceNumber,
    supplierName:
      linkedGi.greenInvoiceSupplierName ??
      linkedGi.supplierName ??
      linkedGi.name,
  }
}

export function GiExpenseDocumentButton({
  greenInvoiceId,
  invoiceNumber,
  supplierName,
  bankMerchantName,
}: {
  greenInvoiceId: string
  invoiceNumber?: string
  supplierName?: string
  /** שם הספק כפי שמופיע בתשלום הבנק — להשוואה מול המסמך */
  bankMerchantName?: string
}) {
  const [open, setOpen] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedForId, setLoadedForId] = useState<string | null>(null)

  useEffect(() => {
    setOpen(false)
    setError(null)
    setLoading(false)
    setLoadedForId(null)
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }, [greenInvoiceId])

  useEffect(() => {
    if (!open || !greenInvoiceId) return

    let cancelled = false
    const requestId = greenInvoiceId
    setLoading(true)
    setError(null)
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setLoadedForId(null)

    void (async () => {
      try {
        const user = auth.currentUser
        if (!user) throw new ApiError('לא מחובר', 401)
        const token = await user.getIdToken()
        const res = await fetch(
          `/api/integrations/morning/expenses/${encodeURIComponent(requestId)}/document`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          },
        )
        if (!res.ok) {
          let message = 'לא ניתן לטעון את המסמך מחשבונית ירוקה'
          try {
            const data = (await res.json()) as { message?: string }
            if (data.message) message = data.message
          } catch {
            /* ignore */
          }
          throw new ApiError(message, res.status)
        }
        const blob = await res.blob()
        if (!blob.size) {
          throw new ApiError('המסמך ריק או לא זמין', 404)
        }
        if (cancelled || requestId !== greenInvoiceId) return
        setBlobUrl(URL.createObjectURL(blob))
        setLoadedForId(requestId)
      } catch (e) {
        if (!cancelled && requestId === greenInvoiceId) {
          setError(e instanceof ApiError ? e.message : 'שגיאה בטעינת המסמך')
        }
      } finally {
        if (!cancelled && requestId === greenInvoiceId) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, greenInvoiceId])

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const titleParts = [
    invoiceNumber ? `מסמך #${invoiceNumber}` : 'מסמך הוצאה',
    supplierName?.trim(),
  ].filter(Boolean)
  const title = titleParts.join(' — ')

  const showPdf =
    blobUrl && !loading && loadedForId === greenInvoiceId && open

  return (
    <>
      <button
        type="button"
        className={btnClass}
        onClick={() => setOpen(true)}
      >
        📄 צפה במסמך GI
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        size="xl"
        bodyClassName="p-0 overflow-hidden max-h-none"
      >
        <div className="space-y-0 border-b border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-mid)]">
          {supplierName ? (
            <p>
              ספק במסמך GI:{' '}
              <span className="font-bold text-[var(--text-dark)]">{supplierName}</span>
            </p>
          ) : null}
          {bankMerchantName ? (
            <p>
              תשלום בבנק:{' '}
              <span className="font-bold text-[var(--text-dark)]">{bankMerchantName}</span>
            </p>
          ) : null}
        </div>
        {loading ? (
          <p className="p-4 text-sm text-[var(--text-mid)]">טוען מסמך…</p>
        ) : null}
        {error ? (
          <p className="p-4 text-sm font-semibold text-[#DC2626]">{error}</p>
        ) : null}
        {showPdf ? (
          <iframe
            key={greenInvoiceId}
            src={blobUrl}
            title={title}
            className="h-[min(75vh,720px)] w-full rounded-xl border border-[var(--border)] bg-white"
          />
        ) : null}
      </Modal>
    </>
  )
}
