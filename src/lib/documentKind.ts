/** זיהוי סוג מסמך לפי שם הקובץ — קובע איך להציג אותו */

export function isImageDocument(fileName: string | undefined): boolean {
  return /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(fileName ?? '')
}

export function isPdfDocument(fileName: string | undefined): boolean {
  return /\.pdf$/i.test(fileName ?? '')
}
