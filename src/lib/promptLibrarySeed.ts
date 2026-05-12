import type { PromptLibraryEntry } from '../types/promptLibrary'
import { extractPromptVariables } from './extractPromptVariables'

function seed(
  partial: Omit<PromptLibraryEntry, 'id' | 'variables'>,
  id: string,
): PromptLibraryEntry {
  return {
    ...partial,
    id,
    variables: extractPromptVariables(partial.content),
  }
}

/** דוגמאות ראשוניות כשאין עדיין נתונים ב-localStorage */
export function defaultPromptLibrarySeed(): PromptLibraryEntry[] {
  return [
    seed(
      {
        title: 'פוסט לינקדאין לשירות חדש',
        category: 'שיווק',
        targetModel: 'gpt-5-5',
        content:
          'כתוב פוסט לינקדאין בעברית, טון מקצועי וחמים, עד 180 מילים. השירות: {{שם_השירות}}. קהל יעד: {{קהל_יעד}}. כלול קריאה לפעולה אחת.',
      },
      'seed-1',
    ),
    seed(
      {
        title: 'סיכום Pull Request',
        category: 'פיתוח',
        targetModel: 'claude-sonnet-opus',
        content:
          'סכם את ה-PR הבא בנקודות: מה השתנה, סיכונים, בדיקות מומלצות.\n\n```\n{{קוד_או_תיאור}}\n```',
      },
      'seed-2',
    ),
    seed(
      {
        title: 'תמונת Hero לאתר',
        category: 'שיווק',
        targetModel: 'midjourney',
        content:
          '/imagine {{תיאור_חזותי}} --ar 16:9 --style raw, מינימליסטי, תאורה רכה',
      },
      'seed-3',
    ),
  ]
}
