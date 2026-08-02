import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  FinanceAgentDbNotReadyError,
  listExpenses,
  listIncomes,
  monthInventory,
  type MonthFilter,
} from '../lib/financeAgentStore.js'
import { isValidApiKey, parseLimit, unauthorized } from '../lib/hubApiHttpUtil.js'

// נתיב קריאה בלבד לסוכן הפיננסי.
//
// הרישום כולו נעשה במערכת בידי בעל העסק — הסוכן קורא, מסכם ועונה על
// שאלות, ואינו כותב דבר. אין כאן POST/PATCH/DELETE במכוון, וגם ה-CRUD
// הגנרי של /api/bot-data חוסם את אוספי הפיננסים.

function guard(
  req: { headers: Record<string, string | string[] | undefined> },
  reply: FastifyReply,
): boolean {
  if (isValidApiKey(req.headers)) return true
  const r = unauthorized()
  reply.code(r.status).send(r.body)
  return false
}

function handleDbError(e: unknown, reply: FastifyReply): boolean {
  if (e instanceof FinanceAgentDbNotReadyError) {
    reply.code(503).send({ ok: false, error: 'firebase_not_configured', message: e.message })
    return true
  }
  return false
}

const YM = /^\d{4}-\d{2}$/

function parseMonthFilter(
  query: Record<string, unknown>,
  reply: FastifyReply,
): MonthFilter | null {
  const read = (key: string): string | undefined => {
    const raw = query[key]
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
  }
  const month = read('month')
  const from = read('from')
  const to = read('to')

  const invalid = [
    ...(month && !YM.test(month) ? ['month'] : []),
    ...(from && !YM.test(from) ? ['from'] : []),
    ...(to && !YM.test(to) ? ['to'] : []),
  ]
  if (invalid.length > 0) {
    reply.code(400).send({
      ok: false,
      error: 'validation_error',
      errors: invalid.map((f) => `${f} — נדרש בפורמט YYYY-MM`),
    })
    return null
  }

  return {
    ...(month ? { month } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    limit: parseLimit(query, 500, 200),
  }
}

export async function registerFinanceAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/finance-agent/contract', async (req, reply) => {
    if (!guard(req as never, reply)) return
    reply.send({
      ok: true,
      version: 2,
      access: 'read_only',
      description:
        'גישת קריאה לעולם הפיננסי. הסוכן עונה על שאלות ואינו רושם דבר — כל ההזנה נעשית במערכת.',
      endpoints: {
        'GET /api/finance-agent/expenses':
          'הוצאות. פרמטרים: month=YYYY-MM או from=&to=, limit',
        'GET /api/finance-agent/incomes':
          'הכנסות. פרמטרים: month=YYYY-MM או from=&to=, limit',
        'GET /api/finance-agent/inventory':
          'מצאי לכל חודש: כמה הוצאות והכנסות רשומות וסכומן הגולמי',
      },
      writes:
        'אין. בקשת כתיבה תוחזר עם 405. הוצאה חדשה נרשמת במסך ההוצאות במערכת בלבד.',
      profitNumbers:
        'הרווח, המע״מ והייחוס החודשי מחושבים בדשבורד בלבד כדי שלא יתקיימו שני מספרים שונים. כאן נמסרים נתוני הגלם והסכומים הגולמיים.',
    })
  })

  app.get('/api/finance-agent/expenses', async (req, reply) => {
    if (!guard(req as never, reply)) return
    const filter = parseMonthFilter(req.query as Record<string, unknown>, reply)
    if (!filter) return
    try {
      const items = await listExpenses(filter)
      reply.send({ ok: true, count: items.length, items })
    } catch (e) {
      if (handleDbError(e, reply)) return
      throw e
    }
  })

  app.get('/api/finance-agent/incomes', async (req, reply) => {
    if (!guard(req as never, reply)) return
    const filter = parseMonthFilter(req.query as Record<string, unknown>, reply)
    if (!filter) return
    try {
      const items = await listIncomes(filter)
      reply.send({ ok: true, count: items.length, items })
    } catch (e) {
      if (handleDbError(e, reply)) return
      throw e
    }
  })

  app.get('/api/finance-agent/inventory', async (req, reply) => {
    if (!guard(req as never, reply)) return
    try {
      const months = await monthInventory()
      reply.send({ ok: true, count: months.length, months })
    } catch (e) {
      if (handleDbError(e, reply)) return
      throw e
    }
  })

  // תשובה מפורשת ומיידית לכל ניסיון כתיבה — עדיף על 404 שמשאיר את הסוכן
  // מנחש אם הנתיב קיים ומה לעשות הלאה.
  for (const method of ['post', 'patch', 'delete', 'put'] as const) {
    app[method]('/api/finance-agent/*', async (req, reply) => {
      if (!guard(req as never, reply)) return
      reply.code(405).send({
        ok: false,
        error: 'read_only',
        message:
          'הסוכן אינו רושם נתונים פיננסיים. יש להזין את הרשומה במסך ההוצאות במערכת.',
      })
    })
  }
}
