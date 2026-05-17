export type TasksBoardViewMode = 'kanban' | 'table'

const STORAGE_KEY = 'hub-pos-tasks-board-view'

export function loadTasksBoardViewMode(): TasksBoardViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'table') return 'table'
  } catch {
    /* ignore */
  }
  return 'kanban'
}

export function saveTasksBoardViewMode(mode: TasksBoardViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}
