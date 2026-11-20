import { create } from 'zustand'
import { listImages, type HistoryImage } from '@/api/images'

/** Top-level output folders SwarmUI or ComfyUI manage themselves; not offered as places to save into. */
const SYSTEM_FOLDERS = ['raw', 'Starred', 'inputs']

/** Whether a top-level folder is one the user made (as opposed to a system one). */
export function isUserFolder(name: string): boolean {
  return name != '' && !name.startsWith('_') && !SYSTEM_FOLDERS.includes(name)
}

/** Makes typed text safe to use as a single folder name. */
export function cleanFolderName(text: string): string {
  return text
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

type GalleryState = {
  /** Folder being shown: empty string for every folder, otherwise a top-level folder name. */
  folder: string
  /** When true, only starred images (within `folder`) are shown. */
  starredOnly: boolean
  /** The server path the current view lists, derived from `folder` and `starredOnly`. */
  path: string
  images: HistoryImage[]
  /** Top-level folders that exist on the server. */
  serverFolders: string[]
  /**
   * Original paths of starred images. SwarmUI stars an image by copying it into `Starred/`, leaving the original in place,
   * so an image seen in its own folder is starred when its path is in this set.
   */
  starred: Set<string>
  /** Image count and newest image for each top-level folder, from the last full listing. */
  folderInfo: Record<string, FolderInfo>
  loading: boolean
  error: string | null
  /** Loads the current view, or switches to another one first. Also refreshes the folder list. */
  load: (view?: { folder?: string; starredOnly?: boolean }) => Promise<void>
  /** Refreshes only the list of folders (used by the folder picker). */
  loadFolders: () => Promise<void>
}

/** Unique top-level names from a list of folder paths. */
function topLevel(folders: string[]): string[] {
  return [...new Set(folders.map((f) => f.split('/')[0]))].sort((a, b) => a.localeCompare(b))
}

export type FolderInfo = { count: number; cover: string }

/** Counts the images in each top-level folder and notes the newest one as its cover. `files` must be newest first. */
function summarise(files: HistoryImage[]): Record<string, FolderInfo> {
  const result: Record<string, FolderInfo> = {}
  for (const file of files) {
    // A starred image is listed under Starred/<original path>; count it for its original folder.
    const original = file.src.startsWith('Starred/') ? file.src.slice('Starred/'.length) : file.src
    const folder = original.split('/')[0]
    if (!original.includes('/') || folder.startsWith('_') || folder == 'inputs') {
      continue
    }
    if (!result[folder]) {
      result[folder] = { count: 0, cover: file.src }
    }
    result[folder].count++
  }
  return result
}

/** The original (un-prefixed) paths of every starred image in a listing. */
function starredOriginals(files: HistoryImage[]): Set<string> {
  const result = new Set<string>()
  for (const file of files) {
    if (file.src.startsWith('Starred/')) {
      result.add(file.src.slice('Starred/'.length))
    }
  }
  return result
}

export const useGallery = create<GalleryState>()((set, get) => ({
  folder: '',
  starredOnly: false,
  path: '',
  images: [],
  serverFolders: [],
  starred: new Set(),
  folderInfo: {},
  loading: false,
  error: null,
  load: async (view) => {
    const folder = view?.folder ?? get().folder
    const starredOnly = view?.starredOnly ?? get().starredOnly
    // SwarmUI keeps starred copies under Starred/<original path>, so starred-in-a-folder is a listing of Starred/<folder>.
    const target = starredOnly ? (folder ? `Starred/${folder}` : 'Starred') : folder
    set({ loading: true, error: null, folder, starredOnly, path: target })
    try {
      const data = await listImages(target)
      // Ignore the answer if the user switched folder while this was loading.
      if (get().path != target) {
        return
      }
      // ComfyUI's own input and temp folders are not generated images.
      const images = data.files.filter((f) => !f.src.startsWith('inputs/') && !f.src.startsWith('_'))
      set({ images, loading: false })
      if (target == '') {
        set({ serverFolders: topLevel(data.folders), starred: starredOriginals(data.files), folderInfo: summarise(data.files) })
      }
      else {
        get().loadFolders()
      }
    }
    catch (err) {
      if (get().path == target) {
        set({ loading: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
  },
  loadFolders: async () => {
    try {
      const data = await listImages('')
      set({ serverFolders: topLevel(data.folders), starred: starredOriginals(data.files), folderInfo: summarise(data.files) })
    }
    catch {
      // The folder list is a convenience; the picker still works with the folders already known.
    }
  },
}))
