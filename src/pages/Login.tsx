import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.348 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

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
    case 'auth/popup-closed-by-user':
      return 'חלון ההתחברות נסגר'
    default:
      return 'ההתחברות נכשלה. נסו שוב.'
  }
}

export function Login() {
  const navigate = useNavigate()
  const { user, loading, firebaseReady, signInWithGoogle, signInWithEmail } =
    useAuth()

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

  const onGoogle = async () => {
    setError('')
    setSubmitting(true)
    try {
      await signInWithGoogle()
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
        className="flex min-h-[100dvh] flex-col items-center justify-center bg-white p-8 text-center"
      >
        <p className="max-w-md text-base font-semibold text-[#1A2B5E]">
          חסרה הגדרת Firebase. צרו קובץ <code className="text-sm">.env</code> בשורש
          הפרויקט והעתיקו את המפתחות מקונסולת Firebase (ראו{' '}
          <code className="text-sm">.env.example</code>).
        </p>
      </div>
    )
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-[100dvh] flex-col bg-white md:flex-row"
    >
      <style>{`
        @keyframes login-form-in {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-form-animate {
          animation: login-form-in 0.55s ease-out both;
        }
      `}</style>

      <div className="login-form-animate flex w-full flex-col justify-center px-8 py-12 md:w-[40%] md:px-12 md:py-[60px]">
        <h1 className="text-[26px] font-extrabold text-[#0F172A]">
          שלום, ברוך הבא 👋
        </h1>
        <p className="mt-1 text-sm text-[#64748B]">התחבר כדי להמשיך</p>
        <p className="mb-9 mt-3 max-w-md text-xs leading-relaxed text-[#94A3B8]">
          כל דפדפן (וכן חלון גלישה פרטית) שומר התחברות בנפרד. כדי לראות את אותם
          נתונים מ־localhost או ממחשב אחר — התחברו כאן באותו חשבון Google או אימייל.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-xs font-semibold text-[#374151]"
            >
              כתובת אימייל
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              dir="ltr"
              className="text-right"
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
              className="mb-1.5 block text-xs font-semibold text-[#374151]"
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
                className="pl-10 text-right"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
              />
              <button
                type="button"
                aria-label={showPass ? 'הסתר סיסמה' : 'הצג סיסמה'}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-base text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                onClick={() => setShowPass((v) => !v)}
              >
                👁
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#374151]">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[#E2E8F0] accent-[#1A2B5E]"
              />
              זכור אותי
            </label>
            <a
              href="#"
              className="text-sm font-semibold text-[#2563EB] hover:underline"
              onClick={(e) => e.preventDefault()}
            >
              שכחתי סיסמה
            </a>
          </div>

          <button
            type="submit"
            disabled={submitting || loading}
            className="mt-1 w-full rounded-xl bg-[#1A2B5E] py-3 text-[15px] font-bold text-white transition-colors duration-200 hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {submitting || loading ? 'מתחבר...' : 'התחבר'}
          </button>

          {error ? (
            <p className="text-center text-sm font-medium text-[#EF4444]">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-[#E2E8F0]" />
            <span className="text-xs text-[#94A3B8]">או</span>
            <div className="h-px flex-1 bg-[#E2E8F0]" />
          </div>

          <button
            type="button"
            disabled={submitting || loading}
            onClick={onGoogle}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#E2E8F0] bg-white py-3 text-[15px] font-semibold text-[#374151] transition-colors duration-200 hover:border-[#2563EB] hover:bg-[#F8FAFF] disabled:opacity-80"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>

        <p className="mt-8 text-center text-[11px] text-[#94A3B8]">
          © 2026 האב מערכות מתקדמות — כל הזכויות שמורות
        </p>
      </div>

      <div
        className="relative hidden min-h-[220px] flex-col justify-between px-10 py-12 text-white md:flex md:w-[60%] md:px-14 md:py-16"
        style={{
          background:
            'linear-gradient(135deg, #1A2B5E 0%, #0F1A3E 60%, #1e3a8a 100%)',
        }}
      >
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316] text-3xl font-bold text-white">
            H
          </div>
          <h2 className="font-bold leading-tight text-white" style={{ fontSize: 42 }}>
            האב
          </h2>
          <p className="mt-2 text-base text-[rgba(255,255,255,0.6)]">
            מערכות מתקדמות
          </p>
          <div
            className="mx-auto my-6 rounded-full bg-[#F97316]"
            style={{ width: 60, height: 3 }}
          />
          <p
            className="max-w-md px-2 text-[15px] leading-relaxed text-[rgba(255,255,255,0.7)]"
          >
            פלטפורמת ניהול חכמה לסוכנויות דיגיטל
          </p>
        </div>

        <ul className="flex flex-col gap-3 text-[13px] text-[rgba(255,255,255,0.7)]">
          <li className="flex items-start gap-3">
            <span className="shrink-0 font-bold text-[#F97316]">✓</span>
            <span>ניהול פרויקטים ומשימות בזמן אמת</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="shrink-0 font-bold text-[#F97316]">✓</span>
            <span>מחלקת אחסון ולקוחות במקום אחד</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="shrink-0 font-bold text-[#F97316]">✓</span>
            <span>שיתוף עם כל כלי Google Workspace</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
