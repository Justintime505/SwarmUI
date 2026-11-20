import { create } from 'zustand'
import { listCheckpoints, listLoras, type SwarmModel } from '@/api/models'
import { useStore } from '@/store'

type ModelsState = {
  checkpoints: SwarmModel[]
  loras: SwarmModel[]
  loading: boolean
  error: string | null
  /** Fetches the model and LoRA lists from SwarmUI. */
  load: () => Promise<void>
}

export const useModels = create<ModelsState>()((set) => ({
  checkpoints: [],
  loras: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null })
    try {
      const [checkpoints, loras] = await Promise.all([listCheckpoints(), listLoras()])
      set({ checkpoints, loras, loading: false })
      // Make sure a usable model is selected: keep the saved one if it still exists, otherwise take the first.
      const settings = useStore.getState()
      if (checkpoints.length > 0 && !checkpoints.some((m) => m.name == settings.model)) {
        settings.selectModel(checkpoints[0])
      }
      // Drop saved LoRAs that no longer exist on the server.
      const valid = settings.loras.filter((l) => loras.some((m) => m.name == l.name))
      if (valid.length != settings.loras.length) {
        settings.set({ loras: valid })
      }
    }
    catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
