import type { LoginInput, UpdateProfileInput } from '@/types/auth'
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

export async function updateUserProfile(
  userId: string | number,
  input: UpdateProfileInput,
): Promise<unknown> {
  return apiFetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
