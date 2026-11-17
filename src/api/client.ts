export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      data?.error ||
      data?.errors?.[0]?.message ||
      data?.message ||
      `Erreur HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}
