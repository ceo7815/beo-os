import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

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

const charcoal = {
  deep: '#141416',
  panel: '#1C1C1F',
  muted: '#2C2C30',
  text: '#E8E8EA',
  textSoft: 'rgba(232,232,234,0.72)',
}

export function Login() {
  const navigate = useNavigate()
  const { user, loading, firebaseReady, signInWithEmail } = useAuth()

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
        localStorage.setItem('hub-remember-login', '1')
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

  if (!firebaseReady) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F5F5F6] p-8 text-center"
      >
        <p className="max-w-md text-base font-semibold text-[#1C1C1F]">
          חסרה הגדרת Firebase. צרו קובץ <code className="text-sm">.env</code> בשורש
          הפרויקט והעתיקו את המפתחות מקונסולת Firebase (ראו{' '}
          <code className="text-sm">.env.example</code>).
        </p>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-xl border border-[#2C2C30]/18 bg-white px-4 py-3.5 text-[15px] text-[#141416] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition placeholder:text-[#71717A] focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/25'

  return (
    <div
      dir="rtl"
      className="flex min-h-[100dvh] flex-col bg-[#FAFAFA] md:flex-row"
    >
      <style>{`
        @keyframes login-in {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-animate { animation: login-in 0.5s ease-out both; }
      `}</style>

      {/* טופס — ב־RTL בעמודה ראשונה מופיע מימין */}
      <div className="login-animate order-2 flex w-full flex-col justify-center px-6 py-10 sm:px-10 md:order-2 md:w-[46%] md:px-14 md:py-16 lg:w-[44%]">
        <div className="mx-auto w-full max-w-[400px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#EA580C]">
            HUB-POS
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight text-[#141416] md:text-[30px]">
            שלום, ברוך הבא
          </h1>
          <p className="mt-2 text-[15px] text-[#52525B]">התחבר עם האימייל והסיסמה שלך</p>
          <p className="mb-8 mt-4 text-[13px] leading-relaxed text-[#71717A]">
            ההתחברות נשמרת לפי דפדפן. להמשך עבודה מאותו מחשב — השתמשו באותו חשבון
            ארגוני.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-[13px] font-semibold text-[#3F3F46]"
              >
                כתובת אימייל
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                dir="ltr"
                className={`${inputClass} text-left`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError('')
                }}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-[13px] font-semibold text-[#3F3F46]"
              >
                סיסמה
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  dir="ltr"
                  className={`${inputClass} pl-12 text-left`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                />
                <button
                  type="button"
                  aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1.5 text-[13px] text-[#71717A] transition hover:bg-[#F4F4F5] hover:text-[#141416]"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? 'הסתר' : 'הצג'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-[#3F3F46]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-[#D4D4D8] text-[#EA580C] accent-[#EA580C]"
                />
                זכור אותי
              </label>
              <a
                href="#"
                className="text-[14px] font-semibold text-[#EA580C] transition hover:text-[#C2410C]"
                onClick={(e) => e.preventDefault()}
              >
                שכחתי סיסמה
              </a>
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="mt-1 w-full rounded-xl bg-[#EA580C] py-3.5 text-[16px] font-bold text-white shadow-[0_4px_14px_rgba(234,88,12,0.35)] transition hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:opacity-70"
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

          <p className="mt-10 text-center text-[11px] text-[#A1A1AA]">
            © {new Date().getFullYear()} האב מערכות מתקדמות — כל הזכויות שמורות
          </p>
        </div>
      </div>

      {/* פאנל מיתוג */}
      <div
        className="relative order-1 flex min-h-[280px] w-full flex-col justify-between px-8 py-10 text-white md:order-1 md:min-h-0 md:w-[54%] md:px-12 md:py-14 lg:w-[56%]"
        style={{
          background: `linear-gradient(165deg, ${charcoal.panel} 0%, ${charcoal.deep} 45%, ${charcoal.muted} 100%)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 20%, #EA580C 0%, transparent 45%),
              radial-gradient(circle at 80% 80%, #fff 0%, transparent 40%)`,
          }}
        />

        <div className="relative flex flex-1 flex-col items-center justify-center text-center md:py-6">
          <div className="mb-7 flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-[#EA580C] text-[32px] font-black tracking-tight text-white shadow-[0_12px_40px_rgba(234,88,12,0.35)]">
            H
          </div>
          <h2 className="text-[40px] font-extrabold leading-none tracking-tight md:text-[44px]">
            האב
          </h2>
          <p className="mt-3 text-[15px] font-medium" style={{ color: charcoal.textSoft }}>
            מערכות מתקדמות
          </p>
          <div
            className="mx-auto my-7 h-1 w-14 rounded-full bg-[#EA580C]"
            aria-hidden
          />
          <p
            className="max-w-[420px] px-2 text-[16px] font-medium leading-relaxed md:text-[17px]"
            style={{ color: charcoal.text }}
          >
            פלטפורמת ניהול מקצועית לסוכנויות דיגיטל ופיתוח
          </p>
        </div>

        <ul className="relative mt-6 flex flex-col gap-4 pb-2 text-[14px] md:mt-0 md:max-w-md md:self-end md:pb-0">
          {[
            'ניהול פרויקטים ומשימות בזמן אמת',
            'לקוחות, גבייה ומאגר אחסון — במקום אחד',
            'בקרה ושקיפות לצוות מרחוק',
          ].map((line) => (
            <li key={line} className="flex items-start gap-3 text-start">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EA580C]/20 text-[12px] font-bold text-[#FB923C]"
                aria-hidden
              >
                ✓
              </span>
              <span style={{ color: charcoal.textSoft }}>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
