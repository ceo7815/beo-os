import { safeFileName, uploadToStorage } from './storageUpload'

export async function uploadLeadQuotePdf(
  leadId: string,
  file: File,
): Promise<{ url: string; fileName: string }> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    throw new Error('נא להעלות קובץ PDF בלבד')
  }
  const path = `leads/${leadId}/quotes/${crypto.randomUUID()}-${safeFileName(file.name)}`
  const url = await uploadToStorage(path, file, { contentType: 'application/pdf' })
  return { url, fileName: file.name }
}
