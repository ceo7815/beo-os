/**
 * מייצר ערך FIREBASE_SERVICE_ACCOUNT_B64 להדבקה ב-xCloud Environment.
 *
 * node scripts/encode-firebase-sa.mjs path/to/service-account.json
 */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('Usage: node scripts/encode-firebase-sa.mjs <service-account.json>')
  process.exit(1)
}

const json = readFileSync(path, 'utf8')
JSON.parse(json)

const b64 = Buffer.from(json, 'utf8').toString('base64')
console.log('הוסף ל-xCloud Environment (שורה אחת):')
console.log('')
console.log(`FIREBASE_SERVICE_ACCOUNT_B64=${b64}`)
