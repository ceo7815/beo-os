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

/** רקע זהה לרקע קובץ הלוגו (דגימת פיקסלים) — ללא מדרגים או גוון אחר */
const LOGO_BG = '#454545'

const onLogoBg = {
  text: '#E8E8EA',
  textSoft: 'rgba(232,232,234,0.72)',
}

/** עוקף מטמון דפדפן אחרי החלפת הקובץ ב־public — הגדילו בעת עדכון לוגו נוסף */
const LOGIN_LOGO_SRC = `${import.meta.env.BASE_URL}logo-hub-pos.png?v=3`

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
        className="flex min-h-[100dvh] flex-col items-center justify-center p-8 text-center"
        style={{ backgroundColor: LOGO_BG }}
      >
        <p className="max-w-md text-base font-semibold text-[#E8E8EA]">
          חסרה הגדרת Firebase. צרו קובץ <code className="text-sm text-white/90">.env</code> בשורש
          הפרויקט והעתיקו את המפתחות מקונסולת Firebase (ראו{' '}
          <code className="text-sm text-white/90">.env.example</code>).
        </p>
      </div>
    )
  }

  /** שדות LTR בתוך עוטף dir="ltr" — מונע חפיפה עם RTL בעמוד */
  const inputBase =
    'block w-full min-h-[48px] rounded-xl border border-[#D1D5DB] bg-white px-4 py-3 text-[15px] leading-normal text-[#141416] shadow-sm outline-none transition placeholder:text-[#9CA3AF] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20'

  /** כתום מותג — תואם ללוגו ול־--orange באפליקציה */
  const orangeGlow =
    '0 0 0 1px rgba(249, 115, 22, 0.42), 0 0 28px rgba(249, 115, 22, 0.26), 0 0 52px rgba(249, 115, 22, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.05)'

  return (
    <div
      dir="rtl"
      className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-4 py-10 sm:py-14"
      style={{ backgroundColor: LOGO_BG }}
    >
      <style>{`
        @keyframes login-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-animate { animation: login-in 0.45s ease-out both; }
        @keyframes login-glow-soft {
          0%, 100% {
            box-shadow: ${orangeGlow};
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(249, 115, 22, 0.5),
              0 0 36px rgba(249, 115, 22, 0.32),
              0 0 72px rgba(249, 115, 22, 0.14),
              inset 0 1px 0 rgba(255, 255, 255, 0.06);
          }
        }
        .login-card-glow {
          background-color: ${LOGO_BG};
          border-radius: 1rem;
          box-shadow: ${orangeGlow};
          animation: login-glow-soft 5s ease-in-out infinite;
        }
        /* רקע טכנולוגי — תנועה משמאל לימין */
        @keyframes login-tech-grid-drift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(64px, 0, 0); }
        }
        @keyframes login-tech-diag-drift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(120px, 0, 0); }
        }
        @keyframes login-tech-sweep {
          0% { transform: translate3d(-120%, 0, 0); opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { transform: translate3d(120vw, 0, 0); opacity: 0; }
        }
        @keyframes login-tech-shapes {
          0% { transform: translate3d(-8%, 0, 0); }
          100% { transform: translate3d(8%, 0, 0); }
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
          opacity: 0.45;
          background-image:
            linear-gradient(rgba(249, 115, 22, 0.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249, 115, 22, 0.09) 1px, transparent 1px);
          background-size: 64px 64px;
          animation: login-tech-grid-drift 4.5s linear infinite;
          will-change: transform;
        }
        .login-tech-diagonal {
          position: absolute;
          inset: -20% -30%;
          width: 160%;
          height: 140%;
          opacity: 0.35;
          background: repeating-linear-gradient(
            108deg,
            transparent 0,
            transparent 68px,
            rgba(249, 115, 22, 0.05) 68px,
            rgba(249, 115, 22, 0.14) 69px,
            transparent 70px,
            transparent 148px
          );
          animation: login-tech-diag-drift 2.8s linear infinite;
          mix-blend-mode: screen;
          will-change: transform;
        }
        .login-tech-sweep {
          position: absolute;
          left: 0;
          height: 3px;
          width: min(55vw, 420px);
          border-radius: 9999px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(249, 115, 22, 0.15),
            rgba(253, 186, 116, 0.95),
            rgba(249, 115, 22, 0.55),
            transparent
          );
          box-shadow:
            0 0 14px rgba(249, 115, 22, 0.55),
            0 0 32px rgba(249, 115, 22, 0.35);
          animation: login-tech-sweep 3.2s linear infinite;
          will-change: transform, opacity;
        }
        .login-tech-sweep--a { top: 14%; animation-duration: 2.6s; animation-delay: 0s; }
        .login-tech-sweep--b { top: 48%; width: min(40vw, 320px); animation-duration: 3.8s; animation-delay: 0.9s; opacity: 0.85; }
        .login-tech-sweep--c { top: 76%; animation-duration: 3.1s; animation-delay: 1.7s; height: 2px; }
        .login-tech-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0.4;
          animation: login-tech-shapes 14s ease-in-out infinite alternate;
        }
        .login-tech-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse 85% 70% at 50% 45%,
            transparent 20%,
            rgba(69, 69, 69, 0.55) 100%
          );
        }
        @media (prefers-reduced-motion: reduce) {
          .login-card-glow { animation: none; }
          .login-animate { animation: none; opacity: 1; transform: none; }
          .login-tech-grid,
          .login-tech-diagonal,
          .login-tech-sweep,
          .login-tech-svg { animation: none !important; }
          .login-tech-grid { transform: none; }
          .login-tech-diagonal { transform: none; }
          .login-tech-sweep { opacity: 0.35; transform: none; }
          .login-tech-svg { transform: none; }
        }
      `}</style>

      <div className="login-tech-layer" aria-hidden>
        <div className="login-tech-grid" />
        <div className="login-tech-diagonal" />
        <div className="login-tech-sweep login-tech-sweep--a" />
        <div className="login-tech-sweep login-tech-sweep--b" />
        <div className="login-tech-sweep login-tech-sweep--c" />
        <svg
          className="login-tech-svg"
          viewBox="0 0 1000 700"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="loginTechStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F97316" stopOpacity="0" />
              <stop offset="45%" stopColor="#FB923C" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#F97316" stopOpacity="0.15" />
            </linearGradient>
            <filter id="loginTechGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g fill="none" stroke="url(#loginTechStroke)" strokeWidth="1.2" filter="url(#loginTechGlow)">
            <path d="M40 120 h80 l40 40 v60 l-40 40 h-80 v-140 z" opacity="0.9" />
            <path d="M820 480 h-90 l-35-35 v-55 l35-35 h90 v125 z" opacity="0.75" />
            <path d="M180 520 L280 420 M320 560 L420 460 M500 600 L620 480" strokeLinecap="round" />
            <path d="M700 80 L820 200 M640 40 L760 160" strokeLinecap="round" opacity="0.6" />
            <rect x="420" y="180" width="160" height="100" rx="8" opacity="0.55" />
            <circle cx="260" cy="200" r="6" fill="rgba(249,115,22,0.35)" stroke="rgba(253,186,116,0.9)" />
            <circle cx="740" cy="380" r="5" fill="rgba(249,115,22,0.3)" stroke="rgba(253,186,116,0.85)" />
            <path d="M60 360 h200 M60 380 h140 M60 400 h180" strokeDasharray="10 14" opacity="0.5" />
            <path d="M880 280 v160 M860 280 v160 M840 280 v160" strokeDasharray="8 12" opacity="0.45" />
          </g>
        </svg>
        <div className="login-tech-vignette" />
      </div>

      <div className="login-animate relative z-10 flex w-full max-w-[440px] flex-col items-center">
        <img
          src={LOGIN_LOGO_SRC}
          alt="Hub-Pos — ניהול סוכנויות דיגיטל"
          className="mb-8 h-auto w-full max-w-[min(100%,340px)] select-none border-0 object-contain sm:max-w-[380px]"
          decoding="async"
        />

        <div className="login-card-glow w-full px-6 py-8 sm:px-8 sm:py-9">
          <h1 className="text-center text-[26px] font-extrabold leading-tight tracking-tight text-white sm:text-[28px]">
            שלום, ברוך הבא
          </h1>
          <p
            className="mt-2 text-center text-[14px] sm:text-[15px]"
            style={{ color: onLogoBg.textSoft }}
          >
            התחבר עם האימייל והסיסמה שלך
          </p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="login-email"
                className="text-[13px] font-semibold leading-snug text-[#E8E8EA]"
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
                className="text-[13px] font-semibold leading-snug text-[#E8E8EA]"
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
              <label className="flex cursor-pointer items-center gap-2.5 text-[14px] leading-snug text-[#E8E8EA]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#9CA3AF] bg-white text-[#F97316] accent-[#F97316]"
                />
                זכור אותי
              </label>
              <a
                href="#"
                className="text-[14px] font-semibold leading-snug text-[#F97316] transition hover:text-[#FB923C]"
                onClick={(e) => e.preventDefault()}
              >
                שכחתי סיסמה
              </a>
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="mt-1 min-h-[50px] w-full rounded-xl bg-[#F97316] py-3 text-[16px] font-bold leading-snug text-white shadow-[0_4px_18px_rgba(249,115,22,0.35)] transition hover:bg-[#EA580C] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
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

        <p className="mt-10 max-w-[min(100%,440px)] text-center text-[11px] leading-relaxed text-white/45">
          כל הזכויות שמורות לחברת האב מערכות מתקדמות בע&quot;מ
        </p>
      </div>
    </div>
  )
}
