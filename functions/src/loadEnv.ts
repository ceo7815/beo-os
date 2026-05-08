import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** טוען `functions/.env` או `.env` בשורש הפרויקט (אמולטור / פיתוח בלבד). בפרודקשן משתמשים במשתני סביבה ב-GCP. */
const candidates = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'functions', '.env'),
]
for (const envPath of candidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath })
    break
  }
}
