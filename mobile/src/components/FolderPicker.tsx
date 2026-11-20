import { CalendarDays, Check, Folder, FolderPlus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { cleanFolderName, isUserFolder, useGallery } from '@/gallery-store'
import { useStore } from '@/store'

/** Bottom sheet for choosing which folder new images are saved into, or making a new one. */
export function FolderPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const folder = useStore((s) => s.folder)
  const customFolders = useStore((s) => s.customFolders)
  const set = useStore((s) => s.set)
  const serverFolders = useGallery((s) => s.serverFolders)
  const loadFolders = useGallery((s) => s.loadFolders)
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')
  const cleaned = cleanFolderName(newName)

  useEffect(() => {
    if (open) {
      loadFolders()
    }
  }, [open, loadFolders])

  const folders = useMemo(
    () => [...new Set([...serverFolders.filter(isUserFolder), ...customFolders])].sort((a, b) => a.localeCompare(b)),
    [serverFolders, customFolders],
  )

  const q = query.trim().toLowerCase()
  const visible = folders.filter((name) => !q || name.toLowerCase().includes(q))

  /** Selects a folder and closes the sheet. */
  const choose = (name: string) => {
    set({ folder: name })
    onOpenChange(false)
  }

  /** Adds the typed folder and selects it. The folder appears on disk when the first image is saved into it. */
  const create = () => {
    if (!cleaned || !isUserFolder(cleaned)) {
      return
    }
    if (!folders.includes(cleaned)) {
      set({ customFolders: [...customFolders, cleaned] })
    }
    setNewName('')
    choose(cleaned)
  }

  const rowClass = (active: boolean) =>
    cn('flex min-h-13 w-full items-center gap-3 rounded-2xl px-3.5 text-left active:bg-line', active ? 'bg-accent/15 ring-1 ring-accent' : 'bg-raised')

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Save new images to">
      {folders.length > 8 && (
        <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl bg-raised px-3">
          <Search className="size-4.5 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folders"
            aria-label="Search folders"
            className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-muted"
          />
        </label>
      )}
      <ul className="flex flex-col gap-1.5">
        <li>
          <button type="button" aria-pressed={folder == ''} onClick={() => choose('')} className={rowClass(folder == '')}>
            <CalendarDays className="size-5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Default</span>
              <span className="block text-sm text-muted">Sorted into a folder per day</span>
            </span>
            {folder == '' && <Check className="size-5 shrink-0 text-accent" />}
          </button>
        </li>
        {visible.map((name) => (
          <li key={name}>
            <button type="button" aria-pressed={folder == name} onClick={() => choose(name)} className={rowClass(folder == name)}>
              <Folder className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              {folder == name && <Check className="size-5 shrink-0 text-accent" />}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New folder name"
          aria-label="New folder name"
          enterKeyHint="done"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-raised px-3 outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
        <Button type="submit" variant="primary" disabled={!cleaned || !isUserFolder(cleaned)}>
          <FolderPlus className="size-5" />
          Create
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted">Letters, numbers, spaces, dashes and underscores.</p>
    </Sheet>
  )
}
