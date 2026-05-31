export interface EmailVerificationCode {
  id: string
  email: string
  codeHash: string
  purpose: 'login' | 'register'
  expiresAt: string
  usedAt?: string
  attemptCount: number
  maxAttempts: number
  ipAddress?: string
  userAgent?: string
  createdAt: string
}
