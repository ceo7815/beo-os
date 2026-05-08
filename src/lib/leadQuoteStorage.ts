import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'

export async function uploadLeadQuotePdf(
  leadId: string,
  file: File,
): Promise<{ url: string; fileName: string }> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw new Error('נא להעלות קובץ PDF בלבד')
  }
  const safeTail = file.name
    .replace(/[^\w.\u0590-\u05FF\- ]/g, '_')
    .slice(0, 120)
  const path = `leads/${leadId}/quotes/${crypto.randomUUID()}-${safeTail}`
  const r = ref(storage, path)
  await uploadBytes(r, file, { contentType: 'application/pdf' })
  const url = await getDownloadURL(r)
  return { url, fileName: file.name }
}
