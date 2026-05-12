/** מזהה מיוחד — מגירת משימה חדשה לפני שמירה ראשונה ב-Firestore */
export const NEW_TASK_DRAWER_ID = '__hub_new_task__' as const

export type NewTaskDraftSeed = {
  assigneeId: string
  dueDate: string
  /** מילוי מראש כשפותחים משימה מתוך פרויקט / לקוח */
  clientId?: string
  projectId?: string
  supplierId?: string
}
