/**
 * Every provider hits an external HTTP API, so timeout/retry/error-parsing
 * behavior lives here once instead of being copy-pasted per provider.
 *
 * Design notes (why this exists):
 * - A hung connection should never hang the whole "ask" flow forever, so
 *   every attempt is bounded by an AbortController timeout.
 * - Upstream gateways (OpenRouter routing to a third-party model, etc.) can
 *   return transient 502/503/504/429s or drop the connection outright
 *   (ECONNRESET). Those are retried with a short backoff instead of
 *   surfacing immediately as a hard failure.
 * - Error bodies are JSON like {"error":{"message": "..."}} far more often
 *   than not (OpenAI-compatible APIs, Anthropic, Google all do this) — we
 *   extract just the human-readable message instead of dumping raw JSON at
 *   the user.
 */

export interface FetchWithRetryOptions {
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
  signal?: AbortSignal
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchWithRetryOptions = {}
): Promise<Response> {
  const { timeoutMs = 45_000, retries = 2, retryDelayMs = 700 } = opts
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    opts.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', abort)

      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await delay(retryDelayMs * (attempt + 1))
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', abort)
      lastError = err
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (opts.signal?.aborted) throw err
      if (attempt < retries) {
        await delay(retryDelayMs * (attempt + 1))
        continue
      }
      if (isAbort) {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s`)
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed')
}

/** Pulls a clean, human-readable message out of a non-OK response body. */
export async function extractErrorMessage(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '')
  try {
    const json = JSON.parse(raw)
    const msg = json?.error?.message ?? json?.message ?? json?.error
    if (msg && typeof msg === 'string') return msg.slice(0, 500)
  } catch {
    // not JSON — fall through to raw text
  }
  return (raw || res.statusText || `HTTP ${res.status}`).slice(0, 300)
}
