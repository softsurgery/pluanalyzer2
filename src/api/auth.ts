import type { LoginInput } from '@/types/auth'
import { apiFetch } from './client'

export async function loginUser(input: LoginInput): Promise<unknown> {
  return apiFetch('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function logoutUser(): Promise<unknown> {
  return apiFetch('/api/users/logout', { method: 'POST' })
}
