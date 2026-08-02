import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import {
  ACCEPTED_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  UnsafePathError,
  buildStoredName,
  contentTypeFor,
  documentUrlFor,
  isAcceptedDocument,
  isSafeSegment,
  resolveDocumentPath,
} from '../lib/financeDocumentStore.js'

/**
 * חשבוניות הספק נשמרות על השרת ולא בשירות אחסון חיצוני.
 *
 * ההעלאה דורשת הרשאת מנהל. ההורדה פתוחה, אבל שם הקובץ אקראי ולכן הקישור
 * אינו ניתן לניחוש — כמו קישורי ההורדה של Firebase Storage שהוחלפו כאן.
 */
/** מיוצא בנפרד מהרישום כדי שאפשר יהיה לבדוק את ההעלאה בלי שכבת ההרשאות */
export async function handleDocumentUpload(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { expenseId } = req.params as { expenseId: string }
  if (!isSafeSegment(expenseId)) {
    return reply
      .code(400)
      .send({ ok: false, error: 'bad_expense_id', message: 'מזהה הוצאה לא חוקי' })
  }

  const file = await req.file({ limits: { fileSize: MAX_DOCUMENT_BYTES } })
  if (!file) {
    return reply
      .code(400)
      .send({ ok: false, error: 'no_file', message: 'לא צורף קובץ' })
  }

  if (!isAcceptedDocument(file.filename)) {
    return reply.code(415).send({
      ok: false,
      error: 'unsupported_type',
      message: `סוג הקובץ אינו נתמך. אפשר להעלות ${ACCEPTED_EXTENSIONS.join(' · ')}`,
    })
  }

  const buffer = await file.toBuffer()
  // truncated נדלק כשהזרם נחתך במגבלת הגודל — שמירה כאן הייתה יוצרת קובץ פגום
  if (file.file.truncated) {
    return reply.code(413).send({
      ok: false,
      error: 'too_large',
      message: `הקובץ גדול מ-${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)}MB`,
    })
  }

  const storedName = buildStoredName(file.filename)
  const target = resolveDocumentPath(env.financeDocsDir, expenseId, storedName)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, buffer)

  return reply.send({
    ok: true,
    url: documentUrlFor(expenseId, storedName),
    fileName: file.filename,
    size: buffer.byteLength,
  })
}

export async function registerFinanceDocumentRoutes(app: FastifyInstance) {
  app.post(
    '/api/finance-documents/:expenseId',
    { preHandler: requireAdmin },
    handleDocumentUpload,
  )

  app.get(
    '/api/finance-documents/:expenseId/:fileName',
    async (req, reply) => {
      const { expenseId, fileName } = req.params as {
        expenseId: string
        fileName: string
      }

      let target: string
      try {
        target = resolveDocumentPath(env.financeDocsDir, expenseId, fileName)
      } catch (e) {
        if (e instanceof UnsafePathError) {
          return reply
            .code(400)
            .send({ ok: false, error: 'bad_path', message: e.message })
        }
        throw e
      }

      try {
        const info = await stat(target)
        if (!info.isFile()) throw new Error('not a file')
        return reply
          .header('Content-Type', contentTypeFor(fileName))
          .header('Content-Length', String(info.size))
          // הקובץ אינו משתנה אחרי שנשמר, ולכן אפשר לשמור אותו במטמון
          .header('Cache-Control', 'private, max-age=31536000, immutable')
          .send(createReadStream(target))
      } catch {
        return reply
          .code(404)
          .send({ ok: false, error: 'not_found', message: 'המסמך לא נמצא' })
      }
    },
  )
}
