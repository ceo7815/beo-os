import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * טוען משתני סביבה למחשב מקומי / אמולטור.
 * סדר: קובץ בסיס → `.env.local` (דורס) — סודות לא ב-`functions/.env` כדי שלא ייכנסו לפריסה כ-env רגיל ויתנגשו ב-Secret Manager.
 */
const candidates = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'functions', '.env'),
  path.join(process.cwd(), 'functions', '.env.local'),
  path.join(process.cwd(), '.env.local'),
]
for (const envPath of candidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true })
  }
}
