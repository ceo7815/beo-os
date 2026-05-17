import type { Lead, LeadQuoteChannel } from '../../types'

const quoteChannelLabels: Record<LeadQuoteChannel, string> = {
  green_invoice: 'חשבונית ירוקה',
  pdf_file: 'קובץ PDF',
  visual_link: 'קישור ויזואלי',
}

type Props = {
  lead: Lead
  className?: string
}

/** תצוגת הצעת מחיר לליד — לפורטל סוכן */
export function AgentLeadQuoteSnippet({ lead, className = '' }: Props) {
  if (
    lead.status !== 'quote_sent' &&
    !lead.quoteChannel &&
    !lead.quotePdfUrl &&
    !lead.quoteVisualUrl
  ) {
    return null
  }

  return (
    <div className={`space-y-1 text-[10px] text-[var(--text-mid)] ${className}`}>
      {lead.quoteChannel ? (
        <span className="block font-semibold text-[var(--text-dark)]">
          {quoteChannelLabels[lead.quoteChannel]}
        </span>
      ) : null}
      {lead.quotePdfUrl ? (
        <a
          href={lead.quotePdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block font-medium text-[var(--orange)] hover:underline"
          dir="ltr"
        >
          {lead.quotePdfFileName || 'פתיחת PDF'}
        </a>
      ) : null}
      {lead.quoteVisualUrl ? (
        <a
          href={lead.quoteVisualUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-medium text-[var(--orange)] hover:underline"
          dir="ltr"
        >
          קישור להצעה
        </a>
      ) : null}
    </div>
  )
}
