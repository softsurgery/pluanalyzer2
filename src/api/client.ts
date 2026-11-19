import axios from 'axios'

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const out: Record<string, string> = {}
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers as Record<string, string>
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await axios.request<T & { error?: string; errors?: Array<{ message?: string }>; message?: string }>({
    url,
    method: init?.method ?? 'GET',
    headers: normalizeHeaders(init?.headers),
    data: init?.body,
    signal: init?.signal ?? undefined,
    validateStatus: () => true,
  })

  const data = res.data ?? ({} as T & { error?: string; errors?: Array<{ message?: string }>; message?: string })
  if (res.status < 200 || res.status >= 300) {
    const message =
      data?.error ||
      data?.errors?.[0]?.message ||
      data?.message ||
      `Erreur HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}
