import axios from 'axios'

export interface HttpFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: HttpFetchOptions = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await axios.request<string>({
      url,
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': 'PLU-Analyzer-Platform/1.0 (PayloadCMS)',
        Accept: 'application/json',
        'Cache-Control': 'no-store',
        ...options.headers,
      },
      data: options.body,
      timeout: options.timeoutMs ?? 12000,
      responseType: 'text',
      transformResponse: [(data) => data],
      validateStatus: () => true,
    })

    const rawText = typeof res.data === 'string' ? res.data : ''

    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${rawText.slice(0, 300)}`,
      }
    }

    const data = JSON.parse(rawText) as T
    return { ok: true, status: res.status, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error'
    return { ok: false, status: 0, error: message }
  }
}
