import { create } from 'zustand'
import { cancelBatch, dismissBatch, isActive, listBatches, startBatch, type BatchJob } from '@/api/batch'
import { useProfiles } from '@/profiles-store'
import { buildParams, useStore } from '@/store'

/** How often to ask the server for progress while a batch is active and the app is on screen. */
const POLL_MS = 3000
/** Browser storage key for what this device knows about batches it started. */
const MEMORY_KEY = 'swarm-mobile-batches'

/**
 * What this device remembers between visits. Batches live only in the server's memory, so if the server restarts they vanish;
 * remembering the last one we saw running lets the app say so instead of silently showing nothing.
 */
type Memory = {
  /** The batch last seen queued or running, with how far it had got. */
  watching: { id: string; profile: string; done: number; total: number } | null
}

/** Reads the remembered batch details, tolerating missing or damaged storage. */
function readMemory(): Memory {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}')
    return { watching: parsed.watching || null }
  }
  catch {
    return { watching: null }
  }
}

/** Saves the remembered batch details. */
function writeMemory(memory: Memory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory))
  }
  catch {
    // Storage can be full or blocked; the app works without this memory, it just cannot report a server restart.
  }
}

type BatchState = {
  jobs: BatchJob[]
  /** False when the server has no BatchJobs extension. */
  supported: boolean
  /** A one-off message to show, e.g. that the server restarted mid-batch. */
  notice: string | null
  /** Refreshes the list from the server and keeps polling while anything is active. */
  load: () => Promise<void>
  /** Starts a batch of `count` images with the current Generate settings. Throws with the server's message if refused. */
  start: (count: number) => Promise<void>
  cancel: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
  dismissNotice: () => void
}

let pollTimer: ReturnType<typeof setTimeout> | undefined

export const useBatches = create<BatchState>()((set, get) => ({
  jobs: [],
  supported: true,
  notice: null,

  load: async () => {
    clearTimeout(pollTimer)
    let jobs: BatchJob[]
    try {
      jobs = await listBatches()
    }
    catch {
      set({ supported: false })
      return
    }
    const profile = useProfiles.getState().current
    const memory = readMemory()
    const active = jobs.find((j) => j.state == 'running') || jobs.find(isActive)
    let notice = get().notice
    if (memory.watching && memory.watching.profile == profile && !jobs.some((j) => j.id == memory.watching!.id)) {
      // The server no longer knows a batch we saw running, and we did not dismiss it: it was lost to a restart.
      notice = `A batch stopped because the server restarted. ${memory.watching.done} of ${memory.watching.total} images had been made.`
      memory.watching = null
    }
    if (active) {
      memory.watching = { id: active.id, profile, done: active.done, total: active.total }
    }
    else if (memory.watching && memory.watching.profile == profile) {
      memory.watching = null
    }
    writeMemory(memory)
    set({ jobs, supported: true, notice })
    if (active && document.visibilityState == 'visible') {
      pollTimer = setTimeout(() => get().load(), POLL_MS)
    }
  },

  start: async (count) => {
    await startBatch(count, buildParams(useStore.getState(), { save: true }))
    await get().load()
  },

  cancel: async (id) => {
    await cancelBatch(id)
    await get().load()
  },

  dismiss: async (id) => {
    const memory = readMemory()
    if (memory.watching?.id == id) {
      memory.watching = null
      writeMemory(memory)
    }
    await dismissBatch(id)
    await get().load()
  },

  dismissNotice: () => set({ notice: null }),
}))

// Catch up as soon as the app comes back to the foreground, e.g. after the phone was locked.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState == 'visible' && useBatches.getState().supported) {
    useBatches.getState().load()
  }
})
