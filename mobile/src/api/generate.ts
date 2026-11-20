import { getSession } from './client'

/** Queue and backend counts SwarmUI pushes while a generation is active. */
export type GenStatus = {
  waiting_gens: number
  loading_models: number
  waiting_backends: number
  live_gens: number
}

export type GenHandlers = {
  /** Queue state changed (queued, loading model, running). */
  onStatus?: (status: GenStatus) => void
  /** Progress for one image of the batch. `percent` is 0 to 1. `preview` is a data URL when the backend sent one. */
  onProgress?: (batchIndex: number, percent: number, preview?: string) => void
  /** One image finished. `image` is a server path or a data URL. */
  onImage?: (image: string, metadata: string | null, batchIndex: number) => void
  onError?: (message: string) => void
  /** The whole request is finished (also called after an error or a cancel). */
  onDone?: () => void
}

/**
 * Starts a generation over SwarmUI's GenerateText2ImageWS socket.
 * `params` holds `images` plus T2I parameters (prompt, model, steps, ...) at the top level.
 * Returns a function that closes the socket.
 */
export function startGeneration(params: Record<string, unknown>, handlers: GenHandlers): () => void {
  let socket: WebSocket | null = null
  let closedByCaller = false
  let finished = false
  /** Reports the end of the request exactly once. */
  const finish = () => {
    if (!finished) {
      finished = true
      handlers.onDone?.()
    }
  }
  /** Opens the socket and sends the request. `retry` is true on the second attempt after a session refresh. */
  const run = async (retry: boolean) => {
    let session_id: string
    try {
      session_id = await getSession(retry)
    }
    catch (err) {
      handlers.onError?.(err instanceof Error ? err.message : String(err))
      finish()
      return
    }
    if (closedByCaller) {
      finish()
      return
    }
    const protocol = location.protocol == 'https:' ? 'wss' : 'ws'
    let retrying = false
    socket = new WebSocket(`${protocol}://${location.host}/API/GenerateText2ImageWS`)
    socket.onopen = () => socket!.send(JSON.stringify({ session_id, ...params }))
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.error_id == 'invalid_session_id' && !retry) {
        retrying = true
        socket!.close()
        run(true)
        return
      }
      if (msg.error) {
        handlers.onError?.(String(msg.error))
      }
      if (msg.status) {
        handlers.onStatus?.(msg.status)
      }
      if (msg.gen_progress) {
        const p = msg.gen_progress
        // current_percent follows the sampling steps, which is what the preview shows. overall_percent counts workflow nodes and runs far ahead of it.
        const current = Number(p.current_percent) || 0
        const percent = current > 0 ? current : Number(p.overall_percent) >= 1 ? 1 : 0
        handlers.onProgress?.(Number(p.batch_index) || 0, percent, p.preview || undefined)
      }
      if (typeof msg.image == 'string') {
        handlers.onImage?.(msg.image, typeof msg.metadata == 'string' ? msg.metadata : null, Number(msg.batch_index) || 0)
      }
    }
    socket.onerror = () => {
      if (!closedByCaller && !retrying) {
        handlers.onError?.('Lost connection to SwarmUI')
      }
    }
    socket.onclose = () => {
      if (!retrying) {
        finish()
      }
    }
  }
  run(false)
  return () => {
    closedByCaller = true
    socket?.close()
    // Do not wait for the server's close handshake, which can take seconds while the backend is busy.
    finish()
  }
}
