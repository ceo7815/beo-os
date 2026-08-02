import { useEffect, useMemo } from 'react'
import { isImageDocument, isPdfDocument } from '../../lib/documentKind'

/**
 * תצוגה מקדימה של חשבונית שמורה.
 *
 * הצגת המסמך עצמו היא ההוכחה היחידה שהקובץ באמת נשמר ולא רק שמו. בלעדיה
 * אי אפשר לדעת אם הועלה הקובץ הנכון, ובשליחה לרואה החשבון מתגלה שחסר מסמך.
 */

/** URL זמני לקובץ מקומי, משוחרר כשהרכיב יורד מהמסך */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])
  return url
}

export function DocumentPreview({
  file,
  url,
  fileName,
  height = 320,
}: {
  /** קובץ שנבחר ועדיין לא הועלה */
  file?: File | null
  /** מסמך ששמור כבר באחסון */
  url?: string
  fileName?: string
  height?: number
}) {
  const localUrl = useObjectUrl(file ?? null)
  const src = localUrl ?? url ?? null
  const name = file?.name ?? fileName ?? ''

  if (!src) return null

  const frameClass =
    'w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40'

  if (isImageDocument(name)) {
    return (
      <div className={frameClass}>
        <img
          src={src}
          alt={name || 'חשבונית'}
          style={{ maxHeight: height }}
          className="mx-auto block w-auto max-w-full object-contain"
        />
      </div>
    )
  }

  if (isPdfDocument(name)) {
    return (
      <div className={frameClass}>
        <object data={src} type="application/pdf" width="100%" height={height}>
          {/* דפדפנים שאינם מציגים PDF מוטמע — הקובץ עצמו עדיין שמור */}
          <div className="p-4 text-center text-[12px] text-[var(--text-mid)]">
            לא ניתן להציג את ה-PDF כאן.{' '}
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--orange)] underline"
            >
              פתיחה בכרטיסייה חדשה
            </a>
          </div>
        </object>
      </div>
    )
  }

  return (
    <div className={`${frameClass} p-4 text-center`}>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="text-[12px] font-bold text-[var(--orange)] underline"
      >
        {name || 'פתיחת הקובץ'}
      </a>
    </div>
  )
}
