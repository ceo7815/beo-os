import { formatFirebaseErrorDetail } from './formatFirebaseError'
import { useHubStore } from '../store/useStore'

export function toastFsError(messageHe: string, err: unknown, logLabel?: string) {
  console.error(logLabel ?? messageHe, err)
  const detail = formatFirebaseErrorDetail(err)
  const message =
    detail.trim() === '' ? messageHe : `${messageHe}\n${detail}`
  useHubStore.getState().pushToast(message, 'error')
}

export function toastFsSuccess(message: string) {
  useHubStore.getState().pushToast(message, 'success')
}
