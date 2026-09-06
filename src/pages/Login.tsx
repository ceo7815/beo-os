import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { BRAND, brandLogoAlt, brandLogoSrc } from '../lib/brand'

function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'כתובת האימייל אינה תקינה'
    case 'auth/user-disabled':
      return 'המשתמש חסום'
    case 'auth/wrong-password':
      return 'סיסמה שגויה'
    case 'auth/user-not-found':
      return 'משתמש לא נמצא'
    case 'auth/too-many-requests':
      return 'נסה שוב מאוחר יותר'
    case 'auth/invalid-credential':
      return 'אימייל או סיסמה שגויים'
    default:
      return 'ההתחברות נכשלה. נסו שוב.'
  }
}

const PAGE_BG = '#0c0c0e'
const LOGIN_LOGO_SRC = `${brandLogoSrc()}?v=3`

export function Login() {
  const navigate = useNavigate()
  const { user, loading, authReady, signInWithEmail } = useAuth()

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [user, loading, navigate])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('נא להזין כתובת אימייל')
      return
    }
    if (!trimmed.includes('@')) {
      setError('כתובת האימייל אינה תקינה')
      return
    }
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await signInWithEmail(trimmed, password)
      if (remember) {
        localStorage.setItem('beo-os-remember-login', '1')
      }
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : ''
      setError(authErrorMessage(code))
    } finally {
      setSubmitting(false)
    }
  }

  if (!authReady) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col items-center justify-center p-8 text-center"
        style={{ backgroundColor: PAGE_BG }}
      >
        <p className="max-w-md text-base font-semibold text-white/80">
          חסרה הגדרת Supabase. צרו קובץ{' '}
          <code className="text-sm text-white">.env.local</code> בשורש הפרויקט עם{' '}
          <code className="text-sm text-white">VITE_SUPABASE_URL</code> ו-{' '}
          <code className="text-sm text-white">VITE_SUPABASE_ANON_KEY</code> (ראו{' '}
          <code className="text-sm text-white">.env.example</code>).
        </p>
      </div>
    )
  }

  const inputBase =
    'block w-full min-h-[48px] rounded-xl border border-[#D1D5DB] bg-white px-4 py-3 text-[15px] leading-normal text-[#141416] shadow-sm outline-none transition placeholder:text-[#9CA3AF] focus:border-[#5828A0] focus:ring-2 focus:ring-[#5828A0]/20'

  return (
    <div
      dir="rtl"
      className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-4 py-10 sm:py-14"
      style={{ backgroundColor: PAGE_BG }}
    >
      <style>{`
        @keyframes login-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-animate { animation: login-in 0.45s ease-out both; }
        .login-card {
          background: #ffffff;
          border-radius: 1rem;
          border: 1px solid rgba(88, 40, 160, 0.12);
          box-shadow: 0 10px 40px rgba(88, 40, 160, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .login-tech-layer {
          pointer-events: none;
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .login-tech-grid {
          position: absolute;
          inset: -5%;
          width: 110%;
          height: 110%;
          opacity: 0.55;
          background-image:
            linear-gradient(rgba(88, 40, 160, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(88, 40, 160, 0.05) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        @media (prefers-reduced-motion: reduce) {
          .login-animate { animation: none; opacity: 1; transform: none; }
        }
      `}</style>

      <div className="login-tech-layer" aria-hidden>
        <div className="login-tech-grid" />
      </div>

      <div className="login-animate relative z-10 flex w-full max-w-[440px] flex-col items-center">
        <img
          src={LOGIN_LOGO_SRC}
          alt={brandLogoAlt()}
          className="mb-8 h-auto w-full max-w-[min(100%,340px)] select-none border-0 object-contain sm:max-w-[380px]"
          decoding="async"
        />

        <div className="login-card w-full px-6 py-8 sm:px-8 sm:py-9">
          <h1 className="text-center text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[28px]">
            שלום, ברוך הבא
          </h1>
          <p className="mt-2 text-center text-[14px] text-slate-500 sm:text-[15px]">
            התחבר עם האימייל והסיסמה שלך
          </p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="login-email"
                className="text-[13px] font-semibold leading-snug text-slate-700"
              >
                כתובת אימייל
              </label>
              <div dir="ltr" lang="en" className="relative isolate">
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className={inputBase}
                  style={{ textAlign: 'left' }}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError('')
                  }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="login-password"
                className="text-[13px] font-semibold leading-snug text-slate-700"
              >
                סיסמה
              </label>
              <div dir="ltr" lang="en" className="relative isolate">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="הזן סיסמה"
                  className={`${inputBase} pe-[4.75rem]`}
                  style={{ textAlign: 'left' }}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  className="absolute end-2 top-1/2 z-10 min-h-[36px] shrink-0 -translate-y-1/2 rounded-lg px-2.5 text-[12px] font-semibold text-[#575757] transition hover:bg-neutral-100 hover:text-[#171717]"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? 'הסתר' : 'הצג'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] leading-snug text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#9CA3AF] bg-white text-[#5828A0] accent-[#5828A0]"
                />
                זכור אותי
              </label>
              <a
                href="#"
                className="text-[14px] font-semibold leading-snug text-[#5828A0] transition hover:text-[#6B38B8]"
                onClick={(e) => e.preventDefault()}
              >
                שכחתי סיסמה
              </a>
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="mt-1 min-h-[50px] w-full rounded-xl bg-[#5828A0] py-3 text-[16px] font-bold leading-snug text-white shadow-[0_4px_18px_rgba(88,40,160,0.28)] transition hover:bg-[#6B38B8] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting || loading ? 'מתחבר...' : 'התחבר'}
            </button>

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-[#FEF2F2] px-3 py-2.5 text-center text-[13px] font-medium text-[#B91C1C]"
              >
                {error}
              </p>
            ) : null}
          </form>
        </div>

        <p className="mt-10 max-w-[min(100%,440px)] text-center text-[11px] leading-relaxed text-white/40">
          כל הזכויות שמורות ל{BRAND.legalName}
        </p>
      </div>
    </div>
  )
}
