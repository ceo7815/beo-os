/** קטגוריות כספת סיסמאות — תואם לשדה category ב-Firestore */
export const PASSWORD_VAULT_CATEGORIES = [
  'חשבונות לקוחות',
  'מערכות כלליות',
  'שרתים ותשתית',
  'רשתות חברתיות',
  'אימיילים',
  'ניהול דומיינים',
] as const

export type PasswordVaultCategory = (typeof PASSWORD_VAULT_CATEGORIES)[number]

export function isPasswordVaultCategory(s: string): s is PasswordVaultCategory {
  return (PASSWORD_VAULT_CATEGORIES as readonly string[]).includes(s)
}
