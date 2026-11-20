import { ArrowLeft, CheckCircle2, ChevronDown, Circle, Folder, RefreshCw, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { historyImageUrl } from '@/api/client'
import { dayLabel, deleteImage, imageDay, isStarred, parseParams, toggleStar, type HistoryImage } from '@/api/images'
import { cleanModelName } from '@/api/models'
import { FolderList } from '@/components/FolderList'
import { ImageViewer } from '@/components/ImageViewer'
import { Button } from '@/components/ui/button'
import { useGallery } from '@/gallery-store'
import { cn } from '@/lib/utils'
import { useModels } from '@/models-store'
import { ASPECTS, closestAspect, useStore } from '@/store'

/** How many thumbnails to add each time the user scrolls near the end. */
const PAGE_SIZE = 60

/** A run of images made on the same day. `start` is the index of its first image in the full list. */
type DaySection = { day: string; start: number; images: HistoryImage[] }

/** Splits a newest-first image list into one section per day. */
function groupByDay(images: HistoryImage[]): DaySection[] {
  const sections: DaySection[] = []
  for (let i = 0; i < images.length; i++) {
    const day = imageDay(images[i])
    const last = sections[sections.length - 1]
    if (last && last.day == day) {
      last.images.push(images[i])
    }
    else {
      sections.push({ day, start: i, images: [images[i]] })
    }
  }
  return sections
}

/** Screen for browsing and managing saved images: a timeline by day, filtered to everything, starred, or one folder. */
export function GalleryScreen({ onBack }: { onBack: () => void }) {
  const { path, folder, starredOnly, batch, images, starred, loading, error, load } = useGallery()
  const [shown, setShown] = useState(PAGE_SIZE)
  const [viewing, setViewing] = useState<number | null>(null)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load()
  }, [load])

  // Show the first page again, from the top, whenever the view changes.
  useEffect(() => {
    setShown(PAGE_SIZE)
    scroller.current?.scrollTo(0, 0)
  }, [path])

  // Add another page of thumbnails when the end of the grid scrolls into view.
  useEffect(() => {
    const el = sentinel.current
    if (!el) {
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setShown((n) => n + PAGE_SIZE)
      }
    }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [images.length, shown])

  const sections = useMemo(() => groupByDay(images.slice(0, shown)), [images, shown])
  const inFolder = folder != ''

  /** Leaves selection mode and forgets what was selected. */
  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
    setConfirmDelete(false)
  }

  /** Switches the gallery to another view. */
  const show = (view: { folder?: string; starredOnly?: boolean; batch?: null }) => {
    stopSelecting()
    load(view)
  }

  /** Runs a change against the server, then reloads the list so it matches what is on disk. */
  const mutate = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await work()
    }
    catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
    await load()
    setBusy(false)
  }

  const onTapImage = (image: HistoryImage, index: number) => {
    if (!selecting) {
      setViewing(index)
      return
    }
    const next = new Set(selected)
    if (!next.delete(image.src)) {
      next.add(image.src)
    }
    setSelected(next)
    setConfirmDelete(false)
  }

  const deleteSelected = () =>
    mutate(async () => {
      for (const src of selected) {
        await deleteImage(src)
      }
    }).then(stopSelecting)

  /** Copies an image's settings to the Generate screen. */
  const reuse = (image: HistoryImage) => {
    const params = parseParams(image.metadata)
    if (!params) {
      return
    }
    const store = useStore.getState()
    const model = useModels.getState().checkpoints.find((m) => cleanModelName(m.name) == params.model)
    if (model) {
      store.selectModel(model)
    }
    const aspect = typeof params.aspectratio == 'string' && params.aspectratio in ASPECTS ? params.aspectratio : closestAspect(Number(params.width) || 1, Number(params.height) || 1)
    store.set({
      prompt: String(params.prompt ?? ''),
      negativePrompt: String(params.negativeprompt ?? ''),
      steps: Number(params.steps) || store.steps,
      cfgScale: Number(params.cfgscale) || store.cfgScale,
      seed: Number.isFinite(Number(params.seed)) ? Number(params.seed) : -1,
      aspect,
    })
    onBack()
  }

  const useAsStart = async (image: HistoryImage) => {
    if (await useStore.getState().startFromUrl(historyImageUrl(image.src))) {
      onBack()
    }
  }

  const chipClass = (active: boolean) =>
    cn('flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm', active ? 'bg-accent text-accent-fg' : 'bg-surface text-muted active:bg-raised')

  return (
    <div className="pt-safe mx-auto flex h-dvh max-w-xl flex-col">
      <header className="flex shrink-0 items-center gap-1 px-2">
        <Button variant="ghost" size="icon" aria-label="Back to Generate" onClick={onBack}>
          <ArrowLeft className="size-6" />
        </Button>
        <h1 className="min-w-0 flex-1 text-lg font-semibold">Gallery</h1>
        <Button variant="ghost" size="icon" aria-label="Refresh" disabled={loading} onClick={() => load()}>
          <RefreshCw className={cn('size-5', loading && 'animate-spin')} />
        </Button>
        <Button variant={selecting ? 'primary' : 'ghost'} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
          {selecting ? 'Done' : 'Select'}
        </Button>
      </header>

      <div role="group" aria-label="Show" className="flex shrink-0 gap-2 px-3 py-2">
        <button type="button" aria-pressed={!inFolder && !batch} onClick={() => show({ folder: '', batch: null })} className={chipClass(!inFolder && !batch)}>
          All
        </button>
        <button type="button" aria-pressed={inFolder} aria-haspopup="dialog" onClick={() => setFoldersOpen(true)} className={cn(chipClass(inFolder), 'min-w-0 shrink')}>
          <Folder className="size-4 shrink-0" />
          <span className="truncate">{inFolder ? (folder == 'raw' ? 'Default' : folder) : 'Folders'}</span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
        <button type="button" aria-pressed={starredOnly} aria-label="Starred only" onClick={() => show({ starredOnly: !starredOnly })} className={cn(chipClass(starredOnly), 'ml-auto')}>
          <Star className={cn('size-4', starredOnly && 'fill-current')} />
          Starred
        </button>
      </div>

      {batch && (
        <div className="mx-3 mb-2 flex min-h-11 items-center gap-2 rounded-2xl bg-accent/15 pr-1 pl-3.5 text-sm">
          <span className="min-w-0 flex-1 truncate">
            Batch: {batch.label || '(no prompt)'}
            <span className="ml-2 text-muted">{images.length}</span>
          </span>
          <Button variant="ghost" className="text-accent" onClick={() => show({ batch: null })}>
            Show all
          </Button>
        </div>
      )}

      {(error || actionError) && <p role="alert" className="mx-3 mb-2 rounded-xl bg-danger/15 p-3 text-sm text-danger">{error || actionError}</p>}

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">
        {!loading && !error && images.length == 0 && (
          <p className="px-8 py-16 text-center text-muted">{batch ? (starredOnly ? 'No starred images from this batch.' : 'No images from this batch are left.') : starredOnly ? (inFolder ? 'No starred images in this folder.' : 'No starred images yet.') : inFolder ? 'This folder is empty.' : 'No images yet.'}</p>
        )}
        {sections.map((section) => (
          <section key={`${section.day}-${section.start}`} aria-label={dayLabel(section.day)}>
            <h2 className="sticky top-0 z-10 bg-bg/90 px-2 py-2 text-sm font-semibold backdrop-blur">
              {dayLabel(section.day)}
              <span className="ml-2 font-normal text-muted">{section.images.length}</span>
            </h2>
            <ul className="grid grid-cols-3 gap-1">
              {section.images.map((image, offset) => {
                const index = section.start + offset
                const picked = selected.has(image.src)
                return (
                  <li key={image.src} className="relative aspect-square">
                    <button type="button" aria-label={selecting ? `Select image ${index + 1}` : `Open image ${index + 1}`} aria-pressed={selecting ? picked : undefined} onClick={() => onTapImage(image, index)} className="block size-full overflow-hidden rounded-md bg-surface">
                      <img src={historyImageUrl(image.src, true)} alt="" loading="lazy" className={cn('size-full object-cover transition-transform', picked && 'scale-90 rounded-md')} />
                    </button>
                    {(isStarred(image.src) || starred.has(image.src)) && !selecting && <Star className="pointer-events-none absolute top-1.5 right-1.5 size-4 fill-current text-accent drop-shadow" />}
                    {selecting && (
                      <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-full bg-black/50">
                        {picked ? <CheckCircle2 className="size-6 fill-accent text-white" /> : <Circle className="size-6 text-white/80" />}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {shown < images.length && <div ref={sentinel} className="h-10" />}
      </div>

      {selecting && (
        <div className="pb-safe flex shrink-0 gap-2 border-t border-line px-3 pt-2">
          {confirmDelete ? (
            <>
              <Button className="flex-1" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
              <Button className="flex-1" variant="danger" disabled={busy} onClick={deleteSelected}>
                <Trash2 className="size-5" />
                {busy ? 'Deleting…' : `Delete ${selected.size} for good`}
              </Button>
            </>
          ) : (
            <Button className="flex-1" variant="danger" disabled={selected.size == 0} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-5" />
              {selected.size == 0 ? 'Tap images to select' : `Delete ${selected.size} selected`}
            </Button>
          )}
        </div>
      )}

      <FolderList open={foldersOpen} onOpenChange={setFoldersOpen} current={folder} onChoose={(name) => show({ folder: name, batch: null })} />

      {viewing != null && images[viewing] && (
        <ImageViewer
          images={images}
          index={viewing}
          starred={isStarred(images[viewing].src) || starred.has(images[viewing].src)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onStar={(image) => {
            // Starring changes where the image is listed, so close the viewer and reload.
            setViewing(null)
            mutate(() => toggleStar(image.src))
          }}
          onDelete={(image) => {
            const next = images.length > 1 ? Math.min(viewing, images.length - 2) : null
            mutate(() => deleteImage(image.src)).then(() => setViewing(next))
          }}
          onReuse={reuse}
          onUseAsStart={useAsStart}
        />
      )}
    </div>
  )
}
