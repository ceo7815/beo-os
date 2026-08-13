export type AppUser = {
  uid: string
  email: string | null
  displayName: string | null
  getIdToken: () => Promise<string>
}
