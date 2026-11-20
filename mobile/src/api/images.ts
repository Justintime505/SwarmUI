import { api } from './client'

/** One saved image as returned by SwarmUI's ListImages route. */
export type HistoryImage = {
  /** Path inside the user's output folder, e.g. `raw/2026-11-19/123-a cat.png`. */
  src: string
  /** Generation settings as a JSON string. Not guaranteed to be present or valid. */
  metadata: string | null
}

type ListImagesResponse = { folders: string[]; files: HistoryImage[] }

/** Lists saved images under a folder (empty string for everything), newest first, with the subfolders found. */
export async function listImages(path: string): Promise<ListImagesResponse> {
  const data = await api<ListImagesResponse>('ListImages', { path, depth: 6, sortBy: 'Date', sortReverse: false })
  // The API returns paths relative to the folder asked for; make them relative to the output root again.
  const prefix = path ? `${path}/` : ''
  return {
    folders: (data.folders || []).map((f) => prefix + f),
    files: (data.files || []).map((f) => ({ ...f, src: prefix + f.src })),
  }
}

/** Deletes a saved image. */
export function deleteImage(src: string): Promise<unknown> {
  return api('DeleteImage', { path: src })
}

/** Stars or un-stars a saved image. SwarmUI moves starred images into a `Starred/` folder. */
export function toggleStar(src: string): Promise<unknown> {
  return api('ToggleImageStarred', { path: src })
}

/** Whether a saved image is starred. */
export function isStarred(src: string): boolean {
  return src.startsWith('Starred/')
}

/** The top-level folder of an image path, or an empty string for the root. */
export function topFolder(src: string): string {
  const idx = src.indexOf('/')
  return idx < 0 ? '' : src.slice(0, idx)
}

/** The generation settings stored with an image, or null if there are none. */
export function parseParams(metadata: string | null): Record<string, unknown> | null {
  if (!metadata) {
    return null
  }
  try {
    const parsed = JSON.parse(metadata)
    return parsed && typeof parsed.sui_image_params == 'object' ? parsed.sui_image_params : null
  }
  catch {
    return null
  }
}

/** The day an image was made, as `YYYY-MM-DD`, read from its path or its metadata. Empty if unknown. */
export function imageDay(image: HistoryImage): string {
  // Both the default layout (raw/2026-11-19/...) and the app's folder layout (Folder/2026-11-19-...) carry the date in the path.
  const inPath = image.src.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (inPath) {
    return inPath[0]
  }
  try {
    const date = JSON.parse(image.metadata || '{}').sui_extra_data?.date
    return typeof date == 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : ''
  }
  catch {
    return ''
  }
}

/** A friendly heading for a `YYYY-MM-DD` day: Today, Yesterday, or a short date. */
export function dayLabel(day: string): string {
  if (!day) {
    return 'Undated'
  }
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysAgo = Math.round((today.getTime() - date.getTime()) / 86400000)
  if (daysAgo == 0) {
    return 'Today'
  }
  if (daysAgo == 1) {
    return 'Yesterday'
  }
  return date.toLocaleDateString(undefined, { weekday: daysAgo < 7 ? 'long' : undefined, day: 'numeric', month: 'short', year: y == today.getFullYear() ? undefined : 'numeric' })
}
