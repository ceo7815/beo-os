import type { ReactNode } from 'react'

const glyphClass =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-light)] text-[var(--brand-deep)]'

function GlyphSvg({ children }: { children: ReactNode }) {
  return (
    <span className={glyphClass} aria-hidden>
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  )
}

/** Social — תוכן / רשתות */
export function SocialAgentGlyph() {
  return (
    <GlyphSvg>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </GlyphSvg>
  )
}

/** Leads / שי — גיוס */
export function LeadsAgentGlyph() {
  return (
    <GlyphSvg>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
      <path d="M8 11h6M11 8v6" />
    </GlyphSvg>
  )
}

export function AgentGlyph({ boardId }: { boardId: string }) {
  if (boardId === 'leads-beo') return <LeadsAgentGlyph />
  return <SocialAgentGlyph />
}
