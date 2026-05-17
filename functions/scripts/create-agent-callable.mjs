/**
 * Creates a sales agent via createManagedUser (requires superadmin session).
 *
 * Usage (from functions/):
 *   $env:HUB_ADMIN_EMAIL="ceo@hub.co.il"
 *   $env:HUB_ADMIN_PASSWORD="..."
 *   node scripts/create-agent-callable.mjs tom.greenlime@gmail.com tom123456 "tom-owl"
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyAjMt8jq1b25AjXV6oRsK1uzlRpkjv-ADk',
  authDomain: 'hub-pos-f399c.firebaseapp.com',
  projectId: 'hub-pos-f399c',
  storageBucket: 'hub-pos-f399c.firebasestorage.app',
  messagingSenderId: '961483294937',
  appId: '1:961483294937:web:765583ea55dc05cfa416c8',
}

const [, , emailArg, passwordArg, nameArg] = process.argv
const email = (emailArg ?? process.env.AGENT_EMAIL ?? '').trim().toLowerCase()
const password = (passwordArg ?? process.env.AGENT_PASSWORD ?? '').trim()
const name = (nameArg ?? process.env.AGENT_NAME ?? '').trim()
const adminEmail = (process.env.HUB_ADMIN_EMAIL ?? '').trim()
const adminPassword = (process.env.HUB_ADMIN_PASSWORD ?? '').trim()

if (!email || !password || !name) {
  console.error('Usage: node scripts/create-agent-callable.mjs <email> <password> <name>')
  process.exit(1)
}
if (!adminEmail || !adminPassword) {
  console.error('Set HUB_ADMIN_EMAIL and HUB_ADMIN_PASSWORD (superadmin) in the environment.')
  process.exit(1)
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const functions = getFunctions(app, 'us-central1')
if (process.env.FUNCTIONS_EMULATOR === '1') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

try {
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
  const createManagedUser = httpsCallable(functions, 'createManagedUser')
  const { data } = await createManagedUser({
    email,
    password,
    name,
    role: 'employee',
    isAgent: true,
  })
  console.log(JSON.stringify({ ok: true, uid: data?.uid, email, name, isAgent: true }))
} catch (e) {
  const code = e?.code ?? 'unknown'
  const message = e?.message ?? String(e)
  console.error(JSON.stringify({ ok: false, code, message }))
  process.exit(1)
}
