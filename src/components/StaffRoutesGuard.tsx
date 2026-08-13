import { Outlet } from 'react-router-dom'

/** שמירה על מבנה הראוטים — פורטל סוכני מכירות הוסר מ-Beo OS. */
export function StaffRoutesGuard() {
  return <Outlet />
}
