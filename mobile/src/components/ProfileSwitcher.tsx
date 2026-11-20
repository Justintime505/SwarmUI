import { ArrowLeft, Check, Delete, KeyRound, Lock, LockOpen, Plus, Trash2, UserRound, Users } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/api/client'
import { createProfile, deleteProfile, setProfilePin, switchProfile, type Profile } from '@/api/profiles'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useProfiles } from '@/profiles-store'

/** Longest PIN the server accepts. */
const MAX_PIN = 8
/** Shortest PIN the server accepts. */
const MIN_PIN = 4

/** Which part of the sheet is showing. */
type View = { name: 'list' } | { name: 'unlock'; profile: Profile } | { name: 'new' } | { name: 'manage' }

/** Turns any thrown value into a message for the user. */
function messageOf(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : String(err)
}

/** Reloads the app so the session, gallery and results all restart inside the newly selected profile. */
function restartApp() {
  location.hash = ''
  location.reload()
}

/** Dots showing how many PIN digits have been entered. */
function PinDots({ length }: { length: number }) {
  return (
    <div aria-label={`${length} digits entered`} className="flex h-6 items-center justify-center gap-2.5">
      {length == 0 && <span className="text-sm text-muted">Enter PIN</span>}
      {Array.from({ length }, (_, i) => (
        <span key={i} className="size-3 rounded-full bg-fg" />
      ))}
    </div>
  )
}

/** On-screen number pad for entering a PIN. */
function PinPad({ value, onChange, onSubmit, busy }: { value: string; onChange: (value: string) => void; onSubmit: () => void; busy: boolean }) {
  const keyClass = 'flex h-14 items-center justify-center rounded-2xl bg-raised text-xl font-medium select-none active:bg-line disabled:opacity-40'
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button key={digit} type="button" className={keyClass} disabled={busy || value.length >= MAX_PIN} onClick={() => onChange(value + digit)}>
          {digit}
        </button>
      ))}
      <button type="button" aria-label="Delete last digit" className={keyClass} disabled={busy || value.length == 0} onClick={() => onChange(value.slice(0, -1))}>
        <Delete className="size-6" />
      </button>
      <button type="button" className={keyClass} disabled={busy || value.length >= MAX_PIN} onClick={() => onChange(value + '0')}>
        0
      </button>
      <button type="button" aria-label="Open profile" className={cn(keyClass, 'bg-accent text-accent-fg active:bg-accent/85')} disabled={busy || value.length < MIN_PIN} onClick={onSubmit}>
        <Check className="size-6" />
      </button>
    </div>
  )
}

/** Text field for typing a PIN with the phone's number keyboard. Keeps only digits. */
function PinField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, MAX_PIN))}
      className="min-h-11 w-full rounded-xl bg-raised px-3 outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
    />
  )
}

/** Header button showing the active profile, and the sheet for switching, creating and managing profiles. */
export function ProfileSwitcher() {
  const { profiles, current, loaded, supported, load } = useProfiles()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>({ name: 'list' })
  const [pin, setPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Hide the button entirely on a server without the Profiles extension.
  if (!loaded || !supported) {
    return null
  }

  /** Shows a part of the sheet with its inputs cleared. */
  const go = (next: View) => {
    setView(next)
    setPin('')
    setNewPin('')
    setName('')
    setError(null)
    setConfirmDelete(false)
  }

  /** Runs a server action, showing its error in the sheet if it fails. Resolves to whether it succeeded. */
  const attempt = async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await work()
      setBusy(false)
      return true
    }
    catch (err) {
      setError(messageOf(err))
      setBusy(false)
      return false
    }
  }

  /** Switches to a profile (empty ID = shared library) and restarts the app inside it. */
  const openProfile = async (id: string, withPin: string) => {
    if (await attempt(() => switchProfile(id, withPin))) {
      restartApp()
    }
    else {
      setPin('')
    }
  }

  const onPick = (profile: Profile) => {
    if (profile.has_pin) {
      go({ name: 'unlock', profile })
    }
    else {
      openProfile(profile.id, '')
    }
  }

  const onCreate = async () => {
    const ok = await attempt(async () => {
      const id = await createProfile(name, pin)
      await switchProfile(id, pin)
    })
    if (ok) {
      restartApp()
    }
  }

  const onChangePin = async () => {
    if (await attempt(() => setProfilePin(current, pin, newPin))) {
      await load()
      go({ name: 'list' })
    }
  }

  const onDelete = async () => {
    if (await attempt(() => deleteProfile(current, pin))) {
      restartApp()
    }
  }

  const rowClass = (active: boolean) =>
    cn('flex min-h-14 w-full items-center gap-3 rounded-2xl px-3.5 text-left active:bg-line disabled:opacity-60', active ? 'bg-accent/15 ring-1 ring-accent' : 'bg-raised')
  const currentProfile = profiles.find((p) => p.id == current)
  const pinLengthOk = (value: string) => value.length == 0 || value.length >= MIN_PIN
  const title = view.name == 'unlock' ? view.profile.id : view.name == 'new' ? 'New profile' : view.name == 'manage' ? `Manage ${current}` : 'Profiles'

  return (
    <>
      <button
        type="button"
        aria-label={`Profile: ${current || 'Shared'}. Tap to switch.`}
        onClick={() => {
          go({ name: 'list' })
          setOpen(true)
          load()
        }}
        className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold uppercase active:bg-raised', current ? 'bg-accent text-accent-fg' : 'bg-surface')}
      >
        {current ? current.slice(0, 2) : <Users className="size-5.5" />}
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        action={
          view.name != 'list' ? (
            <Button variant="ghost" size="icon" aria-label="Back to profile list" onClick={() => go({ name: 'list' })}>
              <ArrowLeft className="size-5" />
            </Button>
          ) : undefined
        }
      >
        {view.name == 'list' && (
          <>
            <p className="mb-3 text-sm text-muted">Each profile has its own image library. Models and settings are shared.</p>
            <ul className="flex flex-col gap-1.5">
              <li>
                <button type="button" aria-pressed={current == ''} disabled={busy || current == ''} onClick={() => openProfile('', '')} className={rowClass(current == '')}>
                  <Users className="size-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Shared</span>
                    <span className="block text-sm text-muted">Open to everyone, no PIN</span>
                  </span>
                  {current == '' && <Check className="size-5 shrink-0 text-accent" />}
                </button>
              </li>
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <button type="button" aria-pressed={current == profile.id} disabled={busy || current == profile.id} onClick={() => onPick(profile)} className={rowClass(current == profile.id)}>
                    <UserRound className="size-5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate font-medium">{profile.id}</span>
                    {profile.has_pin ? <Lock className="size-4 shrink-0 text-muted" aria-label="Has a PIN" /> : <LockOpen className="size-4 shrink-0 text-muted/50" aria-label="No PIN" />}
                    {current == profile.id && <Check className="size-5 shrink-0 text-accent" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => go({ name: 'new' })}>
                <Plus className="size-5" />
                New profile
              </Button>
              {current && (
                <Button className="flex-1" onClick={() => go({ name: 'manage' })}>
                  <KeyRound className="size-5" />
                  Manage
                </Button>
              )}
            </div>
            {current && (
              <Button className="mt-2 w-full" variant="primary" disabled={busy} onClick={() => openProfile('', '')}>
                <Lock className="size-5" />
                Lock (back to Shared)
              </Button>
            )}
          </>
        )}

        {view.name == 'unlock' && (
          <div className="flex flex-col gap-4 pb-2">
            <PinDots length={pin.length} />
            <PinPad value={pin} onChange={setPin} busy={busy} onSubmit={() => openProfile(view.profile.id, pin)} />
          </div>
        )}

        {view.name == 'new' && (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              onCreate()
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Profile name"
              autoCapitalize="none"
              autoComplete="off"
              className="min-h-11 w-full rounded-xl bg-raised px-3 outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
            />
            <p className="text-sm text-muted">3 or more letters or digits. It is saved in lowercase and becomes the folder name on the server.</p>
            <PinField label="PIN (optional, 4 to 8 digits)" value={pin} onChange={setPin} />
            <p className="text-sm text-muted">Without a PIN, anyone can open this profile.</p>
            <Button type="submit" variant="primary" size="lg" disabled={busy || name.trim().length < 3 || !pinLengthOk(pin)}>
              Create and switch
            </Button>
          </form>
        )}

        {view.name == 'manage' && (
          <div className="flex flex-col gap-2.5">
            {currentProfile?.has_pin && <PinField label="Current PIN" value={pin} onChange={setPin} />}
            <PinField label="New PIN (leave empty for none)" value={newPin} onChange={setNewPin} />
            <Button disabled={busy || !pinLengthOk(newPin) || (!!currentProfile?.has_pin && pin.length < MIN_PIN)} onClick={onChangePin}>
              <KeyRound className="size-5" />
              {newPin ? 'Change PIN' : 'Remove PIN'}
            </Button>
            <hr className="my-1 border-line" />
            {confirmDelete ? (
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
                <Button className="flex-1" variant="danger" disabled={busy} onClick={onDelete}>
                  <Trash2 className="size-5" />
                  Delete profile
                </Button>
              </div>
            ) : (
              <Button variant="danger" disabled={busy || (!!currentProfile?.has_pin && pin.length < MIN_PIN)} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-5" />
                Delete this profile
              </Button>
            )}
            <p className="text-sm text-muted">Deleting removes the profile from this list. Its image files stay on the server's disk.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-danger/15 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </Sheet>
    </>
  )
}
