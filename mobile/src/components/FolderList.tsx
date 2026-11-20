import { Check, Folder, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { historyImageUrl } from '@/api/client'
import { Sheet } from '@/components/ui/sheet'
import { isUserFolder, useGallery } from '@/gallery-store'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

/** Show the search box once there are more folders than fit on one screen without scrolling. */
const SEARCH_THRESHOLD = 8

/** Full-height sheet listing every folder with a cover image and count, for choosing which one the gallery shows. */
export function FolderList({ open, onOpenChange, current, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; current: string; onChoose: (folder: string) => void }) {
  const serverFolders = useGallery((s) => s.serverFolders)
  const folderInfo = useGallery((s) => s.folderInfo)
  const customFolders = useStore((s) => s.customFolders)
  const [query, setQuery] = useState('')

  const folders = useMemo(() => {
    const user = [...new Set([...serverFolders.filter(isUserFolder), ...customFolders])].sort((a, b) => a.localeCompare(b))
    // "raw" is where SwarmUI's default layout saves, one subfolder per day; show it first under a plain name.
    return [{ path: 'raw', label: 'Default (by day)' }, ...user.map((name) => ({ path: name, label: name }))]
  }, [serverFolders, customFolders])

  const q = query.trim().toLowerCase()
  const visible = folders.filter((f) => !q || f.label.toLowerCase().includes(q))

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Folders" size="full">
      {folders.length > SEARCH_THRESHOLD && (
        <label className="sticky top-0 z-10 mb-3 flex min-h-11 items-center gap-2 rounded-xl bg-raised px-3">
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
      {visible.length == 0 && <p className="py-10 text-center text-muted">No folders match "{query}".</p>}
      <ul className="flex flex-col gap-1.5">
        {visible.map((folder) => {
          const info = folderInfo[folder.path]
          const active = folder.path == current
          return (
            <li key={folder.path}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChoose(folder.path)
                  onOpenChange(false)
                }}
                className={cn('flex w-full items-center gap-3 rounded-2xl p-2 text-left active:bg-line', active ? 'bg-accent/15 ring-1 ring-accent' : 'bg-raised')}
              >
                {info ? (
                  <img src={historyImageUrl(info.cover, true)} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl bg-surface object-cover" />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
                    <Folder className="size-6" strokeWidth={1.5} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{folder.label}</span>
                  <span className="block text-sm text-muted">{info ? `${info.count} ${info.count == 1 ? 'image' : 'images'}` : 'Empty'}</span>
                </span>
                {active && <Check className="mr-1 size-5 shrink-0 text-accent" />}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
