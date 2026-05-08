/** כשיש supplierId בפרויקט/משימה אבל אין התאמה ברשימת הספקים הנטענת */
export const SUPPLIER_NAME_MISSING = 'לא ברשימה'

export function supplierNameMap(
  suppliers: { id: string; name: string }[],
): Map<string, string> {
  const m = new Map<string, string>()
  for (const s of suppliers) {
    const k = s.id.trim()
    if (k) m.set(k, s.name)
  }
  return m
}

/** מחזיר שם ספק; ללא מזהה — undefined; מזהה בלי התאמה — SUPPLIER_NAME_MISSING */
export function supplierDisplayName(
  supplierId: string | null | undefined,
  nameById: Map<string, string>,
): string | undefined {
  const id = typeof supplierId === 'string' ? supplierId.trim() : ''
  if (!id) return undefined
  return nameById.get(id) ?? SUPPLIER_NAME_MISSING
}
