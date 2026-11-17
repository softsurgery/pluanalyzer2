export interface HttpFetchOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: HttpFetchOptions = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000)

  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': 'PLU-Analyzer-Platform/1.0 (PayloadCMS)',
        Accept: 'application/json',
        ...options.headers,
      },
      body: options.body,
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
      }
    }

    const data = (await res.json()) as T
    return { ok: true, status: res.status, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error'
    return { ok: false, status: 0, error: message }
  } finally {
    clearTimeout(timeout)
  }
}
