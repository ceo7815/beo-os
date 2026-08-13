/** מקור אמת למיתוג Beo Systems — צבעים מדגימת הלוגו. */
export const BRAND = {
  companyName: 'Beo Systems',
  companyNameHe: 'Beo Systems',
  legalName: 'Beo Systems בע״מ',
  productName: 'Beo OS',
  productMark: 'Beo Systems',
  tagline: 'Digital • AI • Dev',
  tabTitle: 'Beo OS — Digital • AI • Dev',
  reportFooter: 'Beo Systems · דוח פנימי',
  mailTagline: 'Beo Systems · Digital • AI • Dev',
  mailFooter: 'הודעה אוטומטית ממערכת Beo OS · אין להשיב למייל זה',
  logoFile: 'logo-beo-os.png',
  defaultSupplierId: 'supplier_beo_systems',
  defaultSupplierName: 'Beo Systems',
  color: {
    purple: '#5828A0',
    purpleHover: '#6B38B8',
    black: '#000000',
    charcoal: '#181818',
  },
} as const

export function brandLogoSrc(): string {
  return `${import.meta.env.BASE_URL}${BRAND.logoFile}`
}

export function brandLogoAlt(): string {
  return `${BRAND.companyName} — ${BRAND.tagline}`
}
