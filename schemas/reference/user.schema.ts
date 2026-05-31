export interface User {
  id: string
  email: string
  name?: string
  avatarUrl?: string
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}
