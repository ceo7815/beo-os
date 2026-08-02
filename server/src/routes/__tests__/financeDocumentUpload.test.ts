import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'

/**
 * העלאה מקצה לקצה דרך השרת — הנתיב מעולם לא הורץ עם קובץ אמיתי, ורק
 * בדיקה כזו חושפת תקיעה בקריאת הזרם או כישלון כתיבה לתיקייה.
 */

const PDF_BYTES = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.alloc(4096, 7),
  Buffer.from('\n%%EOF\n'),
])

function multipartBody(
  fieldName: string,
  fileName: string,
  contentType: string,
  bytes: Buffer,
): { payload: Buffer; contentType: string } {
  const boundary = '----hubposboundary1234567890'
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
  return {
    payload: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

let storeDir: string
let app: FastifyInstance

beforeAll(async () => {
  storeDir = await mkdtemp(path.join(tmpdir(), 'hubpos-findocs-'))
  process.env.FINANCE_DOCS_DIR = storeDir

  const { handleDocumentUpload } = await import('../financeDocuments.js')
  const { MAX_DOCUMENT_BYTES } = await import('../../lib/financeDocumentStore.js')

  app = Fastify()
  await app.register(multipart, {
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  })
  app.post('/upload/:expenseId', handleDocumentUpload)
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  if (storeDir) await rm(storeDir, { recursive: true, force: true })
})

describe('העלאת חשבונית לשרת', () => {
  it('שומרת את הקובץ ומחזירה כתובת', async () => {
    const { payload, contentType } = multipartBody(
      'file',
      'invoice.pdf',
      'application/pdf',
      PDF_BYTES,
    )

    const res = await app.inject({
      method: 'POST',
      url: '/upload/expense-123',
      headers: { 'content-type': contentType },
      payload,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { url: string; fileName: string; size: number }
    expect(body.fileName).toBe('invoice.pdf')
    expect(body.size).toBe(PDF_BYTES.byteLength)
    expect(body.url).toMatch(
      /^\/api\/finance-documents\/expense-123\/[0-9a-f-]+\.pdf$/,
    )
  })

  it('הקובץ קיים על הדיסק וזהה למקור', async () => {
    const dir = path.join(storeDir, 'expense-123')
    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    const saved = await readFile(path.join(dir, files[0]))
    expect(saved.equals(PDF_BYTES)).toBe(true)
  })

  it('דוחה סוג קובץ שאינו נתמך', async () => {
    const { payload, contentType } = multipartBody(
      'file',
      'notes.txt',
      'text/plain',
      Buffer.from('hello'),
    )
    const res = await app.inject({
      method: 'POST',
      url: '/upload/expense-123',
      headers: { 'content-type': contentType },
      payload,
    })
    expect(res.statusCode).toBe(415)
  })

  it('דוחה מזהה הוצאה לא חוקי', async () => {
    const { payload, contentType } = multipartBody(
      'file',
      'invoice.pdf',
      'application/pdf',
      PDF_BYTES,
    )
    const res = await app.inject({
      method: 'POST',
      url: '/upload/..%2Fetc',
      headers: { 'content-type': contentType },
      payload,
    })
    expect(res.statusCode).toBe(400)
  })
})
