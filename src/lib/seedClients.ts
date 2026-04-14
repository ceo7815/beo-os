import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import clientsSeedCsv from './clients-seed.csv?raw'
import { db } from './firebase'

/** מפרסר CSV בסיסי (שדות במרכאות, כולל שורות מרובות בשדה) */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  let inQuotes = false
  while (i < t.length) {
    const c = t[i]!
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < t.length && t[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      i++
      continue
    }
    field += c
    i++
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function cell(row: string[], idx: number): string {
  return (row[idx] ?? '').trim()
}

function firstEmail(raw: string): string {
  const part = raw.split(',')[0]?.trim() ?? ''
  return part || ''
}

/**
 * מזריע לקוחות מקובץ `clients-seed.csv` (העתק מדויק של clients (4).csv).
 * upsert לפי עמודת מזהה לקוח — בטוח להרצה חוזרת.
 */
export async function seedClients(): Promise<void> {
  try {
    const rows = parseCsv(clientsSeedCsv)
    if (rows.length < 2) return

    const headers = rows[0].map((h) => h.trim())
    const col = (name: string) => headers.indexOf(name)
    const iName = col('שם לקוח')
    const iMail = col('כתובות מייל')
    const iPhone = col('טלפון')
    const iMobile = col('נייד')
    const iContact = col('שם איש קשר')
    const iDept = col('מחלקה')
    const iId = col('מזהה לקוח')
    if (iId < 0 || iName < 0) {
      console.warn('seedClients: כותרות CSV לא צפויות')
      return
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]!
      const id = cell(row, iId)
      if (!id) continue
      const name = cell(row, iName) || 'ללא שם'
      const email = firstEmail(cell(row, iMail))
      const phone = cell(row, iPhone) || cell(row, iMobile)
      const contact = cell(row, iContact)
      const departmentRaw = iDept >= 0 ? cell(row, iDept) : ''
      const department = departmentRaw || undefined
      await setDoc(
        doc(db, 'clients', id),
        {
          name,
          contact: contact || name,
          phone: phone || '',
          email: email || '',
          ...(department ? { department } : {}),
          status: 'active',
          createdAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
  } catch (e) {
    console.error('seedClients', e)
    throw e
  }
}
