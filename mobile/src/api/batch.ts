import { api } from './client'

/** A background batch as reported by the server's BatchJobList route. */
export type BatchJob = {
  id: string
  state: 'queued' | 'running' | 'finished' | 'cancelled' | 'failed'
  /** How many images were asked for. */
  total: number
  /** How many have been generated and saved. */
  done: number
  failed: number
  /** Start of the prompt, for display. */
  prompt: string
  /** The whole prompt as it was written. */
  full_prompt: string
  /** Top-level output folder the batch saves into, or an empty string if it is not a fixed one. */
  folder: string
  model: string
  /** Unix times in seconds; zero when not reached yet. */
  created: number
  started: number
  ended: number
  /** Server paths of the newest images, newest first. */
  recent_images: string[]
  error: string | null
  /** Progress of the image being generated now, 0 to 1. */
  current_progress: number
}

/** Whether a batch is still waiting or working. */
export function isActive(job: BatchJob): boolean {
  return job.state == 'queued' || job.state == 'running'
}

/**
 * Starts a batch of `count` images on the server. `params` are normal generation parameters.
 * The server makes one image per request with a new random seed each, whatever `images` or `seed` say.
 * Resolves to the new batch's ID.
 */
export async function startBatch(count: number, params: Record<string, unknown>): Promise<string> {
  const data = await api<{ id: string }>('BatchJobStart', { ...params, count })
  return data.id
}

/** Lists this profile's batches: queued, running, and recently ended. */
export async function listBatches(): Promise<BatchJob[]> {
  const data = await api<{ jobs: BatchJob[] }>('BatchJobList')
  return data.jobs || []
}

/** Cancels a queued or running batch. Images already made are kept. */
export function cancelBatch(id: string): Promise<unknown> {
  return api('BatchJobCancel', { id })
}

/** Removes an ended batch from the list. */
export function dismissBatch(id: string): Promise<unknown> {
  return api('BatchJobDismiss', { id })
}
