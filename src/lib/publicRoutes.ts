/** מסלולים שנגישים בלי התחברות */
export function isPublicAppPath(pathname: string): boolean {
  if (pathname === '/login') return true
  if (pathname.startsWith('/share/hours/')) return true
  return false
}
