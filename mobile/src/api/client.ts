/** A SwarmUI API failure, carrying the server's own message. */
export class ApiError extends Error {
  errorId?: string
  constructor(message: string, errorId?: string) {
    super(message)
    this.errorId = errorId
  }
}

let sessionPromise: Promise<string> | null = null
/** The user id SwarmUI assigned to this session. Image URLs are namespaced by it. */
let userId = 'local'

/** Asks SwarmUI for a new session. Every other API call needs its id. */
async function requestSession(): Promise<string> {
  const res = await fetch('/API/GetNewSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) {
    throw new ApiError(`SwarmUI is not reachable (HTTP ${res.status})`)
  }
  const data = await res.json()
  if (!data.session_id) {
    throw new ApiError(data.error || 'SwarmUI did not return a session')
  }
  userId = data.user_id || userId
  return data.session_id
}

/** URL for an image from the user's history. `src` is the path ListImages returned. `preview` asks for a small thumbnail. */
export function historyImageUrl(src: string, preview = false): string {
  const encoded = src.split('/').map(encodeURIComponent).join('/')
  return `/View/${encodeURIComponent(userId)}/${encoded}${preview ? '?preview=true' : ''}`
}

/** Returns the current session id, creating one on first use. Pass `fresh` to replace an expired session. */
export function getSession(fresh = false): Promise<string> {
  if (!sessionPromise || fresh) {
    sessionPromise = requestSession().catch((err) => {
      sessionPromise = null
      throw err
    })
  }
  return sessionPromise
}

/** Calls a SwarmUI HTTP API route. Retries once with a new session if the old one expired (e.g. server restart). */
export async function api<T>(route: string, body: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session_id = await getSession(attempt > 0)
    const res = await fetch(`/API/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id, ...body }),
    })
    if (!res.ok) {
      throw new ApiError(`${route} failed (HTTP ${res.status})`)
    }
    const data = await res.json()
    if (data.error_id == 'invalid_session_id' && attempt == 0) {
      continue
    }
    if (data.error) {
      throw new ApiError(data.error, data.error_id)
    }
    return data as T
  }
  throw new ApiError('Could not get a valid SwarmUI session')
}

/** Turns a path returned by the API (e.g. `View/local/raw/x.png`) into a URL the browser can load. */
export function serverUrl(path: string): string {
  if (path.startsWith('data:') || path.startsWith('http') || path.startsWith('/')) {
    return path
  }
  return `/${path}`
}
