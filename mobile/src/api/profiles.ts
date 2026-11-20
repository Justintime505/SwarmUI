import { api } from './client'

/** A profile: an account with its own image library that shares everything else. */
export type Profile = { id: string; has_pin: boolean }

/** Lists the server's profiles and which one this browser is using (empty string = the shared library). */
export function listProfiles(): Promise<{ profiles: Profile[]; current: string }> {
  return api('ProfileList')
}

/** Creates a profile. `pin` is 4 to 8 digits, or empty for none. Resolves to the cleaned ID the server gave it. */
export async function createProfile(name: string, pin: string): Promise<string> {
  const data = await api<{ id: string }>('ProfileCreate', { name, pin })
  return data.id
}

/**
 * Switches this browser to a profile, or back to the shared library when `id` is empty.
 * The server sets a cookie; reload the app afterwards so every request uses the new library.
 */
export function switchProfile(id: string, pin: string): Promise<unknown> {
  return api('ProfileSwitch', { id, pin })
}

/** Changes a profile's PIN, or removes it when `newPin` is empty. */
export function setProfilePin(id: string, pin: string, newPin: string): Promise<unknown> {
  return api('ProfileSetPin', { id, pin, new_pin: newPin })
}

/** Deletes a profile. Its image files stay on the server's disk. */
export function deleteProfile(id: string, pin: string): Promise<unknown> {
  return api('ProfileDelete', { id, pin })
}
