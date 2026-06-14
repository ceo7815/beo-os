import dotenv from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const repoRoot = path.dirname(serverRoot)

/** טעינת env לפיתוח: server/.env.local → server/.env → שורש הפרויקט */
const candidates = [
  path.join(serverRoot, '.env.local'),
  path.join(serverRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, '.env'),
]

let loaded = false
for (const envPath of candidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: loaded })
    loaded = true
  }
}

export { serverRoot, repoRoot }
