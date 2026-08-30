import { brandLogoSrc } from '../../lib/brand'

export function socialMediaSrc(url: string | undefined): string {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/api/beo-agents')) return url
  if (url.startsWith('/api/')) return `/api/beo-agents${url.slice(4)}`
  return url
}

function BrandAvatar({
  name,
  size = 'md',
}: {
  name: string
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10 ${dim}`}
    >
      <img src={brandLogoSrc()} alt={name} className="h-[70%] w-[70%] object-contain" />
    </span>
  )
}

function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function IconComment({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9l20-7z" />
    </svg>
  )
}

function IconBookmark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconThumbsUp() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 4.98M15.41 5.51 8.59 10.49" />
    </svg>
  )
}

function Dots({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  )
}

function FeedMedia({ src, empty }: { src: string; empty: string }) {
  if (!src) {
    return (
      <div className="flex aspect-square items-center justify-center bg-[#f0f2f5] text-sm text-[#65676b]">
        {empty}
      </div>
    )
  }
  return <img src={src} alt="" className="aspect-square w-full object-cover" />
}

export function FacebookFeedPreview({
  caption,
  imageUrl,
  pageName = 'Beo Systems',
  publishTime,
}: {
  caption: string
  imageUrl?: string
  pageName?: string
  publishTime?: string
}) {
  const src = socialMediaSrc(imageUrl)
  return (
    <article
      dir="rtl"
      className="mx-auto w-full max-w-[480px] overflow-hidden rounded-xl border border-[#ccd0d5] bg-white text-[#050505] shadow-sm"
    >
      <header className="flex items-start gap-3 px-3 pb-2 pt-3">
        <BrandAvatar name={pageName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{pageName}</p>
          <p className="mt-0.5 text-[12px] text-[#65676b]">
            {publishTime ? `היום בשעה ${publishTime}` : 'פרסום מיידי'} · 🌐
          </p>
        </div>
        <Dots className="mt-1 h-5 w-5 text-[#65676b]" />
      </header>

      {caption.trim() ? (
        <p className="whitespace-pre-wrap px-3 pb-3 text-[15px] leading-[1.45] [overflow-wrap:anywhere]">
          {caption}
        </p>
      ) : (
        <p className="px-3 pb-3 text-[15px] text-[#65676b]">אין טקסט עדיין</p>
      )}

      <div className="border-y border-[#ccd0d5] bg-[#f0f2f5]">
        <FeedMedia src={src} empty="אין מדיה לפיד" />
      </div>

      <div className="flex items-center justify-between px-3 py-2.5 text-[13px] text-[#65676b]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#1877f2] text-[9px] text-white">
            👍
          </span>
          לייקים
        </span>
        <span>תגובות · שיתופים</span>
      </div>

      <div className="grid grid-cols-3 border-t border-[#ccd0d5] px-1 py-1 text-[13px] font-semibold text-[#65676b]">
        <span className="inline-flex items-center justify-center gap-1.5 rounded-md py-2">
          <IconThumbsUp /> לייק
        </span>
        <span className="inline-flex items-center justify-center gap-1.5 rounded-md py-2">
          <IconComment className="h-4 w-4" /> תגובה
        </span>
        <span className="inline-flex items-center justify-center gap-1.5 rounded-md py-2">
          <IconShare /> שיתוף
        </span>
      </div>
    </article>
  )
}

export function InstagramFeedPreview({
  caption,
  imageUrl,
  handle = 'beosystems',
}: {
  caption: string
  imageUrl?: string
  handle?: string
}) {
  const src = socialMediaSrc(imageUrl)
  return (
    <article
      dir="ltr"
      className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-[#dbdbdb] bg-white text-[#262626] shadow-sm"
    >
      <header className="flex items-center gap-3 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] p-[2px]">
          <span className="block rounded-full bg-white p-[2px]">
            <BrandAvatar name={handle} size="sm" />
          </span>
        </span>
        <div className="min-w-0 flex-1 text-start">
          <p className="truncate text-sm font-semibold">{handle}</p>
        </div>
        <Dots />
      </header>

      <div className="bg-[#fafafa]">
        <FeedMedia src={src} empty="אין מדיה לפיד" />
      </div>

      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-4">
          <IconHeart />
          <IconComment />
          <IconSend />
        </div>
        <IconBookmark />
      </div>

      <div dir="rtl" className="space-y-1.5 px-3 pb-4 text-sm">
        <p className="font-semibold">{handle}</p>
        {caption.trim() ? (
          <p className="whitespace-pre-wrap leading-[1.45] [overflow-wrap:anywhere]">{caption}</p>
        ) : (
          <p className="text-[#8e8e8e]">אין טקסט עדיין</p>
        )}
      </div>
    </article>
  )
}

export function StoryPreview({
  imageUrl,
  handle = 'beosystems',
}: {
  imageUrl?: string
  handle?: string
}) {
  const src = socialMediaSrc(imageUrl)
  return (
    <div
      dir="ltr"
      className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-[1.75rem] border border-zinc-800 bg-black shadow-xl"
    >
      <div className="absolute inset-x-3 top-3 z-20 flex gap-1">
        <span className="h-0.5 flex-1 rounded-full bg-white/90" />
        <span className="h-0.5 flex-1 rounded-full bg-white/35" />
      </div>

      <div className="absolute inset-x-3 top-6 z-20 flex items-center gap-2">
        <BrandAvatar name={handle} size="sm" />
        <p className="truncate text-sm font-semibold text-white drop-shadow">{handle}</p>
        <span className="text-xs text-white/70">עכשיו</span>
      </div>

      {src ? (
        <img src={src} alt="תצוגת סטורי" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/60">
          אין מדיה לסטורי
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-16">
        <div className="flex items-center gap-2 rounded-full border border-white/30 bg-black/20 px-3 py-2 text-sm text-white/80">
          שליחת הודעה…
        </div>
      </div>
    </div>
  )
}
