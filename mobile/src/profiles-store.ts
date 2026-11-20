import { create } from 'zustand'
import { listProfiles, type Profile } from '@/api/profiles'
import { useStore } from '@/store'

type ProfilesState = {
  profiles: Profile[]
  /** ID of the profile this browser is using, or an empty string for the shared library. */
  current: string
  /** False until the first load finishes. */
  loaded: boolean
  /** False when the server has no Profiles extension (e.g. an unmodified SwarmUI). */
  supported: boolean
  load: () => Promise<void>
}

export const useProfiles = create<ProfilesState>()((set) => ({
  profiles: [],
  current: '',
  loaded: false,
  supported: true,
  load: async () => {
    try {
      const data = await listProfiles()
      set({ profiles: data.profiles, current: data.current, loaded: true, supported: true })
      // Folder choices belong to a library, so swap in the ones remembered for this profile.
      useStore.getState().applyProfileFolders(data.current)
    }
    catch {
      set({ loaded: true, supported: false })
    }
  },
}))
