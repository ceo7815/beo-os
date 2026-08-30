/** נתוני דמו ללוח Beo Leads ב-OS בלבד — לא נשלחים ולא נכתבים ל-Firestore. */

export type BeoServiceFit =
  | 'אפליקציות/אתרים'
  | 'סוכן AI'
  | 'CRM/מערכת'
  | 'צ׳אטבוט/אוטומציה'
  | 'הטמעת AI'

export type PipelineStatus =
  | 'found'
  | 'skipped_no_email'
  | 'skipped_too_big'
  | 'draft'
  | 'awaiting_approval'
  | 'sent'
  | 'replied_lead'
  | 'no_reply_closed'

export const PIPELINE_STATUS_LABEL: Record<PipelineStatus, string> = {
  found: 'נמצא',
  skipped_no_email: 'דילג (אין מייל)',
  skipped_too_big: 'דילג (גדול מדי)',
  draft: 'טיוטה',
  awaiting_approval: 'ממתין לאישור',
  sent: 'נשלח',
  replied_lead: 'נענה → ליד',
  no_reply_closed: 'לא ענו → סגור',
}

export type LeadsBeoPipelineRow = {
  id: string
  isDemo: true
  businessName: string
  websiteUrl: string
  email: string | null
  score: number | null
  status: PipelineStatus
}

export type LeadsBeoApprovalDraft = {
  id: string
  isDemo: true
  businessName: string
  city: string
  websiteUrl: string
  extractedEmail: string
  leadScore: number
  scoreReason: string
  serviceFit: BeoServiceFit
  whyHot: string[]
  fromName: string
  fromEmailPlaceholder: string
  toEmail: string
  subject: string
  body: string
  whatsappDemoUrl: string
}

export const LEADS_BEO_DAILY_TARGET = 10
export const LEADS_BEO_READY_BY = '10:00'
export const LEADS_BEO_SEND_WINDOW = 'א׳–ה׳ · 09:00–17:00 (אחרי אישור ב-OS)'

/** דגל מקומי: כבוי = empty state אמיתי בלי דמו. */
export const LEADS_BEO_DEMO_ENABLED = true

export const LEADS_BEO_DEMO_PIPELINE: LeadsBeoPipelineRow[] = [
  {
    id: 'demo-pipe-1',
    isDemo: true,
    businessName: 'נווה קליניק',
    websiteUrl: 'https://example.com/neve-clinic',
    email: 'info@neve-clinic.example',
    score: 86,
    status: 'awaiting_approval',
  },
  {
    id: 'demo-pipe-2',
    isDemo: true,
    businessName: 'אורבניקס שיווק',
    websiteUrl: 'https://example.com/urbanix',
    email: 'hello@urbanix.example',
    score: 78,
    status: 'awaiting_approval',
  },
  {
    id: 'demo-pipe-2b',
    isDemo: true,
    businessName: 'פינטוס פיננסים',
    websiteUrl: 'https://example.com/pintus-finance',
    email: 'office@pintus-finance.example',
    score: 82,
    status: 'awaiting_approval',
  },
  {
    id: 'demo-pipe-3',
    isDemo: true,
    businessName: 'סטודיו פיקסל',
    websiteUrl: 'https://example.com/pixel-studio',
    email: null,
    score: null,
    status: 'skipped_no_email',
  },
  {
    id: 'demo-pipe-4',
    isDemo: true,
    businessName: 'גרין לוגיסטיקה',
    websiteUrl: 'https://example.com/green-logistics',
    email: 'office@green-logistics.example',
    score: 72,
    status: 'draft',
  },
  {
    id: 'demo-pipe-5',
    isDemo: true,
    businessName: 'בייטס קפה',
    websiteUrl: 'https://example.com/beats-cafe',
    email: 'team@beats-cafe.example',
    score: 81,
    status: 'sent',
  },
  {
    id: 'demo-pipe-6',
    isDemo: true,
    businessName: 'מדטק פלוס',
    websiteUrl: 'https://example.com/medtech-plus',
    email: 'contact@medtech-plus.example',
    score: 90,
    status: 'replied_lead',
  },
  {
    id: 'demo-pipe-7',
    isDemo: true,
    businessName: 'חוף נדל״ן',
    websiteUrl: 'https://example.com/hof-nadlan',
    email: 'sales@hof-nadlan.example',
    score: 64,
    status: 'no_reply_closed',
  },
  {
    id: 'demo-pipe-8',
    isDemo: true,
    businessName: 'קליק דיגיטל',
    websiteUrl: 'https://example.com/click-digital',
    email: 'info@click-digital.example',
    score: 70,
    status: 'found',
  },
]

export const LEADS_BEO_DEMO_APPROVALS: LeadsBeoApprovalDraft[] = [
  {
    id: 'demo-appr-1',
    isDemo: true,
    businessName: 'נווה קליניק',
    city: 'תל אביב / ישראל',
    websiteUrl: 'https://example.com/neve-clinic',
    extractedEmail: 'info@neve-clinic.example',
    leadScore: 86,
    scoreReason: 'אתר פעיל, טופס יצירת קשר, ושירותים שמתאימים לאוטומציה ו-CRM.',
    serviceFit: 'CRM/מערכת',
    whyHot: [
      'מרפאה עם כמה סניפים — תיאום תורים ידני נראה עמוס.',
      'יש דף «צור קשר» עם מייל גלוי — אפשר פנייה ישירה.',
      'מציגים צמיחה ומחפשים נוכחות דיגיטלית מסודרת.',
    ],
    fromName: 'שי | Beo Systems',
    fromEmailPlaceholder: 'הכתובת תופיע כשהתיבה תחובר',
    toEmail: 'info@neve-clinic.example',
    subject: 'רעיון קצר לשיפור תיאום התורים בנווה קליניק',
    body: `שלום צוות נווה קליניק,

ראיתי את האתר ואת דפי השירות — נראה שאתם מנהלים הרבה פניות ותורים במקביל.

ב-Beo Systems אנחנו בונים מערכות CRM ואוטומציה שמרכזות פניות, תזכורות ופולו-אפ במקום אחד — בלי לרדוף אחרי וואטסאפים.

אם זה רלוונטי, אשמח לשלוח דוגמה קצרה איך זה יכול להיראות אצלכם.

בברכה,
שי`,
    whatsappDemoUrl: 'https://wa.me/972500000000?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%20%D7%A8%D7%90%D7%99%D7%AA%D7%99%20%D7%90%D7%AA%20%D7%A0%D7%95%D7%95%D7%94%20%D7%A7%D7%9C%D7%99%D7%A0%D7%99%D7%A7',
  },
  {
    id: 'demo-appr-2',
    isDemo: true,
    businessName: 'אורבניקס שיווק',
    city: 'חיפה / ישראל',
    websiteUrl: 'https://example.com/urbanix',
    extractedEmail: 'hello@urbanix.example',
    leadScore: 78,
    scoreReason: 'סוכנות דיגיטל עם לקוחות B2B — מתאים לסוכן AI ותהליכי לידים.',
    serviceFit: 'סוכן AI',
    whyHot: [
      'מפרסמים שירותי לידים אבל התהליך הפנימי נראה ידני.',
      'מייל גלוי באתר — עומד בכלל «רק מייל מהאתר».',
    ],
    fromName: 'שי | Beo Systems',
    fromEmailPlaceholder: 'הכתובת תופיע כשהתיבה תחובר',
    toEmail: 'hello@urbanix.example',
    subject: 'סוכן AI שיכול לסנן לידים עבור אורבניקס',
    body: `היי אורבניקס,

עברתי על האתר — נראה שאתם מביאים לידים ללקוחות, ואולי גם מתמודדים עם סינון ידני של פניות.

אנחנו ב-Beo בונים סוכני AI שממיינים פניות, מכינים טיוטות ומעבירים רק את החמים לאישור אנושי.

אשמח לבדוק אם זה מתחבר לאופן העבודה אצלכם.

שי | Beo Systems`,
    whatsappDemoUrl: 'https://wa.me/972500000001?text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%90%D7%95%D7%A8%D7%91%D7%A0%D7%99%D7%A7%D7%A1',
  },
  {
    id: 'demo-appr-3',
    isDemo: true,
    businessName: 'פינטוס פיננסים',
    city: 'רמת גן / ישראל',
    websiteUrl: 'https://example.com/pintus-finance',
    extractedEmail: 'office@pintus-finance.example',
    leadScore: 82,
    scoreReason: 'עסק שירותי עם הרבה שאלות חוזרות — מתאים לצ׳אטבוט/אוטומציה.',
    serviceFit: 'צ׳אטבוט/אוטומציה',
    whyHot: [
      'שאלות FAQ חוזרות בדף הבית — מועמד טוב לבוט.',
      'יש מייל office גלוי; אין צורך באיתור חיצוני.',
      'קהל יעד ישראלי ברור.',
    ],
    fromName: 'שי | Beo Systems',
    fromEmailPlaceholder: 'הכתובת תופיע כשהתיבה תחובר',
    toEmail: 'office@pintus-finance.example',
    subject: 'צ׳אטבוט שיחסוך מענה חוזר אצל פינטוס',
    body: `שלום,

שמתי לב שבאתר יש הרבה שאלות נפוצות סביב תהליכים ושירותים.

ב-Beo Systems אנחנו מטמיעים צ׳אטבוטים ואוטומציות בעברית שמסננים פניות ומעבירים רק את מה שדורש אדם.

אם תרצו, אשלח דוגמה קצרה לתסריט שיחה שמתאים לתחום שלכם.

בברכה,
שי`,
    whatsappDemoUrl: 'https://wa.me/972500000002',
  },
]
