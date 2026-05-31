export interface Session {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  revokedAt?: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
}
